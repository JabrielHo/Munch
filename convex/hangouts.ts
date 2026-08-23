import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  MAX_NAME_LENGTH,
  MAX_PLACE_LENGTH,
  MAX_TITLE_LENGTH,
  sessionFromToken,
  tidyText,
} from "./lib";
import { epochToWhen, isValidWhen, reminderTimeFor, whenToEpoch, type LocalWhen } from "./time";

/**
 * A hangout is the plan: a title, when it starts, where it is, and who said
 * they're coming. /hangout creates it as a draft (telegram.ts); the host fills
 * in the details in the Mini App and publishes, which turns the bot's message
 * into a live RSVP card and books the day-of reminder.
 *
 * "Where" has two answers. Either the host types a place, or the group decides
 * it the old Munch way — a round of adding, voting and spinning, whose winner
 * is written back here the moment it lands.
 */

const CARD_REFRESH_DEBOUNCE_MS = 2000;
const MAX_FEED_HANGOUTS = 40;
/** How long a hangout that has already started keeps showing up as upcoming. */
const RECENTLY_STARTED_MS = 6 * 60 * 60 * 1000;

export const answerValidator = v.union(v.literal("in"), v.literal("maybe"), v.literal("out"));
export type RsvpAnswer = "in" | "maybe" | "out";

export const whenValidator = v.object({ date: v.string(), time: v.string() });

const ANSWER_TOAST: Record<RsvpAnswer, string> = {
  in: "You're in 🎉",
  maybe: "Marked as maybe 🤔",
  out: "No worries — next time 👋",
};

// —————————————————————— Shared helpers ——————————————————————

export async function findHangoutByCode(ctx: QueryCtx | MutationCtx, code: string) {
  return ctx.db
    .query("hangouts")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}

async function requireHangout(ctx: QueryCtx | MutationCtx, code: string) {
  const hangout = await findHangoutByCode(ctx, code);
  if (!hangout) throw new ConvexError("That hangout isn't here any more.");
  return hangout;
}

export async function rsvpsFor(ctx: QueryCtx | MutationCtx, hangoutId: Id<"hangouts">) {
  const rows = await ctx.db
    .query("rsvps")
    .withIndex("by_hangout", (q) => q.eq("hangoutId", hangoutId))
    .collect();
  rows.sort((a, b) => a.updatedAt - b.updatedAt);
  return rows;
}

/** The three lists the chat card and the app both show, in reply order. */
export function splitRsvps(rows: Doc<"rsvps">[]) {
  return {
    in: rows.filter((row) => row.answer === "in").map((row) => row.name),
    maybe: rows.filter((row) => row.answer === "maybe").map((row) => row.name),
    out: rows.filter((row) => row.answer === "out").map((row) => row.name),
  };
}

/** Same trick as the round scoreboard: a burst of taps must coalesce into one
 *  message edit, because Telegram rate limits them. */
async function scheduleCardRefresh(ctx: MutationCtx, hangout: Doc<"hangouts">) {
  if (hangout.tgMessageId === undefined || hangout.tgRefreshPending) return;
  await ctx.db.patch(hangout._id, { tgRefreshPending: true });
  await ctx.scheduler.runAfter(CARD_REFRESH_DEBOUNCE_MS, internal.telegram.refreshHangoutCard, {
    hangoutId: hangout._id,
  });
}

/**
 * Books (or re-books) the day-of nudge. The old job is always cancelled first,
 * so moving a hangout can never leave two reminders racing each other, and a
 * hangout moved to a time too close to now simply loses its reminder.
 */
async function rescheduleReminder(ctx: MutationCtx, hangout: Doc<"hangouts">) {
  if (hangout.reminderJobId) {
    await ctx.scheduler.cancel(hangout.reminderJobId);
  }
  const startsAt = hangout.startsAt;
  const remindAt =
    hangout.status === "open" && startsAt !== undefined
      ? reminderTimeFor(startsAt, Date.now())
      : null;
  if (remindAt === null) {
    await ctx.db.patch(hangout._id, { reminderJobId: undefined });
    return;
  }
  const jobId = await ctx.scheduler.runAt(remindAt, internal.telegram.sendHangoutReminder, {
    hangoutId: hangout._id,
  });
  await ctx.db.patch(hangout._id, { reminderJobId: jobId });
}

/** Called from rooms.ts the instant a round lands on a winner, so a hangout
 *  that outsourced its "where?" gets the answer without a second step. */
