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
  ANYONE_CAN_CLOSE_AFTER_MS,
  MAX_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  byMostVotesFirst,
  findRoomByCode,
  googleMapsSearchUrl,
  requireRoom,
  sessionFromToken,
  telegramFullName,
  tidyText,
  voteWord,
} from "./lib";
import { computeSpinResult, pickTopVoted, randomRoomName, recordDecision } from "./rooms";
import { findHangoutByCode } from "./hangouts";
import { formatDate, formatDay, formatTime, TZ_LABEL } from "./time";

/**
 * The chat is the notice board, the Mini App is where everything happens.
 *
 * /hangout posts a card the bot edits in place: the plan on top, the RSVP
 * buttons underneath, the guest list growing as people tap. /munch posts the
 * older scoreboard message for a round of picking somewhere to eat. Both
 * re-render through a debounced refresh rather than an edit per tap, because
 * Telegram rate limits message edits.
 *
 * Updates arrive on the /telegram route in http.ts, which checks the webhook
 * secret and hands the raw update to handleUpdate at the bottom of this file.
 *
 * A new message is the only thing here that makes a phone buzz, so they are
 * rationed: a hangout is worth two of them across its whole life, the card and
 * the reminder on the day, plus one more if it is called off after people have
 * replied. Everything else — RSVPs landing, details changing, a place being
 * decided — is an edit to the card that already exists. Before adding a
 * sendMessage anywhere, check whether an edit would carry the same news.
 */

// —— Telegram wire types (only the fields we read) ——

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
const MAX_TALLY_ROWS = 8; // options listed on the chat scoreboard
// A chat can run several rounds at once, each on its own scoreboard message,
// and rounds stay live until decided or ended. The one guard on that: a group
// racing to type /munch merges into ONE round instead of several.
const MUNCH_MERGE_WINDOW_MS = 90 * 1000;
/** Names listed on a card before it collapses into a count. */
const MAX_NAMES_ON_CARD = 12;

/** Read through globalThis so the frontend tsconfig — which type-imports this
 *  module via _generated/api — doesn't need Node globals. */
export function deployEnv(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function displayName(user: TgUser): string {
  return tidyText(telegramFullName(user), MAX_NAME_LENGTH) || "Someone";
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
function botUserId(): number {
  return Number(botToken().split(":")[0]);
}

/** Returns null on failure rather than throwing — a failed message edit must
 *  not take down webhook handling. */
async function callTelegram(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: unknown;
    description?: string;
  } | null;
  if (!body?.ok) {
    const reason = body?.description ?? `HTTP ${response.status}`;
    // Re-rendering identical content is a no-op, not a problem.
    if (!reason.includes("message is not modified")) {
      console.warn(`Telegram ${method} failed: ${reason}`);
    }
    return null;
  }
  return body.result;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const HELP = [
  "🎉 <b>Munch</b> — sort out hangouts without leaving the chat.",
  "",
  "/hangout <i>[what]</i> — plan something. You pick the day, the time and the place; everyone else taps one button to say if they're coming.",
  "/plans — what this chat has coming up",
  "/munch <i>[title]</i> — just deciding where to eat? Start a round and spin the wheel.",
  "",
  `Times are ${escapeHtml(TZ_LABEL)}. On the day itself I'll post a reminder with the guest list.`,
].join("\n");

const PRIVATE_CHAT_HELP =
  "🎉 <b>Munch</b> works inside a group chat — add me to the group you actually " +
  "make plans in, then send /hangout there.\n\n" + HELP;

/** closedAt is part of the index, so this never touches the chat's
 *  ever-growing pile of closed rounds. */
async function newestOpenRound(ctx: QueryCtx | MutationCtx, chatId: number) {
  return ctx.db
    .query("rooms")
    .withIndex("by_tg_chat", (q) => q.eq("tgChatId", chatId).eq("closedAt", undefined))
    .order("desc")
    .first();
}

async function roomOptions(ctx: QueryCtx | MutationCtx, roomId: Id<"rooms">) {
  const options = await ctx.db
    .query("options")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  options.sort(byMostVotesFirst);
  return options;
}

const hostActionValidator = v.union(v.literal("spin"), v.literal("lock"), v.literal("end"));
type HostAction = "spin" | "lock" | "end";

/** Callers must already have verified the signed initData AND confirmed group
 *  membership via the access token — see hostActionByCode.
 *
 *  Spinning and locking belong to the starter alone. Ending is theirs at any
 *  time and, because rounds never expire on their own, anyone's once the round
 *  has grown old — that is the History screen's cleanup power. */
async function applyHostAction(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  tgUserId: number,
  hostAction: HostAction,
) {
  if (room.closedAt) throw new ConvexError("This room is closed.");
  const isStarter = room.tgHostUserId === tgUserId;

  if (hostAction === "end") {
    if (!isStarter && Date.now() - room.createdAt < ANYONE_CAN_CLOSE_AFTER_MS) {
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

    if (hostAction === "spin") {
      const { winner, spinAngle, wheelOptionIds } = computeSpinResult(options);
      await recordDecision(ctx, room, {
        mode: "spin",
        winnerId: winner._id,
        votes: winner.voteCount,
        spinAngle,
        wheelOptionIds,
      });
    } else {
      const winner = pickTopVoted(options);
      await recordDecision(ctx, room, {
        mode: "lock",
        winnerId: winner._id,
        votes: winner.voteCount,
      });
    }
  }
  return { roomId: room._id, tgChatId: room.tgChatId, tgMessageId: room.tgMessageId };
}

// —— Internal queries and mutations ——

export const sessionState = internalQuery({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room) return null;
    const options = await roomOptions(ctx, roomId);
    const winner = room.winnerOptionId
      ? (options.find((option) => option._id === room.winnerOptionId) ?? null)
      : null;
    return { room, options, winner };
  },
});

/** /munch — create a round, or hand back the one that just started. */
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
      // This code rides in the Open Munch button's startapp parameter — it's
      // how the Mini App finds its way back to this room.
      code: crypto.randomUUID(),
      title:
        tidyText(args.title ?? "", MAX_TITLE_LENGTH) ||
        tidyText(args.chatTitle ?? "", MAX_TITLE_LENGTH) ||
        randomRoomName(),
      hostName: tidyText(args.hostName, MAX_NAME_LENGTH) || "Host",
      tgChatId: args.chatId,
      tgHostUserId: args.hostTgUserId,
      phase: "collecting",
      createdAt: Date.now(),
    });
    return { roomId, reusedMessageId: undefined };
  },
});

