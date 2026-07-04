import { ConvexError, v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { MAX_NAME, MAX_TITLE, clean, requireRoom } from "./lib";
import {
  decide,
  computeSpin,
  pickTop,
  insertOption,
  toggleVoteCore,
  randomRoomName,
} from "./rooms";

/**
 * Munch as a Telegram bot: the group chat IS the room.
 *
 *  - /munch posts a live "session message" with one vote button per option;
 *    the bot edits it in place as options and votes come in.
 *  - Members add options with /add or by replying to the session message.
 *  - The starter (host) runs /spin, /lock, or /end.
 *  - Participants map onto the web identity scheme as clientId "tg:<user id>",
 *    so options/votes reuse the exact same tables and rules as the web app.
 *
 * Updates arrive on the /telegram HTTP route (http.ts), which verifies the
 * webhook secret and hands the raw update to `handleUpdate`.
 */

// —— Telegram wire types (just the fields we read) ——
type TgUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};
type TgChat = { id: number; type: string; title?: string };
type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  reply_to_message?: { message_id: number };
  new_chat_members?: TgUser[];
  migrate_to_chat_id?: number;
};
type TgCallbackQuery = { id: string; from: TgUser; data?: string };
type TgUpdate = { message?: TgMessage; callback_query?: TgCallbackQuery };

const SPIN_SUSPENSE_MS = 4000; // drumroll before the winner is revealed

// —— Small helpers ——

/** Deployment env vars, via globalThis so the frontend tsconfig (which
 *  type-imports this module through _generated/api) needs no Node globals. */
export function deployEnv(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

/** Telegram users fold into the web identity scheme as "tg:<user id>". */
const tgClientId = (userId: number) => `tg:${userId}`;

function displayName(from: TgUser): string {
  const full = [from.first_name, from.last_name].filter(Boolean).join(" ");
  return clean(full, MAX_NAME) || clean(from.username ?? "", MAX_NAME) || "Someone";
}

function botToken(): string {
  const token = deployEnv().TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is not set — npx convex env set TELEGRAM_BOT_TOKEN <token from @BotFather>",
    );
  }
  return token;
}

/** The bot's own user id — the token is "<bot id>:<secret>". */
const botId = () => Number(botToken().split(":")[0]);

/** Call the Bot API. Returns the result, or null on failure (logged, never
 *  thrown — a failed edit must not take down webhook handling). */
