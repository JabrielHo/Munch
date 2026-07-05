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
import {
  MAX_NAME,
  MAX_TITLE,
  OLD_ROUND_CLOSE_MS,
  byVotesDesc,
  clean,
  mapsUrl,
  requireRoom,
  tgFullName,
  voteWord,
} from "./lib";
import { decide, computeSpin, pickTop, randomRoomName } from "./rooms";

/**
 * Munch as a Telegram bot, app-first: the chat is the notice board, the Mini
 * App is where everything happens.
 *
 *  - /munch posts a live "session message": the round's title, a vote tally
 *    that the bot edits in place, and one button — 🎡 Open Munch. A chat can
 *    run several rounds at once, each on its own message, live until decided
 *    or ended.
 *  - Adding, voting, and the host's spin/lock/end all live in the Mini App
 *    (participants are clientId "tg:<user id>"; host actions verify Telegram's
 *    signed initData). App activity re-renders the tally via a debounced
 *    refresh scheduled from the room mutations (see scheduleChatRefresh in
 *    rooms.ts).
 *  - The winner is announced back into the chat, so people who never open the
 *    app still see the outcome.
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
  new_chat_members?: TgUser[];
  migrate_to_chat_id?: number;
};
type TgCallbackQuery = { id: string; from: TgUser; data?: string };
type TgUpdate = { message?: TgMessage; callback_query?: TgCallbackQuery };

const SPIN_SUSPENSE_MS = 4000; // drumroll before the winner is revealed
const TALLY_MAX = 8; // options shown in the chat scoreboard
// /munch always starts a new round — a chat can run several at once, each on
// its own live scoreboard message, and rounds stay live until decided or
// ended. One guard keeps that sane: a group racing to type /munch merges
// into ONE round instead of N.
const MUNCH_MERGE_WINDOW_MS = 90 * 1000;

// —— Small helpers ——

/** Deployment env vars, via globalThis so the frontend tsconfig (which
 *  type-imports this module through _generated/api) needs no Node globals. */
