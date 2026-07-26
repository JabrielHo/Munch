import { v, ConvexError } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { classify } from "./foods";
import {
  MAX_NAME_LENGTH,
  MAX_OPTION_LENGTH,
  byMostVotesFirst,
  findRoomByCode,
  requireRoom,
  sessionFromToken,
  tidyText,
} from "./lib";

/**
 * Rooms are created by the bot (/munch — see telegram.ts); this file holds the
 * rules and the queries and mutations the room screen calls.
 *
 * Authority belongs to whoever started the round. isRoundStarter enforces that
 * directly for removeOption, but the `viewerIsHost` it feeds to the client is
 * only a hint for what to draw: spin, lock and end are re-verified against
 * Telegram's signed initData over in telegram.ts.
 */

const MAX_OPTIONS_PER_ROOM = 60;
const MAX_OPTIONS_PER_PERSON = 25;
const MAX_WHEEL_WEDGES = 8; // beyond this the wedges get too thin to read
const SPIN_FULL_TURNS = 5; // whole rotations before the wheel settles
const MAX_HISTORY_ROUNDS = 50;
const CHAT_REFRESH_DEBOUNCE_MS = 2000;

const FALLBACK_ROOM_NAMES = [
  "Lunch Squad",
  "The Hungry Bunch",
  "Grub Club",
  "Snack Attack",
  "Bite Club",
  "Hangry Hour",
  "Nom Nom Crew",
  "Table for All",
  "Cravings Council",
  "The Usual Spot",
  "Dinner Debate",
  "Munch Bunch",
  "Where We Eating",
  "Plate Expectations",
  "Feast Mode",
  "Chow Down Crew",
];

export function randomRoomName(): string {
  return FALLBACK_ROOM_NAMES[Math.floor(Math.random() * FALLBACK_ROOM_NAMES.length)];
}

function isRoundStarter(room: Doc<"rooms">, clientId: string): boolean {
  return clientId === `tg:${room.tgHostUserId}`;
}

/** A burst of votes must not turn into one message edit per tap, because
 *  Telegram rate limits edits. The pending flag coalesces a burst into a single
 *  re-render; serializable mutations make the check-then-set race-free. */
async function scheduleChatRefresh(ctx: MutationCtx, room: Doc<"rooms">) {
  if (room.tgMessageId === undefined || room.tgRefreshPending) return;
  await ctx.db.patch(room._id, { tgRefreshPending: true });
  await ctx.scheduler.runAfter(CHAT_REFRESH_DEBOUNCE_MS, internal.telegram.refreshSession, {
    roomId: room._id,
  });
}

/** The one place a decision is written, so spinning and locking can never drift
 *  on which spin fields to set versus clear. */
export async function recordDecision(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  decision: {
    mode: "spin" | "lock";
    winnerId: Id<"options">;
    votes: number;
    spinAngle?: number;
    wheelOptionIds?: Id<"options">[];
  },
) {
  const now = Date.now();
  await ctx.db.patch(room._id, {
    phase: "deciding",
    mode: decision.mode,
    winnerOptionId: decision.winnerId,
    decidedVotes: decision.votes,
    spinAngle: decision.spinAngle, // a value when spinning, cleared when locking
    wheelOptionIds: decision.wheelOptionIds,
    spinStartedAt: now,
    closedAt: now, // deciding is final
  });
}

/** Computed server-side so every phone's wheel animates to the same result. */
export function computeSpinResult(options: Doc<"options">[]) {
  const wheelOptions = [...options].sort(byMostVotesFirst).slice(0, MAX_WHEEL_WEDGES);
  const winnerIndex = Math.floor(Math.random() * wheelOptions.length);
  const wedgeAngle = 360 / wheelOptions.length;
  const jitter = (Math.random() - 0.5) * wedgeAngle * 0.5;
  // Rotate so the winning wedge's centre lands under the fixed top pointer.
  const spinAngle = SPIN_FULL_TURNS * 360 - (winnerIndex * wedgeAngle + wedgeAngle / 2) + jitter;
  return {
    winner: wheelOptions[winnerIndex],
    spinAngle,
    wheelOptionIds: wheelOptions.map((option) => option._id),
  };
}

/** Ties are broken at random. */
export function pickTopVoted(options: Doc<"options">[]) {
  const topVoteCount = Math.max(...options.map((option) => option.voteCount));
  const tiedLeaders = options.filter((option) => option.voteCount === topVoteCount);
  return tiedLeaders[Math.floor(Math.random() * tiedLeaders.length)];
}