async function tg(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: unknown;
    description?: string;
  } | null;
  if (!body?.ok) {
    const desc = body?.description ?? `HTTP ${res.status}`;
    // Re-rendering identical content is a no-op, not a problem.
    if (!desc.includes("message is not modified")) {
      console.warn(`Telegram ${method} failed: ${desc}`);
    }
    return null;
  }
  return body.result;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(query)}`;
}

const HELP = [
  "🍽 <b>Munch</b> — decide where to eat, right here in the chat.",
  "",
  "/munch <i>[title]</i> — start a round",
  "/add <i>place or craving</i> — add an option (or just reply to the munch message)",
  "Tap an option's button to vote; tap again to unvote.",
  "/remove <i>text</i> — remove an option you added",
  "/spin — spin the wheel 🎡 (starter only)",
  "/lock — lock in the top pick 🔒 (starter only)",
  "/end — close the round (starter only)",
].join("\n");

const PRIVATE_HELP =
  "🍽 <b>Munch</b> works inside a group chat — add me to the group where your " +
  "crew argues about food, then send /munch there.\n\n" + HELP;

// —— DB helpers (shared by the internal mutations/queries below) ——

/** The one live session in a chat, if any (newest un-closed Telegram room). */
async function activeSession(ctx: QueryCtx | MutationCtx, chatId: number) {
  const rooms = await ctx.db
    .query("rooms")
    .withIndex("by_tg_chat", (q) => q.eq("tgChatId", chatId))
    .collect();
  const open = rooms.filter((r) => !r.closedAt);
  open.sort((a, b) => b.createdAt - a.createdAt);
  return open[0] ?? null;
}

async function requireSession(ctx: QueryCtx | MutationCtx, chatId: number) {
  const room = await activeSession(ctx, chatId);
  if (!room) throw new ConvexError("No munch running here — start one with /munch.");
  return room;
}

/** Host = the Telegram user who ran /munch. The single host gate for the bot. */
async function requireTgHost(ctx: MutationCtx, chatId: number, tgUserId: number) {
  const room = await requireSession(ctx, chatId);
  if (room.tgHostUserId !== tgUserId) {
    throw new ConvexError("Only the person who started this munch can do that.");
  }
  return room;
}

async function roomOptions(ctx: QueryCtx | MutationCtx, roomId: Id<"rooms">) {
  const options = await ctx.db
    .query("options")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  options.sort((a, b) => b.voteCount - a.voteCount || a.createdAt - b.createdAt);
  return options;
}

// —— Internal queries ——

/** Everything the action layer needs to render the session message. */
export const sessionState = internalQuery({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.tgChatId === undefined) return null;
    const options = await roomOptions(ctx, roomId);
    const winner = room.winnerOptionId
      ? (options.find((o) => o._id === room.winnerOptionId) ?? null)
      : null;
    return { room, options, winner };
  },
});

/** The live session for a chat — lets the action route replies and commands. */
export const activeRoom = internalQuery({
  args: { chatId: v.number() },
  handler: async (ctx, { chatId }) => activeSession(ctx, chatId),
});

// —— Internal mutations ——

/** /munch — create a session, or hand back the one already running. */
export const startSession = internalMutation({
  args: {
    chatId: v.number(),
    chatTitle: v.optional(v.string()),
    hostTgUserId: v.number(),
    hostName: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await activeSession(ctx, args.chatId);
    if (existing) {
      return { roomId: existing._id, existing: true, oldMessageId: existing.tgMessageId };
    }
    const roomId = await ctx.db.insert("rooms", {
      // Rooms started in Telegram still get a share code, so the same room can
      // open on the web (and later inside a Mini App) with zero migration.
      code: crypto.randomUUID(),
      title:
        clean(args.title ?? "", MAX_TITLE) ||
        clean(args.chatTitle ?? "", MAX_TITLE) ||
        randomRoomName(),
      hostName: clean(args.hostName, MAX_NAME) || "Host",
      tgChatId: args.chatId,
      tgHostUserId: args.hostTgUserId,
      phase: "collecting",
      createdAt: Date.now(),
    });
    return { roomId, existing: false, oldMessageId: undefined };
  },
});

/** Remember which chat message is the live session message (edited in place). */
export const setSessionMessage = internalMutation({
  args: { roomId: v.id("rooms"), messageId: v.number() },
  handler: async (ctx, { roomId, messageId }) => {
    await ctx.db.patch(roomId, { tgMessageId: messageId });
  },
});

export const addFromTg = internalMutation({
  args: { chatId: v.number(), tgUserId: v.number(), name: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const room = await requireSession(ctx, args.chatId);
    const { text, emoji } = await insertOption(ctx, room, {
      text: args.text,
      name: args.name,
      clientId: tgClientId(args.tgUserId),
    });
    return { roomId: room._id, text, emoji };
  },
});

export const voteFromTg = internalMutation({
  args: { optionId: v.string(), tgUserId: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    // The id rides in callback_data, so it arrives as an untrusted string.
    const optionId = ctx.db.normalizeId("options", args.optionId);
    if (!optionId) throw new ConvexError("That option's gone.");
    const { voted, option } = await toggleVoteCore(
      ctx,
      optionId,
      tgClientId(args.tgUserId),
      args.name,
    );
    return { roomId: option.roomId, voted, label: `${option.emoji} ${option.text}` };
  },
});

export const removeFromTg = internalMutation({
  args: { chatId: v.number(), tgUserId: v.number(), text: v.string() },
  handler: async (ctx, args) => {
    const room = await requireSession(ctx, args.chatId);
    if (room.phase !== "collecting") throw new ConvexError("Can't change options mid-decision.");
    const options = await roomOptions(ctx, room._id);
    const needle = args.text.trim().toLowerCase();
    const option = options.find((o) => o.text.toLowerCase() === needle);
    if (!option) throw new ConvexError(`Couldn't find "${args.text.trim()}" on the list.`);
    const isHost = room.tgHostUserId === args.tgUserId;
    if (option.addedByClientId !== tgClientId(args.tgUserId) && !isHost) {
      throw new ConvexError("You can only remove options you added.");
    }
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_option", (q) => q.eq("optionId", option._id))
      .collect();
    await Promise.all(votes.map((vote) => ctx.db.delete(vote._id)));
    await ctx.db.delete(option._id);
    return { roomId: room._id, removed: option.text };
  },
});

/** /spin or /lock — same decision logic as the web app, host-gated by
 *  Telegram user id instead of Convex Auth. */