export function deployEnv(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function displayName(from: TgUser): string {
  return clean(tgFullName(from), MAX_NAME) || "Someone";
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

const HELP = [
  "🍽 <b>Munch</b> — decide where to eat, without leaving the chat.",
  "",
  "/munch <i>[title]</i> — start a round (run it again for another; each round lives on its own message)",
  "",
  "Then tap 🎡 <b>Open Munch</b> on a round's message: add cravings, vote, and — if you started the round — spin the wheel or lock the top pick. The tally updates here live, and the winner lands right back in the chat.",
].join("\n");

const PRIVATE_HELP =
  "🍽 <b>Munch</b> works inside a group chat — add me to the group where your " +
  "crew argues about food, then send /munch there.\n\n" + HELP;

// —— DB helpers (shared by the internal mutations/queries below) ——

/** The newest open round in a chat (several may be live; this is only used to
 *  merge near-simultaneous /munch races). closedAt is part of the index, so
 *  this never touches the chat's ever-growing pile of closed rounds. */
async function newestOpenRound(ctx: QueryCtx | MutationCtx, chatId: number) {
  return ctx.db
    .query("rooms")
    .withIndex("by_tg_chat", (q) => q.eq("tgChatId", chatId).eq("closedAt", undefined))
    .order("desc")
    .first();
}

const HOST_ACT = v.union(v.literal("spin"), v.literal("lock"), v.literal("end"));

/** The one host-action implementation. Only reachable through the Mini App,
 *  whose caller has already verified the Telegram identity against the signed
 *  initData. Permission model: spin/lock are the starter's alone; "end" is the
 *  starter's anytime — and, because rounds never auto-expire, ANYONE's once
 *  the round has grown old (the History screen's cleanup power). */
async function applyHostAction(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  tgUserId: number,
  act: "spin" | "lock" | "end",
) {
  if (room.closedAt) throw new ConvexError("This room is closed.");
  const isStarter = room.tgHostUserId === tgUserId;

  if (act === "end") {
    if (!isStarter && Date.now() - room.createdAt < OLD_ROUND_CLOSE_MS) {
      throw new ConvexError(
        "Only the person who started this round can close it — anyone can, once it's a day old.",
      );
    }
    await ctx.db.patch(room._id, { closedAt: Date.now() });
  } else {
    if (!isStarter) {
      throw new ConvexError("Only the person who started this munch can do that.");
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
  }
  return { roomId: room._id, tgChatId: room.tgChatId, tgMessageId: room.tgMessageId };
}

async function roomOptions(ctx: QueryCtx | MutationCtx, roomId: Id<"rooms">) {
  const options = await ctx.db
    .query("options")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  options.sort(byVotesDesc);
  return options;
}

// —— Internal queries ——

/** Everything the action layer needs to render the session message. */
export const sessionState = internalQuery({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room) return null;
    const options = await roomOptions(ctx, roomId);
    const winner = room.winnerOptionId
      ? (options.find((o) => o._id === room.winnerOptionId) ?? null)
      : null;
    return { room, options, winner };
  },
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
    // Merge a /munch race: several people starting "the" round within seconds
    // of each other mean one round, not several.
    const latest = await newestOpenRound(ctx, args.chatId);
    if (latest && Date.now() - latest.createdAt < MUNCH_MERGE_WINDOW_MS) {
      return { roomId: latest._id, reusedMessageId: latest.tgMessageId };
    }
    const roomId = await ctx.db.insert("rooms", {
      // The code rides in the Open Munch button's startapp param — it's how
      // the Mini App finds this room.
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
    return { roomId, reusedMessageId: undefined };
  },
});

/** Remember which chat message is the live session message (edited in place). */
export const setSessionMessage = internalMutation({
  args: { roomId: v.id("rooms"), messageId: v.number() },
  handler: async (ctx, { roomId, messageId }) => {
    await ctx.db.patch(roomId, { tgMessageId: messageId });
  },
});

/** Mini App host actions, addressed by room code (the Mini App doesn't know
 *  chat ids). The caller (miniAppHostAction) has already verified identity. */
export const hostActionByCode = internalMutation({
  args: { code: v.string(), tgUserId: v.number(), act: HOST_ACT },
  handler: async (ctx, { code, tgUserId, act }) => {
    const room = await requireRoom(ctx, code);
    return applyHostAction(ctx, room, tgUserId, act);
  },
});

/** Consumes the debounce flag set by scheduleChatRefresh (rooms.ts). Cleared
 *  BEFORE rendering, so activity landing mid-render schedules a fresh pass. */
export const clearRefreshPending = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    await ctx.db.patch(roomId, { tgRefreshPending: undefined });
  },
});

/** Debounced re-render of the chat scoreboard after Mini App activity. */
export const refreshSession = internalAction({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    await ctx.runMutation(internal.telegram.clearRefreshPending, { roomId });
    await refreshSessionMessage(ctx, roomId);
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
      : `Locked in with ${votes} ${voteWord(votes)} 🔒`,
  ];
  if (winner.suggestedSpot) {
    lines.push(
      `😋 Try: <a href="${esc(mapsUrl(winner.suggestedSpot))}">${esc(winner.suggestedSpot)}</a>`,
    );
  } else if (winner.kind === "place") {
    lines.push(`📍 <a href="${esc(mapsUrl(winner.text))}">Open in Maps</a>`);
  }
  return lines.join("\n");
}

function tallyLines(options: Doc<"options">[], max: number): string {
  const lines = options
    .slice(0, max)
    .map((o) => `${o.emoji} ${esc(o.text)} — ${o.voteCount}`);
  if (options.length > max) lines.push(`<i>…and ${options.length - max} more in the app</i>`);
  return lines.join("\n");
}

/** The live session message: a scoreboard the bot edits in place, plus the
 *  one button that matters — 🎡 Open Munch. */