export const setSessionMessage = internalMutation({
  args: { roomId: v.id("rooms"), messageId: v.number() },
  handler: async (ctx, { roomId, messageId }) => {
    await ctx.db.patch(roomId, { tgMessageId: messageId });
  },
});

/** The signed initData establishes WHO is calling, but a room code is not a
 *  secret — it rides in the Open Munch button and survives forwarding — so
 *  identity alone would let any Telegram user drive another group's round. The
 *  access token is what proves current membership. */
export const hostActionByCode = internalMutation({
  args: {
    code: v.string(),
    token: v.string(),
    tgUserId: v.number(),
    act: hostActionValidator,
  },
  handler: async (ctx, { code, token, tgUserId, act }) => {
    const room = await requireRoom(ctx, code);
    const session = await sessionFromToken(ctx, token);
    if (!session || session.tgUserId !== tgUserId) {
      throw new ConvexError("Your session expired — reopen Munch from the chat.");
    }
    if (room.tgChatId !== session.tgChatId) throw new ConvexError("Wrong group.");
    return applyHostAction(ctx, room, tgUserId, act);
  },
});

/** Cleared BEFORE rendering, so activity landing mid-render schedules a fresh
 *  pass rather than being swallowed. Set by scheduleChatRefresh in rooms.ts. */
export const clearRefreshPending = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    await ctx.db.patch(roomId, { tgRefreshPending: undefined });
  },
});

export const refreshSession = internalAction({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    await ctx.runMutation(internal.telegram.clearRefreshPending, { roomId });
    await refreshScoreboard(ctx, roomId);
  },
});

/** Telegram renumbers a chat when a group is upgraded to a supergroup. Access
 *  grants are chat-scoped too, so they move with it or every open Mini App in
 *  the group would find itself in the wrong chat. */
export const migrateChat = internalMutation({
  args: { fromChatId: v.number(), toChatId: v.number() },
  handler: async (ctx, { fromChatId, toChatId }) => {
    const [rooms, hangouts, grants] = await Promise.all([
      ctx.db
        .query("rooms")
        .withIndex("by_tg_chat", (q) => q.eq("tgChatId", fromChatId))
        .collect(),
      ctx.db
        .query("hangouts")
        .withIndex("by_tg_chat", (q) => q.eq("tgChatId", fromChatId))
        .collect(),
      ctx.db
        .query("roomSessions")
        .withIndex("by_chat_user", (q) => q.eq("tgChatId", fromChatId))
        .collect(),
    ]);
    await Promise.all([
      ...rooms.map((room) => ctx.db.patch(room._id, { tgChatId: toChatId })),
      ...hangouts.map((hangout) => ctx.db.patch(hangout._id, { tgChatId: toChatId })),
      ...grants.map((grant) => ctx.db.patch(grant._id, { tgChatId: toChatId })),
    ]);
  },
});

// —— Rendering the chat messages ——

type RoundState = {
  room: Doc<"rooms">;
  options: Doc<"options">[];
  winner: Doc<"options"> | null;
};