export const decideFromTg = internalMutation({
  args: {
    chatId: v.number(),
    tgUserId: v.number(),
    mode: v.union(v.literal("spin"), v.literal("lock")),
  },
  handler: async (ctx, args) => {
    const room = await requireTgHost(ctx, args.chatId, args.tgUserId);
    const options = await roomOptions(ctx, room._id);
    if (options.length === 0) throw new ConvexError("Add at least one option first.");

    if (args.mode === "spin") {
      const { winner, spinAngle, wheelOptionIds } = computeSpin(options);
      await decide(ctx, room, {
        mode: "spin",
        winnerId: winner._id,
        votes: winner.voteCount,
        spinAngle,
        wheelOptionIds,
      });
    } else {
      const winner = pickTop(options);
      await decide(ctx, room, { mode: "lock", winnerId: winner._id, votes: winner.voteCount });
    }
    return { roomId: room._id, tgMessageId: room.tgMessageId };
  },
});

export const closeFromTg = internalMutation({
  args: { chatId: v.number(), tgUserId: v.number() },
  handler: async (ctx, args) => {
    const room = await requireTgHost(ctx, args.chatId, args.tgUserId);
    await ctx.db.patch(room._id, { closedAt: Date.now() });
    return { roomId: room._id };
  },
});

/** Host action arriving from the Mini App, addressed by room code (the Mini
 *  App doesn't know chat ids). The caller (miniAppHostAction) has already
 *  verified the Telegram identity against the signed initData. */
export const hostActionByCode = internalMutation({
  args: {
    code: v.string(),
    tgUserId: v.number(),
    act: v.union(v.literal("spin"), v.literal("lock"), v.literal("end")),
  },
  handler: async (ctx, { code, tgUserId, act }) => {
    const room = await requireRoom(ctx, code);
    if (room.tgHostUserId === undefined || room.tgHostUserId !== tgUserId) {
      throw new ConvexError("Only the person who started this munch can do that.");
    }
    if (room.closedAt) throw new ConvexError("This room is closed.");

    if (act === "end") {
      await ctx.db.patch(room._id, { closedAt: Date.now() });
      return { roomId: room._id, tgMessageId: room.tgMessageId };
    }

    const options = await roomOptions(ctx, room._id);
    if (options.length === 0) throw new ConvexError("Add at least one option first.");
    if (act === "spin") {
      const { winner, spinAngle, wheelOptionIds } = computeSpin(options);
      await decide(ctx, room, {
        mode: "spin",
        winnerId: winner._id,
        votes: winner.voteCount,
        spinAngle,
        wheelOptionIds,
      });
    } else {
      const winner = pickTop(options);
      await decide(ctx, room, { mode: "lock", winnerId: winner._id, votes: winner.voteCount });
    }
    return { roomId: room._id, tgMessageId: room.tgMessageId };
  },
});

/** Telegram renumbers a chat when a group upgrades to a supergroup. */
export const migrateChat = internalMutation({
  args: { fromChatId: v.number(), toChatId: v.number() },
  handler: async (ctx, { fromChatId, toChatId }) => {
    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_tg_chat", (q) => q.eq("tgChatId", fromChatId))
      .collect();
    await Promise.all(rooms.map((r) => ctx.db.patch(r._id, { tgChatId: toChatId })));
  },
});

// —— Rendering ——

type SessionState = {
  room: Doc<"rooms">;
  options: Doc<"options">[];
  winner: Doc<"options"> | null;
};

function resultText(state: SessionState): string {
  const { room, winner } = state;
  if (!winner) return "🔒 This munch is closed.";
  const votes = room.decidedVotes ?? 0;
  const lines = [
    `🎉 <b>${esc(winner.text)}</b> it is!`,
    room.mode === "spin"
      ? "The wheel has spoken 🎡"
      : `Locked in with ${votes} vote${votes === 1 ? "" : "s"} 🔒`,
  ];
  if (winner.suggestedSpot) {
    lines.push(`😋 Try: <a href="${mapsUrl(winner.suggestedSpot)}">${esc(winner.suggestedSpot)}</a>`);
  } else if (winner.kind === "place") {
    lines.push(`📍 <a href="${mapsUrl(winner.text)}">Open in Maps</a>`);
  }
  return lines.join("\n");
}