async function createOption(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  args: { text: string; name: string; clientId: string },
) {
  if (room.closedAt) throw new ConvexError("This room is closed.");
  if (room.phase !== "collecting") {
    throw new ConvexError("The decision's already happening — hang tight!");
  }
  const addedByName = tidyText(args.name, MAX_NAME_LENGTH);
  if (!addedByName) throw new ConvexError("Add your name first.");
  const text = tidyText(args.text, MAX_OPTION_LENGTH);
  if (!text) throw new ConvexError("Type a place or a craving to add.");

  const existingOptions = await ctx.db
    .query("options")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
  if (existingOptions.length >= MAX_OPTIONS_PER_ROOM) {
    throw new ConvexError("That's plenty of options already!");
  }
  const mineSoFar = existingOptions.filter((o) => o.addedByClientId === args.clientId);
  if (mineSoFar.length >= MAX_OPTIONS_PER_PERSON) {
    throw new ConvexError("You've added a bunch — let the others chip in!");
  }
  const duplicate = existingOptions.find((o) => o.text.toLowerCase() === text.toLowerCase());
  if (duplicate) {
    throw new ConvexError(`"${duplicate.text}" is already on the list — vote for it!`);
  }

  const classification = classify(text);
  const optionId = await ctx.db.insert("options", {
    roomId: room._id,
    text,
    kind: classification.kind,
    emoji: classification.emoji,
    ...(classification.cuisine ? { cuisine: classification.cuisine } : {}),
    ...(classification.suggestedSpot ? { suggestedSpot: classification.suggestedSpot } : {}),
    addedByName,
    addedByClientId: args.clientId,
    voteCount: 0,
    createdAt: Date.now(),
  });
  return { optionId };
}

async function toggleVoteOnOption(
  ctx: MutationCtx,
  optionId: Id<"options">,
  clientId: string,
  name: string,
) {
  const option = await ctx.db.get(optionId);
  if (!option) throw new ConvexError("That option's gone.");
  const room = await ctx.db.get(option.roomId);
  if (!room) throw new ConvexError("Room not found.");
  if (room.closedAt) throw new ConvexError("This room is closed.");
  if (room.phase !== "collecting") {
    throw new ConvexError("Voting's closed — it's decision time!");
  }
  const voterName = tidyText(name, MAX_NAME_LENGTH);
  if (!voterName) throw new ConvexError("Add your name first.");

  const existingVote = await ctx.db
    .query("votes")
    .withIndex("by_option_client", (q) => q.eq("optionId", optionId).eq("voterClientId", clientId))
    .unique();

  if (existingVote) {
    await ctx.db.delete(existingVote._id);
    await ctx.db.patch(optionId, { voteCount: Math.max(0, option.voteCount - 1) });
    return { voted: false };
  }
  await ctx.db.insert("votes", {
    roomId: room._id,
    optionId,
    voterClientId: clientId,
    voterName,
    createdAt: Date.now(),
  });
  await ctx.db.patch(optionId, { voteCount: option.voteCount + 1 });
  return { voted: true };
}

// ——————————————————————— Queries ———————————————————————

/** Everything the room screen needs, on one subscription. */
export const getRoom = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    // A non-member has no token, so they see the same "not here" as a bad code.
    const session = await sessionFromToken(ctx, token);
    if (!session) return null;
    const room = await findRoomByCode(ctx, code);
    if (!room || room.tgChatId !== session.tgChatId) return null;
    const clientId = session.clientId;

    const [allOptions, myVotes] = await Promise.all([
      ctx.db
        .query("options")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect(),
      ctx.db
        .query("votes")
        .withIndex("by_room_client", (q) => q.eq("roomId", room._id).eq("voterClientId", clientId))
        .collect(),
    ]);
    allOptions.sort(byMostVotesFirst);

    // addedByClientId is the ONLY thing gating removeOption, so it must never
    // reach a client — that would let any participant read someone else's id
    // and delete their option. Answer "is this mine?" here and drop the raw ids.
    const options = allOptions.map(({ addedByClientId, ...option }) => ({
      ...option,
      mine: addedByClientId === clientId,
    }));
    const { tgChatId, tgHostUserId, tgMessageId, tgRefreshPending, hostName, ...publicRoom } = room;

    return {
      room: publicRoom,
      options,
      // Only gates what the UI draws; host actions re-verify the signed initData.
      viewerIsHost: isRoundStarter(room, clientId),
      myVoteIds: myVotes.map((vote) => vote.optionId),
    };
  },
});