function resultText(state: RoundState): string {
  const { room, winner } = state;
  if (!winner) return "🔒 This munch is closed.";
  const votes = room.decidedVotes ?? 0;
  const lines = [
    `🎉 <b>${escapeHtml(winner.text)}</b> it is!`,
    room.mode === "spin"
      ? "The wheel has spoken 🎡"
      : `Locked in with ${votes} ${voteWord(votes)} 🔒`,
  ];
  if (winner.suggestedSpot) {
    const link = googleMapsSearchUrl(winner.suggestedSpot);
    lines.push(`😋 Try: <a href="${escapeHtml(link)}">${escapeHtml(winner.suggestedSpot)}</a>`);
  } else if (winner.kind === "place") {
    lines.push(`📍 <a href="${escapeHtml(googleMapsSearchUrl(winner.text))}">Open in Maps</a>`);
  }
  return lines.join("\n");
}

function tallyLines(options: Doc<"options">[], maxRows: number): string {
  const lines = options
    .slice(0, maxRows)
    .map((option) => `${option.emoji} ${escapeHtml(option.text)} — ${option.voteCount}`);
  if (options.length > maxRows) {
    lines.push(`<i>…and ${options.length - maxRows} more in the app</i>`);
  }
  return lines.join("\n");
}

function renderScoreboard(state: RoundState): {
  text: string;
  reply_markup?: Record<string, unknown>;
} {
  const { room, options } = state;

  if (room.closedAt) {
    const tally = tallyLines(options, 5);
    const finalTally = tally ? `\n\n<i>Final tally</i>\n${tally}` : "";
    return {
      text: `🍽 <b>${escapeHtml(room.title)}</b>\n\n${resultText(state)}${finalTally}`,
    };
  }

  const header = `🍽 <b>${escapeHtml(room.title)}</b>\n<i>started by ${escapeHtml(room.hostName)}</i>`;
  const body =
    options.length === 0
      ? "<i>Nothing on the menu yet — open Munch and get us started!</i>"
      : tallyLines(options, MAX_TALLY_ROWS);
  const footer = `<i>Tap 🎡 Open Munch to add cravings &amp; vote. ${escapeHtml(room.hostName)} spins the wheel.</i>`;

  // Registered with BotFather; see the README. Without it the round has no
  // button at all, since there is no other way into the app.
  const miniAppLink = deployEnv().TELEGRAM_MINIAPP_LINK; // e.g. https://t.me/MunchBot/munch
  const button = miniAppLink
    ? { text: "🎡 Open Munch", url: `${miniAppLink.replace(/\/$/, "")}?startapp=${room.code}` }
    : null;

  return {
    text: `${header}\n\n${body}\n\n${footer}`,
    ...(button ? { reply_markup: { inline_keyboard: [[button]] } } : {}),
  };
}

async function refreshScoreboard(ctx: ActionCtx, roomId: Id<"rooms">) {
  const state = await ctx.runQuery(internal.telegram.sessionState, { roomId });
  if (!state || state.room.tgMessageId === undefined) return;
  const { text, reply_markup } = renderScoreboard(state);
  await callTelegram("editMessageText", {
    chat_id: state.room.tgChatId,
    message_id: state.room.tgMessageId,
    text,
    parse_mode: "HTML",
    ...(reply_markup ? { reply_markup } : {}),
    link_preview_options: { is_disabled: true },
  });
}

/** Posts a brand-new message rather than editing: a new message notifies the
 *  chat, where an edit wouldn't. */
async function announceWinner(ctx: ActionCtx, roomId: Id<"rooms">) {
  const state = await ctx.runQuery(internal.telegram.sessionState, { roomId });
  if (!state) return;
  await refreshScoreboard(ctx, roomId);
  if (state.winner) {
    await callTelegram("sendMessage", {
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
    await announceWinner(ctx, roomId);
  },
});

/** A spin gets a drumroll and a scheduled reveal, because the app's wheel is
 *  animating for those same few seconds and the chat shouldn't spoil it. */
async function playOutHostAction(
  ctx: ActionCtx,
  hostAction: HostAction,
  round: { roomId: Id<"rooms">; tgChatId: number; tgMessageId?: number },
) {
  if (hostAction === "spin") {
    if (round.tgMessageId !== undefined) {
      await callTelegram("editMessageText", {
        chat_id: round.tgChatId,
        message_id: round.tgMessageId,
        text: "🥁 Spinning the wheel…",
      });
    }
    await ctx.scheduler.runAfter(SPIN_SUSPENSE_MS, internal.telegram.announceResult, {
      roomId: round.roomId,
    });
  } else if (hostAction === "lock") {
    await announceWinner(ctx, round.roomId);
  } else {
    await refreshScoreboard(ctx, round.roomId);
  }
}

// —— Mini App identity ——

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

const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

/** Telegram's HMAC chain. This is what makes Mini App host actions
 *  trustworthy: the client cannot forge who it is. */
async function verifyInitData(initData: string): Promise<TgUser> {
  const params = new URLSearchParams(initData);
  const claimedHash = params.get("hash");
  if (!claimedHash) throw new ConvexError("Open this from your Telegram chat.");
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken());
  const signature = await hmacSha256(secret, dataCheckString);
  const signatureHex = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (signatureHex !== claimedHash) throw new ConvexError("Couldn't verify your Telegram session.");

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_SECONDS) {
    throw new ConvexError("This session expired — reopen Munch from the chat.");
  }
  const user = JSON.parse(params.get("user") ?? "null") as TgUser | null;
  if (!user?.id) throw new ConvexError("Couldn't verify your Telegram session.");
  return user;
}