/** The live session message: status text + one vote button per option. */
function renderSession(state: SessionState): {
  text: string;
  reply_markup?: Record<string, unknown>;
} {
  const { room, options } = state;

  if (room.closedAt) {
    const tally = options
      .slice(0, 5)
      .map((o) => `${o.emoji} ${esc(o.text)} — ${o.voteCount}`)
      .join("\n");
    return {
      text: `🍽 <b>${esc(room.title)}</b>\n\n${resultText(state)}${tally ? `\n\n<i>Final tally</i>\n${tally}` : ""}`,
    };
  }

  const header = `🍽 <b>${esc(room.title)}</b>\n<i>started by ${esc(room.hostName)}</i>`;
  const body =
    options.length === 0
      ? "No options yet — add one with <code>/add ramen</code> or just reply to this message."
      : "Tap an option to vote — tap again to unvote. Add more with /add or by replying here.";
  const footer = `<i>${esc(room.hostName)} decides with /spin 🎡 or /lock 🔒</i>`;

  const rows: unknown[][] = options.map((o) => [
    { text: `${o.emoji} ${o.text} · ${o.voteCount}`, callback_data: `v:${o._id}` },
  ]);
  // Prefer the Mini App (opens in-place over the chat, carries the room code
  // via startapp); fall back to the plain web link while no Mini App is
  // registered with BotFather.
  const miniAppLink = deployEnv().TELEGRAM_MINIAPP_LINK; // e.g. https://t.me/MunchBot/munch
  const siteUrl = deployEnv().SITE_URL;
  if (miniAppLink) {
    rows.push([
      { text: "🎡 Open Munch", url: `${miniAppLink.replace(/\/$/, "")}?startapp=${room.code}` },
    ]);
  } else if (siteUrl) {
    rows.push([{ text: "🌐 Open on the web", url: `${siteUrl.replace(/\/$/, "")}/r/${room.code}` }]);
  }

  return {
    text: `${header}\n\n${body}\n\n${footer}`,
    reply_markup: { inline_keyboard: rows },
  };
}

/** Re-render the session message in place after any state change. */
async function refreshSessionMessage(ctx: ActionCtx, roomId: Id<"rooms">) {
  const state = await ctx.runQuery(internal.telegram.sessionState, { roomId });
  if (!state || state.room.tgChatId === undefined || state.room.tgMessageId === undefined) return;
  const { text, reply_markup } = renderSession(state);
  await tg("editMessageText", {
    chat_id: state.room.tgChatId,
    message_id: state.room.tgMessageId,
    text,
    parse_mode: "HTML",
    ...(reply_markup ? { reply_markup } : {}),
    link_preview_options: { is_disabled: true },
  });
}

/** Final render + a fresh announcement message (a new message notifies the
 *  chat; an edit wouldn't). Runs via the scheduler after the spin drumroll. */
async function announce(ctx: ActionCtx, roomId: Id<"rooms">) {
  const state = await ctx.runQuery(internal.telegram.sessionState, { roomId });
  if (!state || state.room.tgChatId === undefined) return;
  await refreshSessionMessage(ctx, roomId);
  if (state.winner) {
    await tg("sendMessage", {
      chat_id: state.room.tgChatId,
      text: resultText(state),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  }
}

export const announceResult = internalAction({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    await announce(ctx, roomId);
  },
});

// —— Mini App ——

async function hmacSha256(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

const INIT_DATA_MAX_AGE_S = 24 * 60 * 60;

/** Verify a Mini App's signed initData (HMAC chain per Telegram's spec) and
 *  return the authenticated user. This is what makes Mini App host actions
 *  trustworthy — the client can't forge who it is. */
async function verifyInitData(initData: string): Promise<TgUser> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new ConvexError("Open this from your Telegram chat.");
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, value]) => `${k}=${value}`)
    .join("\n");

  const secret = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken());
  const signature = await hmacSha256(secret, dataCheckString);
  const hex = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== hash) throw new ConvexError("Couldn't verify your Telegram session.");

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_S) {
    throw new ConvexError("This session expired — reopen Munch from the chat.");
  }
  const user = JSON.parse(params.get("user") ?? "null") as TgUser | null;
  if (!user?.id) throw new ConvexError("Couldn't verify your Telegram session.");
  return user;
}

/** Spin / lock / end from inside the Mini App. Verifies the signed Telegram
 *  identity, applies the decision, then mirrors the chat-side effects the
 *  equivalent /spin, /lock, /end commands would have. */