export async function applyRoundWinnerToHangout(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  winnerText: string,
) {
  if (!room.hangoutId) return;
  const hangout = await ctx.db.get(room.hangoutId);
  if (!hangout || hangout.status === "cancelled") return;
  const place = tidyText(winnerText, MAX_PLACE_LENGTH);
  await ctx.db.patch(hangout._id, { place });
  await scheduleCardRefresh(ctx, { ...hangout, place });
}

async function requireSession(ctx: QueryCtx | MutationCtx, token: string) {
  const session = await sessionFromToken(ctx, token);
  if (!session) throw new ConvexError("Your session expired — reopen Munch from the chat.");
  return session;
}

/** Every host write funnels through this: the hangout has to belong to the
 *  group the token was granted for, and only the host may change the plan. */
async function requireHost(ctx: MutationCtx, code: string, token: string) {
  const session = await requireSession(ctx, token);
  const hangout = await requireHangout(ctx, code);
  if (hangout.tgChatId !== session.tgChatId) throw new ConvexError("Wrong group.");
  if (hangout.tgHostUserId !== session.tgUserId) {
    throw new ConvexError(`Only ${hangout.hostName} can change this hangout.`);
  }
  if (hangout.status === "cancelled") throw new ConvexError("This hangout was cancelled.");
  return { hangout, session };
}

async function writeRsvp(
  ctx: MutationCtx,
  hangout: Doc<"hangouts">,
  who: { tgUserId: number; name: string; answer: RsvpAnswer },
) {
  const name = tidyText(who.name, MAX_NAME_LENGTH) || "Someone";
  const existing = await ctx.db
    .query("rsvps")
    .withIndex("by_hangout_user", (q) =>
      q.eq("hangoutId", hangout._id).eq("tgUserId", who.tgUserId),
    )
    .unique();
  if (existing) {
    // Re-tapping the same answer still refreshes the snapshotted name, and the
    // card refresh is debounced anyway, so this needs no early return.
    await ctx.db.patch(existing._id, { name, answer: who.answer, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("rsvps", {
      hangoutId: hangout._id,
      tgUserId: who.tgUserId,
      name,
      answer: who.answer,
      updatedAt: Date.now(),
    });
  }
  await scheduleCardRefresh(ctx, hangout);
}

// —————————————————————— Internal: the bot's side ——————————————————————

/** /hangout — a draft nobody can RSVP to until the host publishes it. */
export const createDraft = internalMutation({
  args: {
    chatId: v.number(),
    hostTgUserId: v.number(),
    hostName: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const code = crypto.randomUUID();
    const hangoutId = await ctx.db.insert("hangouts", {
      code,
      title: tidyText(args.title ?? "", MAX_TITLE_LENGTH) || "Hangout",
      hostName: tidyText(args.hostName, MAX_NAME_LENGTH) || "Host",
      tgChatId: args.chatId,
      tgHostUserId: args.hostTgUserId,
      status: "draft",
      createdAt: Date.now(),
    });
    return { hangoutId, code };
  },
});

/** Everything telegram.ts needs to draw a card or a reminder. */
export const cardState = internalQuery({
  args: { hangoutId: v.id("hangouts") },
  handler: async (ctx, { hangoutId }) => {
    const hangout = await ctx.db.get(hangoutId);
    if (!hangout) return null;
    const room = hangout.roomId ? await ctx.db.get(hangout.roomId) : null;
    return { hangout, rsvps: splitRsvps(await rsvpsFor(ctx, hangoutId)), room };
  },
});

export const setCardMessage = internalMutation({
  args: { hangoutId: v.id("hangouts"), messageId: v.number() },
  handler: async (ctx, { hangoutId, messageId }) => {
    await ctx.db.patch(hangoutId, { tgMessageId: messageId });
  },
});

/** Cleared before the render, so a tap landing mid-render books a fresh pass
 *  instead of being swallowed. */
export const clearCardRefreshPending = internalMutation({
  args: { hangoutId: v.id("hangouts") },
  handler: async (ctx, { hangoutId }) => {
    await ctx.db.patch(hangoutId, { tgRefreshPending: undefined });
  },
});

export const markReminded = internalMutation({
  args: { hangoutId: v.id("hangouts") },
  handler: async (ctx, { hangoutId }) => {
    await ctx.db.patch(hangoutId, { remindedAt: Date.now(), reminderJobId: undefined });
  },
});

/**
 * An RSVP tapped straight on the chat card. The Telegram user comes from the
 * signed webhook update, so no access token is involved — anyone who can see
 * the message is in the group by definition.
 */
export const rsvpFromChat = internalMutation({
  args: {
    code: v.string(),
    tgUserId: v.number(),
    name: v.string(),
    answer: answerValidator,
  },
  handler: async (ctx, { code, tgUserId, name, answer }) => {
    const hangout = await findHangoutByCode(ctx, code);
    if (!hangout) return { ok: false as const, message: "That hangout is gone." };
    if (hangout.status !== "open") {
      return { ok: false as const, message: "This hangout isn't taking replies." };
    }
    await writeRsvp(ctx, hangout, { tgUserId, name, answer });
    return { ok: true as const, message: ANSWER_TOAST[answer] };
  },
});

/** Backs /plans: what this chat still has coming up. */
export const openChatHangouts = internalQuery({
  args: { chatId: v.number() },
  handler: async (ctx, { chatId }) => {
    const rows = await ctx.db
      .query("hangouts")
      .withIndex("by_tg_chat", (q) => q.eq("tgChatId", chatId))
      .order("desc")
      .take(MAX_FEED_HANGOUTS);
    const cutoff = Date.now() - RECENTLY_STARTED_MS;
    return rows
      .filter((row) => row.status === "open" && (row.startsAt ?? 0) > cutoff)
      .sort((a, b) => (a.startsAt ?? a.createdAt) - (b.startsAt ?? b.createdAt))
      .map((row) => ({ code: row.code, title: row.title, startsAt: row.startsAt, place: row.place }));
  },
});

/** enterGroup resolves a startapp code to its chat, and the code may name
 *  either a hangout or a round. */
export const chatForHangoutCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const hangout = await findHangoutByCode(ctx, code);
    return hangout ? { tgChatId: hangout.tgChatId } : null;
  },
});