export const miniAppHostAction = action({
  args: {
    initData: v.string(),
    code: v.string(),
    token: v.string(),
    act: hostActionValidator,
  },
  handler: async (ctx, { initData, code, token, act }) => {
    const user = await verifyInitData(initData);
    const round = await ctx.runMutation(internal.telegram.hostActionByCode, {
      code,
      token,
      tgUserId: user.id,
      act,
    });
    await playOutHostAction(ctx, act, round);
  },
});

// —— Access grants (the group-membership gate) ——

const GRANT_LIFETIME_MS = 60 * 60 * 1000;
/** Inside this window enterRoom trusts the existing grant and skips the
 *  getChatMember round-trip, which bounds re-checks on rapid reopens. */
const MEMBERSHIP_RECHECK_AFTER_MS = 4 * 60 * 1000;

/** Fails CLOSED: a Telegram API error or an unrecognized status denies access. */
async function isChatMember(chatId: number, userId: number): Promise<boolean> {
  const result = (await callTelegram("getChatMember", {
    chat_id: chatId,
    user_id: userId,
  })) as { status?: string; is_member?: boolean } | null;
  if (!result) return false;
  const { status } = result;
  if (status === "creator" || status === "administrator" || status === "member") return true;
  // A "restricted" user is still in the group only if is_member says so.
  if (status === "restricted") return result.is_member === true;
  return false; // left, kicked, or anything unexpected
}

/** enterGroup needs this before any grant exists to read the room through. */
export const roomChatByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await findRoomByCode(ctx, code);
    return room ? { tgChatId: room.tgChatId } : null;
  },
});

export const sessionFor = internalQuery({
  args: { tgChatId: v.number(), tgUserId: v.number() },
  handler: async (ctx, { tgChatId, tgUserId }) => {
    const grant = await ctx.db
      .query("roomSessions")
      .withIndex("by_chat_user", (q) => q.eq("tgChatId", tgChatId).eq("tgUserId", tgUserId))
      .unique();
    if (!grant || grant.expiresAt < Date.now()) return null;
    return { token: grant.token, checkedAt: grant.checkedAt };
  },
});

/** One row per chat and user: the token stays the same across reopens so old
 *  tabs keep working, and expiry always extends. `recheck` records that
 *  getChatMember just succeeded. */
export const upsertSession = internalMutation({
  args: { tgChatId: v.number(), tgUserId: v.number(), name: v.string(), recheck: v.boolean() },
  handler: async (ctx, { tgChatId, tgUserId, name, recheck }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("roomSessions")
      .withIndex("by_chat_user", (q) => q.eq("tgChatId", tgChatId).eq("tgUserId", tgUserId))
      .unique();
    const patch = {
      name,
      expiresAt: now + GRANT_LIFETIME_MS,
      ...(recheck ? { checkedAt: now } : {}),
      // A real grant is never dev-exempt, even if devGrantSession seeded this
      // row first — patching a field to undefined clears it.
      dev: undefined,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing.token;
    }
    const token = crypto.randomUUID();
    await ctx.db.insert("roomSessions", {
      token,
      tgChatId,
      tgUserId,
      name,
      checkedAt: now,
      expiresAt: now + GRANT_LIFETIME_MS,
    });
    return token;
  },
});