export const miniAppHostAction = action({
  args: {
    initData: v.string(),
    code: v.string(),
    act: v.union(v.literal("spin"), v.literal("lock"), v.literal("end")),
  },
  handler: async (ctx, { initData, code, act }) => {
    const user = await verifyInitData(initData);
    const res = await ctx.runMutation(internal.telegram.hostActionByCode, {
      code,
      tgUserId: user.id,
      act,
    });
    if (act === "spin") {
      // Wheel is animating in the Mini App — drumroll the chat, reveal after.
      if (res.tgMessageId !== undefined) {
        const state = await ctx.runQuery(internal.telegram.sessionState, { roomId: res.roomId });
        if (state?.room.tgChatId !== undefined) {
          await tg("editMessageText", {
            chat_id: state.room.tgChatId,
            message_id: res.tgMessageId,
            text: "🥁 Spinning the wheel…",
          });
        }
      }
      await ctx.scheduler.runAfter(SPIN_SUSPENSE_MS, internal.telegram.announceResult, {
        roomId: res.roomId,
      });
    } else if (act === "lock") {
      await announce(ctx, res.roomId);
    } else {
      await refreshSessionMessage(ctx, res.roomId);
    }
  },
});

// —— Update handling ——

/** Run a step; on a friendly ConvexError, reply it into the chat. */
async function replyOnError(chatId: number, replyToMessageId: number, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    const text =
      err instanceof ConvexError ? String(err.data) : "Something went wrong — try again.";
    if (!(err instanceof ConvexError)) console.error("telegram handler failed", err);
    await tg("sendMessage", {
      chat_id: chatId,
      text,
      reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true },
    });
  }
}

/** Quiet "got it" on the user's own message, e.g. 👍 on a successful /add. */
async function react(chatId: number, messageId: number, emoji: string) {
  await tg("setMessageReaction", {
    chat_id: chatId,
    message_id: messageId,
    reaction: [{ type: "emoji", emoji }],
  });
}

function parseCommand(text: string): { name: string; args: string } | null {
  const m = /^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]+))?$/.exec(text);
  return m ? { name: m[1].toLowerCase(), args: (m[2] ?? "").trim() } : null;
}

async function onCallback(ctx: ActionCtx, cb: TgCallbackQuery) {
  const data = cb.data ?? "";
  if (!data.startsWith("v:")) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    return;
  }
  try {
    const res = await ctx.runMutation(internal.telegram.voteFromTg, {
      optionId: data.slice(2),
      tgUserId: cb.from.id,
      name: displayName(cb.from),
    });
    await Promise.all([
      tg("answerCallbackQuery", {
        callback_query_id: cb.id,
        text: res.voted ? `Voted for ${res.label}` : `Vote removed from ${res.label}`,
      }),
      refreshSessionMessage(ctx, res.roomId),
    ]);
  } catch (err) {
    await tg("answerCallbackQuery", {
      callback_query_id: cb.id,
      text: err instanceof ConvexError ? String(err.data) : "Something went wrong — try again.",
    });
  }
}