/** Every round this group chat has run, newest first. Holding any one round's
 *  code unlocks the whole list — you only get a code from the chat itself.
 *
 *  Returns null rather than throwing for an unknown code, like getRoom, because
 *  a thrown query error lands in React with no boundary to catch it.
 *
 *  Whether a round is still closable is deliberately NOT computed here: it
 *  depends on wall-clock age, and a reactive query only re-runs when data
 *  changes, so the flag would freeze. History derives it at render time. */
export const groupHistory = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const session = await sessionFromToken(ctx, token);
    if (!session) return null;
    const anchorRoom = await findRoomByCode(ctx, code);
    if (!anchorRoom || anchorRoom.tgChatId !== session.tgChatId) return null;
    const clientId = session.clientId;

    // Two index-bounded reads, because a chat's history grows forever. The
    // closed half comes back ordered by closedAt, so "recently closed" stands
    // in for "recent" until the merge below re-sorts by creation time.
    const [openRounds, closedRounds] = await Promise.all([
      ctx.db
        .query("rooms")
        .withIndex("by_tg_chat", (q) =>
          q.eq("tgChatId", anchorRoom.tgChatId).eq("closedAt", undefined),
        )
        .order("desc")
        .take(MAX_HISTORY_ROUNDS),
      ctx.db
        .query("rooms")
        .withIndex("by_tg_chat", (q) => q.eq("tgChatId", anchorRoom.tgChatId).gt("closedAt", 0))
        .order("desc")
        .take(MAX_HISTORY_ROUNDS),
    ]);
    const rounds = [...openRounds, ...closedRounds]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_HISTORY_ROUNDS);

    return Promise.all(
      rounds.map(async (round) => {
        const winner = round.winnerOptionId ? await ctx.db.get(round.winnerOptionId) : null;
        return {
          code: round.code,
          title: round.title,
          hostName: round.hostName,
          createdAt: round.createdAt,
          closedAt: round.closedAt,
          winner: winner ? { emoji: winner.emoji, text: winner.text } : null,
          decidedVotes: round.decidedVotes,
          mine: isRoundStarter(round, clientId),
        };
      }),
    );
  },
});

// ——————————————————————— Mutations ———————————————————————

async function requireSession(ctx: MutationCtx, token: string) {
  const session = await sessionFromToken(ctx, token);
  if (!session) throw new ConvexError("Your session expired — reopen Munch from the chat.");
  return session;
}

export const addOption = mutation({
  args: { code: v.string(), text: v.string(), token: v.string() },
  handler: async (ctx, { code, text, token }) => {
    const session = await requireSession(ctx, token);
    const room = await requireRoom(ctx, code);
    if (room.tgChatId !== session.tgChatId) throw new ConvexError("Wrong group.");
    const { optionId } = await createOption(ctx, room, {
      text,
      name: session.name,
      clientId: session.clientId,
    });
    await scheduleChatRefresh(ctx, room);
    return { optionId };
  },
});

export const removeOption = mutation({
  args: { optionId: v.id("options"), token: v.string() },
  handler: async (ctx, { optionId, token }) => {
    const session = await requireSession(ctx, token);
    const option = await ctx.db.get(optionId);
    if (!option) return;
    const room = await ctx.db.get(option.roomId);
    if (!room || room.tgChatId !== session.tgChatId) return;
    if (room.closedAt) throw new ConvexError("This room is closed.");
    if (room.phase !== "collecting") {
      throw new ConvexError("Can't change options mid-decision.");
    }
    if (option.addedByClientId !== session.clientId && !isRoundStarter(room, session.clientId)) {
      throw new ConvexError("You can only remove options you added.");
    }
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_option", (q) => q.eq("optionId", optionId))
      .collect();
    await Promise.all(votes.map((vote) => ctx.db.delete(vote._id)));
    await ctx.db.delete(optionId);
    await scheduleChatRefresh(ctx, room);
  },
});

export const toggleVote = mutation({
  args: { optionId: v.id("options"), token: v.string() },
  handler: async (ctx, { optionId, token }) => {
    const session = await requireSession(ctx, token);
    const option = await ctx.db.get(optionId);
    if (!option) throw new ConvexError("That option's gone.");
    const room = await ctx.db.get(option.roomId);
    if (!room || room.tgChatId !== session.tgChatId) throw new ConvexError("Wrong group.");
    const { voted } = await toggleVoteOnOption(ctx, optionId, session.clientId, session.name);
    await scheduleChatRefresh(ctx, room);
    return { voted };
  },
});