export const dropSession = internalMutation({
  args: { tgChatId: v.number(), tgUserId: v.number() },
  handler: async (ctx, { tgChatId, tgUserId }) => {
    const existing = await ctx.db
      .query("roomSessions")
      .withIndex("by_chat_user", (q) => q.eq("tgChatId", tgChatId).eq("tgUserId", tgUserId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** The entry gate, called before anything renders. The code names either a
 *  hangout or a round; both resolve to the one chat the grant is scoped to.
 *  Membership is re-checked on entry after a short grace window and the client
 *  re-calls this periodically, so leaving or being kicked revokes access within
 *  minutes. */
export const enterGroup = action({
  args: { initData: v.string(), code: v.string() },
  handler: async (ctx, { initData, code }): Promise<{ token: string }> => {
    const user = await verifyInitData(initData);
    const chat =
      (await ctx.runQuery(internal.hangouts.chatForHangoutCode, { code })) ??
      (await ctx.runQuery(internal.telegram.roomChatByCode, { code }));
    if (!chat) throw new ConvexError("That link doesn't lead anywhere any more.");

    const existing = await ctx.runQuery(internal.telegram.sessionFor, {
      tgChatId: chat.tgChatId,
      tgUserId: user.id,
    });
    // Recently checked, so trust it and just extend the expiry.
    if (existing && Date.now() - existing.checkedAt < MEMBERSHIP_RECHECK_AFTER_MS) {
      const token = await ctx.runMutation(internal.telegram.upsertSession, {
        tgChatId: chat.tgChatId,
        tgUserId: user.id,
        name: displayName(user),
        recheck: false,
      });
      return { token };
    }

    if (!(await isChatMember(chat.tgChatId, user.id))) {
      await ctx.runMutation(internal.telegram.dropSession, {
        tgChatId: chat.tgChatId,
        tgUserId: user.id,
      });
      throw new ConvexError("You're not in this group. Open Munch from the group chat to join in.");
    }
    const token = await ctx.runMutation(internal.telegram.upsertSession, {
      tgChatId: chat.tgChatId,
      tgUserId: user.id,
      name: displayName(user),
      recheck: true,
    });
    return { token };
  },
});

/** DEV ONLY: mint a grant with no membership check, for browser testing
 *  (npx convex run telegram:devGrantSession '{...}'). Internal, so no client
 *  can reach it — the real gate is enterGroup. */
export const devGrantSession = internalMutation({
  args: { code: v.string(), tgUserId: v.number(), name: v.string() },
  handler: async (ctx, { code, tgUserId, name }) => {
    const anchor =
      (await findHangoutByCode(ctx, code)) ?? (await findRoomByCode(ctx, code));
    if (!anchor) throw new ConvexError("No hangout or round with that code.");
    const tgChatId = anchor.tgChatId;
    const now = Date.now();
    const existing = await ctx.db
      .query("roomSessions")
      .withIndex("by_chat_user", (q) => q.eq("tgChatId", tgChatId).eq("tgUserId", tgUserId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        checkedAt: now,
        expiresAt: now + GRANT_LIFETIME_MS,
        dev: true,
      });
      return existing.token;
    }
    const token = crypto.randomUUID();
    await ctx.db.insert("roomSessions", {
      token,
      tgChatId,
      tgUserId,
      name,
      checkedAt: now,
      expiresAt: now + GRANT_LIFETIME_MS,
      // Never membership-checked, so exempt from the staleness bound that
      // revokes real grants — there is nothing to re-check.
      dev: true,
    });
    return token;
  },
});


// —— Hangouts: the card, the buttons, the reminder ——

type HangoutState = {
  hangout: Doc<"hangouts">;
  rsvps: { in: string[]; maybe: string[]; out: string[] };
  room: Doc<"rooms"> | null;
};

/** The Mini App link for a hangout. The `h-` prefix is what lets the /tg entry
 *  screen tell a hangout code from a round code: a round's startapp value is a
 *  bare UUID, which always begins with a hex digit. Null when
 *  TELEGRAM_MINIAPP_LINK isn't set, which leaves the message button-less. */
function miniAppUrl(code: string): string | null {
  const link = deployEnv().TELEGRAM_MINIAPP_LINK;
  return link ? `${link.replace(/\/$/, "")}?startapp=h-${code}` : null;
}

function namesLine(emoji: string, label: string, names: string[]): string | null {
  if (names.length === 0) return null;
  const shown = names.slice(0, MAX_NAMES_ON_CARD).map(escapeHtml).join(", ");
  const overflow = names.length > MAX_NAMES_ON_CARD ? ` +${names.length - MAX_NAMES_ON_CARD}` : "";
  return `${emoji} <b>${label} (${names.length})</b> · ${shown}${overflow}`;
}

/** One line answering "where?", whichever way the host chose to answer it. */
function placeLine(state: HangoutState): string {
  const { hangout, room } = state;
  if (hangout.place) {
    return `📍 <a href="${escapeHtml(googleMapsSearchUrl(hangout.place))}">${escapeHtml(hangout.place)}</a>`;
  }
  if (room && !room.closedAt) return "📍 <i>Picking a spot in the app 🎡</i>";
  return "📍 <i>Somewhere — TBC</i>";
}

/** Absolute on purpose: this line lives in a message that may sit unedited for
 *  days, where "Tomorrow" would quietly become a lie. */
function whenLine(hangout: Doc<"hangouts">): string {
  if (hangout.startsAt === undefined) return "📅 <i>Day and time TBC</i>";
  const stamp = `${formatDate(hangout.startsAt)} · ${formatTime(hangout.startsAt)}`;
  return `📅 <b>${escapeHtml(stamp)}</b>`;
}

function renderHangoutCard(state: HangoutState): {
  text: string;
  reply_markup?: Record<string, unknown>;
} {
  const { hangout, rsvps } = state;
  const openUrl = miniAppUrl(hangout.code);

  if (hangout.status === "cancelled") {
    return {
      text:
        `🚫 <b>${escapeHtml(hangout.title)}</b> — called off\n` +
        `<i>${escapeHtml(hangout.hostName)} cancelled this one.</i>`,
    };
  }

  if (hangout.status === "draft") {
    return {
      text:
        `🗓 <b>${escapeHtml(hangout.title)}</b>\n` +
        `<i>${escapeHtml(hangout.hostName)} is setting this up…</i>`,
      ...(openUrl
        ? { reply_markup: { inline_keyboard: [[{ text: "⚙️ Set it up", url: openUrl }]] } }
        : {}),
    };
  }

  const guestLines = [
    namesLine("✅", "Coming", rsvps.in),
    namesLine("🤔", "Maybe", rsvps.maybe),
    namesLine("❌", "Can't", rsvps.out),
  ].filter((line): line is string => line !== null);

  const body = [
    `🎉 <b>${escapeHtml(hangout.title)}</b>`,
    whenLine(hangout),
    placeLine(state),
    "",
    guestLines.length > 0
      ? guestLines.join("\n")
      : "<i>Nobody's answered yet — tap a button 👇</i>",
  ].join("\n");

  // Three taps, one row, no typing. Everything else lives behind the app.
  const rsvpRow = [
    { text: "✅ I'm in", callback_data: `rsvp:${hangout.code}:in` },
    { text: "🤔 Maybe", callback_data: `rsvp:${hangout.code}:maybe` },
    { text: "❌ Can't", callback_data: `rsvp:${hangout.code}:out` },
  ];
  const keyboard = openUrl
    ? [rsvpRow, [{ text: "🗓 Open in Munch", url: openUrl }]]
    : [rsvpRow];

  return { text: body, reply_markup: { inline_keyboard: keyboard } };
}

async function editHangoutCard(ctx: ActionCtx, hangoutId: Id<"hangouts">) {
  const state = await ctx.runQuery(internal.hangouts.cardState, { hangoutId });
  if (!state || state.hangout.tgMessageId === undefined) return;
  const { text, reply_markup } = renderHangoutCard(state);
  await callTelegram("editMessageText", {
    chat_id: state.hangout.tgChatId,
    message_id: state.hangout.tgMessageId,
    text,
    parse_mode: "HTML",
    reply_markup: reply_markup ?? { inline_keyboard: [] },
    link_preview_options: { is_disabled: true },
  });
}

/** Posts a new card and points the old one at it, so the live plan is always
 *  the newest thing in the chat rather than buried above an hour of banter. */
async function postHangoutCard(
  ctx: ActionCtx,
  hangoutId: Id<"hangouts">,
  previousMessageId?: number,
) {
  const state = await ctx.runQuery(internal.hangouts.cardState, { hangoutId });
  if (!state) return;
  const { text, reply_markup } = renderHangoutCard(state);
  const sent = (await callTelegram("sendMessage", {
    chat_id: state.hangout.tgChatId,
    text,
    parse_mode: "HTML",
    ...(reply_markup ? { reply_markup } : {}),
    link_preview_options: { is_disabled: true },
  })) as { message_id?: number } | null;
  if (!sent?.message_id) return;

  await ctx.runMutation(internal.hangouts.setCardMessage, {
    hangoutId,
    messageId: sent.message_id,
  });
  if (previousMessageId !== undefined && previousMessageId !== sent.message_id) {
    await removeSupersededMessage(
      state.hangout.tgChatId,
      previousMessageId,
      "⬇️ This hangout moved to a newer message below.",
    );
  }
}

/** Clears a card the bot has just replaced. Deleting leaves the chat clean,
 *  but Telegram only allows it for the bot's own messages under 48 hours old,
 *  so anything older is edited down to a single pointer line instead. */
async function removeSupersededMessage(chatId: number, messageId: number, fallbackText: string) {
  const deleted = await callTelegram("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
  if (deleted === null) {
    await callTelegram("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: fallbackText,
    });
  }
}

export const refreshHangoutCard = internalAction({
  args: { hangoutId: v.id("hangouts") },
  handler: async (ctx, { hangoutId }) => {
    await ctx.runMutation(internal.hangouts.clearCardRefreshPending, { hangoutId });
    await editHangoutCard(ctx, hangoutId);
  },
});

/**
 * The day-of nudge, booked by hangouts.ts when the plan is published or moved.
 * A brand-new message rather than an edit, because only a new message pings
 * everyone's phone — which is the entire point of a reminder.
 */
export const sendHangoutReminder = internalAction({
  args: { hangoutId: v.id("hangouts") },
  handler: async (ctx, { hangoutId }) => {
    const state = await ctx.runQuery(internal.hangouts.cardState, { hangoutId });
    if (!state || state.hangout.status !== "open") return;
    const { hangout, rsvps } = state;
    const startsAt = hangout.startsAt;
    // A hangout with no time can't have a day to be reminded on.
    if (startsAt === undefined) return;
    const guestLines = [
      namesLine("✅", "Coming", rsvps.in),
      namesLine("🤔", "Maybe", rsvps.maybe),
    ].filter((line): line is string => line !== null);

    const lines = [
      `⏰ <b>${escapeHtml(formatDay(startsAt))}: ${escapeHtml(hangout.title)}</b>`,
      `🕒 ${escapeHtml(formatTime(startsAt))} · ${placeLine(state)}`,
      "",
      guestLines.length > 0
        ? guestLines.join("\n")
        : "<i>Nobody's said they're coming yet 👀</i>",
    ];
    if (!hangout.place) {
      lines.push("", "<i>Still no spot — open Munch and settle it 🎡</i>");
    }

    const openUrl = miniAppUrl(hangout.code);
    await callTelegram("sendMessage", {
      chat_id: hangout.tgChatId,
      text: lines.join("\n"),
      parse_mode: "HTML",
      ...(openUrl
        ? { reply_markup: { inline_keyboard: [[{ text: "🗓 Open in Munch", url: openUrl }]] } }
        : {}),
      link_preview_options: { is_disabled: true },
    });
    await ctx.runMutation(internal.hangouts.markReminded, { hangoutId });
  },
});

/**
 * Publishing from the Mini App. A draft the host filled in there and then turns
 * into the live card in place: the group saw /hangout land seconds ago and the
 * card is still on screen, so posting a second one would buzz every phone to
 * say something they are already looking at. Only a draft left to go stale, or
 * an open hangout the host is deliberately bumping, gets a fresh message.
 *
 * The token proves both identity and membership; the signed initData is a
 * second, independent check on the same claim.
 */
export const publishHangout = action({
  args: { initData: v.string(), code: v.string(), token: v.string() },
  handler: async (ctx, { initData, code, token }) => {
    await verifyInitData(initData);
    const { hangoutId, previousMessageId, bumpCard } = await ctx.runMutation(
      internal.hangouts.markPublished,
      { code, token },
    );
    if (!bumpCard && previousMessageId !== undefined) {
      await editHangoutCard(ctx, hangoutId);
      return;
    }
    await postHangoutCard(ctx, hangoutId, previousMessageId);
  },
});

export const cancelHangout = action({
  args: { initData: v.string(), code: v.string(), token: v.string() },
  handler: async (ctx, { initData, code, token }) => {
    await verifyInitData(initData);
    const { hangoutId, announce } = await ctx.runMutation(internal.hangouts.markCancelled, {
      code,
      token,
    });
    await editHangoutCard(ctx, hangoutId);
    // A draft was never anyone else's business, so only a published hangout
    // being called off is worth a notification.
    if (announce) {
      const state = await ctx.runQuery(internal.hangouts.cardState, { hangoutId });
      if (state) {
        await callTelegram("sendMessage", {
          chat_id: state.hangout.tgChatId,
          text: `🚫 <b>${escapeHtml(state.hangout.title)}</b> is off — ${escapeHtml(state.hangout.hostName)} cancelled it.`,
          parse_mode: "HTML",
        });
      }
    }
  },
});

async function startHangout(ctx: ActionCtx, chat: TgChat, from: TgUser, title: string) {
  const { hangoutId } = await ctx.runMutation(internal.hangouts.createDraft, {
    chatId: chat.id,
    hostTgUserId: from.id,
    hostName: displayName(from),
    ...(title ? { title } : {}),
  });
  await postHangoutCard(ctx, hangoutId);
}

async function listPlans(ctx: ActionCtx, chatId: number) {
  const plans = await ctx.runQuery(internal.hangouts.openChatHangouts, { chatId });
  if (plans.length === 0) {
    await callTelegram("sendMessage", {
      chat_id: chatId,
      text: "Nothing planned yet. Send /hangout to fix that 🎉",
    });
    return;
  }
  const lines = plans.map((plan) => {
    // /plans is composed fresh on every run, so relative days are safe here.
    const when =
      plan.startsAt === undefined
        ? "TBC"
        : `${formatDay(plan.startsAt)} · ${formatTime(plan.startsAt)}`;
    const where = plan.place ? ` · 📍 ${escapeHtml(plan.place)}` : "";
    return `• <b>${escapeHtml(plan.title)}</b> — ${escapeHtml(when)}${where}`;
  });
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text: `🗓 <b>Coming up</b>\n\n${lines.join("\n")}`,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

// —— Handling updates from Telegram ——

/** ConvexError carries a message meant for humans, so that one gets replied
 *  into the chat; anything else is a bug and gets a generic apology. */
async function replyOnError(chatId: number, replyToMessageId: number, step: () => Promise<void>) {
  try {
    await step();
  } catch (err) {
    const text =
      err instanceof ConvexError ? String(err.data) : "Something went wrong — try again.";
    if (!(err instanceof ConvexError)) console.error("telegram handler failed", err);
    await callTelegram("sendMessage", {
      chat_id: chatId,
      text,
      reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true },
    });
  }
}

function parseCommand(text: string): { name: string; args: string } | null {
  const match = /^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]+))?$/.exec(text);
  return match ? { name: match[1].toLowerCase(), args: (match[2] ?? "").trim() } : null;
}

/**
 * RSVP taps. The update is signed by the webhook secret and carries the tapping
 * user, so this needs no access token: anyone who can see the card and press a
 * button on it is in the group already.
 *
 * Round scoreboards carry no action buttons any more, so anything else tapped
 * on an old message just gets pointed at the app.
 */
async function onCallbackQuery(ctx: ActionCtx, query: TgCallbackQuery) {
  const rsvp = /^rsvp:([\w-]+):(in|maybe|out)$/.exec(query.data ?? "");
  if (!rsvp) {
    await callTelegram("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "That button's retired — open Munch from the message instead.",
    });
    return;
  }
  const result = await ctx.runMutation(internal.hangouts.rsvpFromChat, {
    code: rsvp[1],
    tgUserId: query.from.id,
    name: displayName(query.from),
    answer: rsvp[2] as "in" | "maybe" | "out",
  });
  await callTelegram("answerCallbackQuery", {
    callback_query_id: query.id,
    text: result.message,
  });
}