// —————————————————————— Queries the Mini App reads ——————————————————————

function publicHangout(hangout: Doc<"hangouts">, room: Doc<"rooms"> | null) {
  const { tgChatId, tgHostUserId, tgMessageId, tgRefreshPending, reminderJobId, ...rest } = hangout;
  return {
    ...rest,
    when: hangout.startsAt !== undefined ? epochToWhen(hangout.startsAt) : null,
    // The round is summarised rather than linked, so the hangout screen can say
    // "still voting" without opening a second subscription.
    round: room
      ? { code: room.code, decided: Boolean(room.winnerOptionId), closed: Boolean(room.closedAt) }
      : null,
  };
}

export const getHangout = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    // A non-member holds no token, so they get the same answer as a bad code.
    const session = await sessionFromToken(ctx, token);
    if (!session) return null;
    const hangout = await findHangoutByCode(ctx, code);
    if (!hangout || hangout.tgChatId !== session.tgChatId) return null;

    const rows = await rsvpsFor(ctx, hangout._id);
    const room = hangout.roomId ? await ctx.db.get(hangout.roomId) : null;
    const mine = rows.find((row) => row.tgUserId === session.tgUserId);
    return {
      hangout: publicHangout(hangout, room),
      rsvps: splitRsvps(rows),
      myAnswer: mine?.answer ?? null,
      viewerIsHost: hangout.tgHostUserId === session.tgUserId,
    };
  },
});

/**
 * The group's plans, soonest first. The token already names the chat, so this
 * needs no code — which is what lets the Mini App open on a useful screen when
 * it was launched from the bot profile with nothing attached.
 */
export const groupFeed = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await sessionFromToken(ctx, token);
    if (!session) return null;
    const rows = await ctx.db
      .query("hangouts")
      .withIndex("by_tg_chat", (q) => q.eq("tgChatId", session.tgChatId))
      .order("desc")
      .take(MAX_FEED_HANGOUTS);

    const now = Date.now();
    const cards = await Promise.all(
      rows.map(async (row) => {
        const room = row.roomId ? await ctx.db.get(row.roomId) : null;
        const rsvps = await rsvpsFor(ctx, row._id);
        return {
          code: row.code,
          title: row.title,
          hostName: row.hostName,
          status: row.status,
          startsAt: row.startsAt,
          place: row.place,
          createdAt: row.createdAt,
          goingCount: rsvps.filter((rsvp) => rsvp.answer === "in").length,
          deciding: Boolean(room && !room.winnerOptionId && !room.closedAt),
          mine: row.tgHostUserId === session.tgUserId,
          // A draft belongs to its host alone, so a half-written plan never
          // shows up in everyone else's list.
          hidden: row.status === "draft" && row.tgHostUserId !== session.tgUserId,
        };
      }),
    );

    type Card = (typeof cards)[number];
    const visible = cards.filter((card) => !card.hidden);
    const isUpcoming = (card: Card) =>
      card.status !== "cancelled" &&
      (card.startsAt === undefined || card.startsAt > now - RECENTLY_STARTED_MS);

    return {
      upcoming: visible
        .filter(isUpcoming)
        .sort((a, b) => (a.startsAt ?? a.createdAt) - (b.startsAt ?? b.createdAt)),
      past: visible.filter((card) => !isUpcoming(card)),
    };
  },
});