function renderSession(state: SessionState): {
  text: string;
  reply_markup?: Record<string, unknown>;
} {
  const { room, options } = state;

  if (room.closedAt) {
    const tally = tallyLines(options, 5);
    return {
      text: `🍽 <b>${esc(room.title)}</b>\n\n${resultText(state)}${tally ? `\n\n<i>Final tally</i>\n${tally}` : ""}`,
    };
  }

  const header = `🍽 <b>${esc(room.title)}</b>\n<i>started by ${esc(room.hostName)}</i>`;
  const body =
    options.length === 0
      ? "<i>Nothing on the menu yet — open Munch and get us started!</i>"
      : tallyLines(options, TALLY_MAX);
  const footer = `<i>Tap 🎡 Open Munch to add cravings &amp; vote. ${esc(room.hostName)} spins the wheel.</i>`;

  // The Mini App opens in-place over the chat, carrying the room code via
  // startapp (registered with BotFather; see README).
  const miniAppLink = deployEnv().TELEGRAM_MINIAPP_LINK; // e.g. https://t.me/MunchBot/munch
  const button = miniAppLink
    ? { text: "🎡 Open Munch", url: `${miniAppLink.replace(/\/$/, "")}?startapp=${room.code}` }
    : null;

  return {
    text: `${header}\n\n${body}\n\n${footer}`,
    ...(button ? { reply_markup: { inline_keyboard: [[button]] } } : {}),
  };
}

/** Re-render the session message in place after any state change. */
async function refreshSessionMessage(ctx: ActionCtx, roomId: Id<"rooms">) {
  const state = await ctx.runQuery(internal.telegram.sessionState, { roomId });
  if (!state || state.room.tgMessageId === undefined) return;
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
  if (!state) return;
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

/** Chat aftermath of a Mini App host action: drumroll + scheduled reveal for
 *  spin (the app's wheel is animating meanwhile), immediate announcement for
 *  lock, a final re-render for end. */
async function afterHostAction(
  ctx: ActionCtx,
  act: "spin" | "lock" | "end",
  res: { roomId: Id<"rooms">; tgChatId: number; tgMessageId?: number },
) {
  if (act === "spin") {
    if (res.tgMessageId !== undefined) {
      await tg("editMessageText", {
        chat_id: res.tgChatId,
        message_id: res.tgMessageId,
        text: "🥁 Spinning the wheel…",
      });
    }
    await ctx.scheduler.runAfter(SPIN_SUSPENSE_MS, internal.telegram.announceResult, {
      roomId: res.roomId,
    });
  } else if (act === "lock") {
    await announce(ctx, res.roomId);
  } else {
    await refreshSessionMessage(ctx, res.roomId);
  }
}

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
 *  identity, applies the decision, then plays out the chat-side effects. */
export const miniAppHostAction = action({
  args: { initData: v.string(), code: v.string(), act: HOST_ACT },
  handler: async (ctx, { initData, code, act }) => {
    const user = await verifyInitData(initData);
    const res = await ctx.runMutation(internal.telegram.hostActionByCode, {
      code,
      tgUserId: user.id,
      act,
    });
    await afterHostAction(ctx, act, res);
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

function parseCommand(text: string): { name: string; args: string } | null {
  const m = /^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]+))?$/.exec(text);
  return m ? { name: m[1].toLowerCase(), args: (m[2] ?? "").trim() } : null;
}

/** Buttons no longer carry actions — anything tapped on an old session
 *  message just gets pointed at the app. */
async function onCallback(cb: TgCallbackQuery) {
  await tg("answerCallbackQuery", {
    callback_query_id: cb.id,
    text: "Munch lives in the app now — tap 🎡 Open Munch on the round's message.",
  });
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
  const cmd = parseCommand(text);
  if (!cmd) return;

  if (!isGroup) {
    // Private chats are just an onboarding surface.
    await tg("sendMessage", { chat_id: chat.id, text: PRIVATE_HELP, parse_mode: "HTML" });
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
          hostName: displayName(from),
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
          // Point the superseded copy at the new one so a duplicate scoreboard
          // doesn't linger mid-chat.
          if (res.reusedMessageId && res.reusedMessageId !== sent.message_id) {
            await tg("editMessageText", {
              chat_id: chat.id,
              message_id: res.reusedMessageId,
              text: "⬇️ This munch moved to a newer message below.",
            });
          }
        }
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
      if (u.callback_query) await onCallback(u.callback_query);
      else if (u.message) await onMessage(ctx, u.message);
    } catch (err) {
      console.error("telegram update failed", err);
    }
  },
});