async function startRound(ctx: ActionCtx, chat: TgChat, from: TgUser, title: string) {
  const round = await ctx.runMutation(internal.telegram.startSession, {
    chatId: chat.id,
    ...(chat.title ? { chatTitle: chat.title } : {}),
    hostTgUserId: from.id,
    hostName: displayName(from),
    ...(title ? { title } : {}),
  });
  // A /munch race merges into one round, and that round's scoreboard is a few
  // seconds up the chat already. Refreshing it says everything a second copy
  // would, without the notification.
  if (round.reusedMessageId !== undefined) {
    await refreshScoreboard(ctx, round.roomId);
    return;
  }

  const state = await ctx.runQuery(internal.telegram.sessionState, { roomId: round.roomId });
  if (!state) return;
  const { text, reply_markup } = renderScoreboard(state);
  const sent = (await callTelegram("sendMessage", {
    chat_id: chat.id,
    text,
    parse_mode: "HTML",
    ...(reply_markup ? { reply_markup } : {}),
    link_preview_options: { is_disabled: true },
  })) as { message_id?: number } | null;
  if (!sent?.message_id) return;

  await ctx.runMutation(internal.telegram.setSessionMessage, {
    roomId: round.roomId,
    messageId: sent.message_id,
  });
}

async function onMessage(ctx: ActionCtx, message: TgMessage) {
  const chat = message.chat;

  if (message.migrate_to_chat_id !== undefined) {
    await ctx.runMutation(internal.telegram.migrateChat, {
      fromChatId: chat.id,
      toChatId: message.migrate_to_chat_id,
    });
    return;
  }

  const isGroupChat = chat.type === "group" || chat.type === "supergroup";

  // Introduce ourselves when added to a group.
  if (isGroupChat && message.new_chat_members?.some((member) => member.id === botUserId())) {
    await callTelegram("sendMessage", { chat_id: chat.id, text: HELP, parse_mode: "HTML" });
    return;
  }

  const text = (message.text ?? "").trim();
  if (!text || !message.from || message.from.is_bot) return;
  const command = parseCommand(text);
  if (!command) return;

  if (!isGroupChat) {
    // Private chats are only an onboarding surface.
    await callTelegram("sendMessage", {
      chat_id: chat.id,
      text: PRIVATE_CHAT_HELP,
      parse_mode: "HTML",
    });
    return;
  }

  switch (command.name) {
    case "start":
    case "help":
      await callTelegram("sendMessage", { chat_id: chat.id, text: HELP, parse_mode: "HTML" });
      return;

    case "hangout":
    case "plan": {
      const from = message.from;
      await replyOnError(chat.id, message.message_id, () =>
        startHangout(ctx, chat, from, command.args),
      );
      return;
    }

    case "plans":
      await replyOnError(chat.id, message.message_id, () => listPlans(ctx, chat.id));
      return;

    case "munch": {
      const from = message.from;
      await replyOnError(chat.id, message.message_id, () =>
        startRound(ctx, chat, from, command.args),
      );
      return;
    }

    default:
      // Not ours, or a typo — stay quiet in the group.
      return;
  }
}

/** One Telegram update, dispatched. Never throws: the webhook must always
 *  answer 200, or Telegram re-delivers the same update in a retry storm. */
export const handleUpdate = internalAction({
  args: { update: v.any() },
  handler: async (ctx, { update }) => {
    const tgUpdate = update as TgUpdate;
    try {
      if (tgUpdate.callback_query) await onCallbackQuery(ctx, tgUpdate.callback_query);
      else if (tgUpdate.message) await onMessage(ctx, tgUpdate.message);
    } catch (err) {
      console.error("telegram update failed", err);
    }
  },
});