async function onMessage(ctx: ActionCtx, msg: TgMessage) {
  const chat = msg.chat;

  if (msg.migrate_to_chat_id !== undefined) {
    await ctx.runMutation(internal.telegram.migrateChat, {
      fromChatId: chat.id,
      toChatId: msg.migrate_to_chat_id,
    });
    return;
  }

  const isGroup = chat.type === "group" || chat.type === "supergroup";

  // Introduce ourselves when added to a group.
  if (isGroup && msg.new_chat_members?.some((m) => m.id === botId())) {
    await tg("sendMessage", { chat_id: chat.id, text: HELP, parse_mode: "HTML" });
    return;
  }

  const text = (msg.text ?? "").trim();
  if (!text || !msg.from || msg.from.is_bot) return;
  const from = msg.from;
  const name = displayName(from);
  const cmd = parseCommand(text);

  if (!isGroup) {
    // Private chats are just an onboarding surface.
    await tg("sendMessage", { chat_id: chat.id, text: PRIVATE_HELP, parse_mode: "HTML" });
    return;
  }

  // Plain text only counts as an add when it replies to the live session message.
  if (!cmd) {
    if (!msg.reply_to_message) return;
    const room = await ctx.runQuery(internal.telegram.activeRoom, { chatId: chat.id });
    if (!room || room.tgMessageId !== msg.reply_to_message.message_id) return;
    await replyOnError(chat.id, msg.message_id, async () => {
      const res = await ctx.runMutation(internal.telegram.addFromTg, {
        chatId: chat.id,
        tgUserId: from.id,
        name,
        text,
      });
      await Promise.all([react(chat.id, msg.message_id, "👍"), refreshSessionMessage(ctx, res.roomId)]);
    });
    return;
  }

  switch (cmd.name) {
    case "start":
    case "help":
      await tg("sendMessage", { chat_id: chat.id, text: HELP, parse_mode: "HTML" });
      return;

    case "munch":
      await replyOnError(chat.id, msg.message_id, async () => {
        const res = await ctx.runMutation(internal.telegram.startSession, {
          chatId: chat.id,
          ...(chat.title ? { chatTitle: chat.title } : {}),
          hostTgUserId: from.id,
          hostName: name,
          ...(cmd.args ? { title: cmd.args } : {}),
        });
        // (Re)post the session message so it's the newest thing in the chat.
        const state = await ctx.runQuery(internal.telegram.sessionState, { roomId: res.roomId });
        if (!state) return;
        const { text: body, reply_markup } = renderSession(state);
        const sent = (await tg("sendMessage", {
          chat_id: chat.id,
          text: body,
          parse_mode: "HTML",
          ...(reply_markup ? { reply_markup } : {}),
          link_preview_options: { is_disabled: true },
        })) as { message_id?: number } | null;
        if (sent?.message_id) {
          await ctx.runMutation(internal.telegram.setSessionMessage, {
            roomId: res.roomId,
            messageId: sent.message_id,
          });
          // Point the superseded copy at the new one so stale buttons don't linger.
          if (res.oldMessageId && res.oldMessageId !== sent.message_id) {
            await tg("editMessageText", {
              chat_id: chat.id,
              message_id: res.oldMessageId,
              text: "⬇️ This munch moved to a newer message below.",
            });
          }
        }
      });
      return;

    case "add":
      await replyOnError(chat.id, msg.message_id, async () => {
        if (!cmd.args) throw new ConvexError("Usage: /add ramen (or /add Taco Bell)");
        const res = await ctx.runMutation(internal.telegram.addFromTg, {
          chatId: chat.id,
          tgUserId: from.id,
          name,
          text: cmd.args,
        });
        await Promise.all([react(chat.id, msg.message_id, "👍"), refreshSessionMessage(ctx, res.roomId)]);
      });
      return;

    case "remove":
      await replyOnError(chat.id, msg.message_id, async () => {
        if (!cmd.args) throw new ConvexError("Usage: /remove ramen");
        const res = await ctx.runMutation(internal.telegram.removeFromTg, {
          chatId: chat.id,
          tgUserId: from.id,
          text: cmd.args,
        });
        await Promise.all([react(chat.id, msg.message_id, "👌"), refreshSessionMessage(ctx, res.roomId)]);
      });
      return;

    case "spin":
      await replyOnError(chat.id, msg.message_id, async () => {
        const res = await ctx.runMutation(internal.telegram.decideFromTg, {
          chatId: chat.id,
          tgUserId: from.id,
          mode: "spin",
        });
        // Drumroll on the session message, then reveal after the suspense beat.
        if (res.tgMessageId !== undefined) {
          await tg("editMessageText", {
            chat_id: chat.id,
            message_id: res.tgMessageId,
            text: "🥁 Spinning the wheel…",
          });
        }
        await ctx.scheduler.runAfter(SPIN_SUSPENSE_MS, internal.telegram.announceResult, {
          roomId: res.roomId,
        });
      });
      return;

    case "lock":
      await replyOnError(chat.id, msg.message_id, async () => {
        const res = await ctx.runMutation(internal.telegram.decideFromTg, {
          chatId: chat.id,
          tgUserId: from.id,
          mode: "lock",
        });
        await announce(ctx, res.roomId);
      });
      return;

    case "end":
      await replyOnError(chat.id, msg.message_id, async () => {
        const res = await ctx.runMutation(internal.telegram.closeFromTg, {
          chatId: chat.id,
          tgUserId: from.id,
        });
        await refreshSessionMessage(ctx, res.roomId);
      });
      return;

    default:
      // Not ours (or a typo) — stay quiet in the group.
      return;
  }
}

/** Entry point: one Telegram update, dispatched. Never throws — the webhook
 *  must always 200, or Telegram re-delivers the same update in a retry storm. */
export const handleUpdate = internalAction({
  args: { update: v.any() },
  handler: async (ctx, { update }) => {
    const u = update as TgUpdate;
    try {
      if (u.callback_query) await onCallback(ctx, u.callback_query);
      else if (u.message) await onMessage(ctx, u.message);
    } catch (err) {
      console.error("telegram update failed", err);
    }
  },
});