// —————————————————————— Mutations the Mini App calls ——————————————————————

export const setRsvp = mutation({
  args: { code: v.string(), token: v.string(), answer: answerValidator },
  handler: async (ctx, { code, token, answer }) => {
    const session = await requireSession(ctx, token);
    const hangout = await requireHangout(ctx, code);
    if (hangout.tgChatId !== session.tgChatId) throw new ConvexError("Wrong group.");
    if (hangout.status !== "open") throw new ConvexError("This hangout isn't taking replies.");
    await writeRsvp(ctx, hangout, {
      tgUserId: session.tgUserId,
      name: session.name,
      answer,
    });
  },
});

/**
 * The host's form, saved whole. Passing `decideWithWheel` hands the "where?"
 * question to a Munch round: one is created on first use and reused after, so
 * toggling back and forth doesn't litter the group with dead rounds.
 */
export const saveDetails = mutation({
  args: {
    code: v.string(),
    token: v.string(),
    title: v.string(),
    when: v.optional(whenValidator),
    place: v.optional(v.string()),
    decideWithWheel: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { hangout } = await requireHost(ctx, args.code, args.token);

    const title = tidyText(args.title, MAX_TITLE_LENGTH);
    if (!title) throw new ConvexError("Give the hangout a name.");
    if (args.when && !isValidWhen(args.when as LocalWhen)) {
      throw new ConvexError("That date and time don't look right.");
    }
    const startsAt = args.when ? whenToEpoch(args.when as LocalWhen) : undefined;
    const typedPlace = tidyText(args.place ?? "", MAX_PLACE_LENGTH);

    // A round that already landed on a winner has answered the question for
    // good, so "let the group decide" must not wipe the place it produced.
    const existingRoom = hangout.roomId ? await ctx.db.get(hangout.roomId) : null;
    const roundAlreadyDecided = Boolean(existingRoom?.winnerOptionId);
    const decideWithWheel = args.decideWithWheel && !roundAlreadyDecided;

    let roomId = hangout.roomId;
    if (decideWithWheel && !roomId) {
      roomId = await ctx.db.insert("rooms", {
        code: crypto.randomUUID(),
        title,
        hostName: hangout.hostName,
        tgChatId: hangout.tgChatId,
        tgHostUserId: hangout.tgHostUserId,
        phase: "collecting",
        hangoutId: hangout._id,
        createdAt: Date.now(),
      });
    }

    await ctx.db.patch(hangout._id, {
      title,
      startsAt,
      // A typed place wins over the wheel; choosing the wheel clears the place
      // so the card can never claim two different answers at once.
      place: decideWithWheel ? undefined : typedPlace || hangout.place,
      roomId,
    });

    const saved = (await ctx.db.get(hangout._id))!;
    // Moving the hangout moves its reminder, so this runs on every save.
    await rescheduleReminder(ctx, saved);
    await scheduleCardRefresh(ctx, saved);
  },
});

/** Publishing is the moment the plan becomes everyone's. telegram.ts posts the
 *  fresh card straight after, so the chat actually gets a notification. */
export const markPublished = internalMutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { hangout } = await requireHost(ctx, code, token);
    if (hangout.startsAt === undefined) throw new ConvexError("Set a day and a time first.");
    if (hangout.status === "draft") {
      await ctx.db.patch(hangout._id, { status: "open" });
    }
    const published = (await ctx.db.get(hangout._id))!;
    await rescheduleReminder(ctx, published);
    // Re-publishing an open hangout is how the host bumps it back down a busy
    // chat, so the old card is always superseded rather than left in place.
    return { hangoutId: hangout._id, previousMessageId: hangout.tgMessageId };
  },
});

export const markCancelled = internalMutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { hangout } = await requireHost(ctx, code, token);
    if (hangout.reminderJobId) await ctx.scheduler.cancel(hangout.reminderJobId);
    await ctx.db.patch(hangout._id, { status: "cancelled", reminderJobId: undefined });
    // A round left open would keep collecting votes for a hangout that is off.
    if (hangout.roomId) {
      const room = await ctx.db.get(hangout.roomId);
      if (room && !room.closedAt) await ctx.db.patch(room._id, { closedAt: Date.now() });
    }
    return { hangoutId: hangout._id, announce: hangout.status === "open" };
  },
});
