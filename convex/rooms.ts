import { v, ConvexError } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { classify } from "./foods";
import { MAX_NAME, MAX_TEXT, clean, roomByCode, requireRoom } from "./lib";

/**
 * Core room logic. Rooms are created by the Telegram bot (/munch — see
 * telegram.ts); this module holds the shared domain rules plus the public
 * queries/mutations the room UI (Mini App and web guests) talks to.
 *
 * Host authority lives with the Telegram starter: UI-level checks compare the
 * viewer's clientId against "tg:<tgHostUserId>", and host ACTIONS (spin/lock/
 * end) are verified against Telegram's signed initData in telegram.ts.
 */

// —— Tunables ——
const MAX_OPTIONS_PER_ROOM = 60;
const MAX_OPTIONS_PER_CLIENT = 25;
const WHEEL_MAX = 8; // wheel only renders the top N for legible wedges
const SPIN_TURNS = 5; // full rotations before the wheel settles

// Playful fallback names when the round isn't titled.
const ROOM_NAMES = [
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

// —— Helpers (shared with telegram.ts) ——

export function randomRoomName(): string {
  return ROOM_NAMES[Math.floor(Math.random() * ROOM_NAMES.length)];
}

/** The one host check: is this clientId the Telegram user who ran /munch? */
export function isTgHost(room: Doc<"rooms">, clientId: string): boolean {
  return clientId === `tg:${room.tgHostUserId}`;
}

/** Write the canonical "deciding" patch — one source of truth for spin and
 *  lock, so they can't drift on which spin fields to set vs. clear. Deciding
 *  is final, so the room also closes here. */
export async function decide(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  opts: {
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
    mode: opts.mode,
    winnerOptionId: opts.winnerId,
    decidedVotes: opts.votes,
    spinAngle: opts.spinAngle, // a value for spin, cleared for lock
    wheelOptionIds: opts.wheelOptionIds,
    spinStartedAt: now,
    closedAt: now, // deciding is final — the room closes
  });
}

/** Pick a spin winner + the wheel geometry, server-side, so every screen
 *  (Mini App wheels, web guests) animates to the exact same result. */
export function computeSpin(options: Doc<"options">[]) {
  const sorted = [...options].sort((a, b) => b.voteCount - a.voteCount || a.createdAt - b.createdAt);
  const wheel = sorted.slice(0, WHEEL_MAX);
  const idx = Math.floor(Math.random() * wheel.length);
  const winner = wheel[idx];
  const seg = 360 / wheel.length;
  const jitter = (Math.random() - 0.5) * seg * 0.5;
  // Rotate so the winning wedge's centre lands under the fixed top pointer.
  const spinAngle = SPIN_TURNS * 360 - (idx * seg + seg / 2) + jitter;
  return { winner, spinAngle, wheelOptionIds: wheel.map((o) => o._id) };
}

/** Pick the top-voted option, breaking ties at random. */
export function pickTop(options: Doc<"options">[]) {
  const max = Math.max(...options.map((o) => o.voteCount));
  const leaders = options.filter((o) => o.voteCount === max);
  return leaders[Math.floor(Math.random() * leaders.length)];
}

/** Validate + insert an option. The single write path for the Mini App / web
 *  mutation (addOption) and the Telegram bot, so caps, dedup, and
 *  classification behave identically on both surfaces. */
export async function insertOption(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  args: { text: string; name: string; clientId: string },
) {
  if (room.closedAt) throw new ConvexError("This room is closed.");
  if (room.phase !== "collecting") {
    throw new ConvexError("The decision's already happening — hang tight!");
  }
  const who = clean(args.name, MAX_NAME);
  if (!who) throw new ConvexError("Add your name first.");
  const value = clean(args.text, MAX_TEXT);
  if (!value) throw new ConvexError("Type a place or a craving to add.");

  const all = await ctx.db
    .query("options")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
  if (all.length >= MAX_OPTIONS_PER_ROOM) {
    throw new ConvexError("That's plenty of options already!");
  }
  if (all.filter((o) => o.addedByClientId === args.clientId).length >= MAX_OPTIONS_PER_CLIENT) {
    throw new ConvexError("You've added a bunch — let the others chip in!");
  }
  const dup = all.find((o) => o.text.toLowerCase() === value.toLowerCase());
  if (dup) throw new ConvexError(`"${dup.text}" is already on the list — vote for it!`);

  const c = classify(value);
  const optionId = await ctx.db.insert("options", {
    roomId: room._id,
    text: value,
    kind: c.kind,
    emoji: c.emoji,
    ...(c.cuisine ? { cuisine: c.cuisine } : {}),
    ...(c.suggestedSpot ? { suggestedSpot: c.suggestedSpot } : {}),
    addedByName: who,
    addedByClientId: args.clientId,
    voteCount: 0,
    createdAt: Date.now(),
  });
  return { optionId, text: value, emoji: c.emoji };
}

/** Toggle a participant's vote. The single vote path for all surfaces. */
export async function toggleVoteCore(
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
  const who = clean(name, MAX_NAME);
  if (!who) throw new ConvexError("Add your name first.");

  const existing = await ctx.db
    .query("votes")
    .withIndex("by_option_client", (q) => q.eq("optionId", optionId).eq("voterClientId", clientId))
    .unique();

  if (existing) {
    await ctx.db.delete(existing._id);
    await ctx.db.patch(optionId, { voteCount: Math.max(0, option.voteCount - 1) });
    return { voted: false, option, room };
  }
  await ctx.db.insert("votes", {
    roomId: room._id,
    optionId,
    voterClientId: clientId,
    voterName: who,
    createdAt: Date.now(),
  });
  await ctx.db.patch(optionId, { voteCount: option.voteCount + 1 });
  return { voted: true, option, room };
}

// ——————————————————————— Queries ———————————————————————

/** Everything the room screen needs: room state + options sorted by votes. */
export const getRoom = query({
  args: { code: v.string(), clientId: v.string() },
  handler: async (ctx, { code, clientId }) => {
    const room = await roomByCode(ctx, code);
    if (!room) return null;
    const rows = await ctx.db
      .query("options")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    rows.sort((a, b) => b.voteCount - a.voteCount || a.createdAt - b.createdAt);

    // Host = the Telegram starter, seen from the Mini App as "tg:<their id>".
    // This flag only gates UI — host actions re-verify the signed initData.
    const viewerIsHost = isTgHost(room, clientId);

    // addedByClientId is the ONLY thing gating removeOption, so it must never
    // ship to clients — exposing it would let any participant read another's id
    // and delete their option. Resolve "is this mine?" here and drop the raw ids.
    const options = rows.map(({ addedByClientId, ...rest }) => ({
      ...rest,
      mine: addedByClientId === clientId,
    }));
    // Don't ship Telegram chat/user ids to room viewers.
    const { tgChatId, tgHostUserId, tgMessageId, ...publicRoom } = room;
    return { room: publicRoom, options, viewerIsHost };
  },
});

/** The option ids the given participant has voted for (for the "you voted" fill). */
export const myVotes = query({
  args: { code: v.string(), clientId: v.string() },
  handler: async (ctx, { code, clientId }) => {
    const room = await roomByCode(ctx, code);
    if (!room) return [];
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_room_client", (q) => q.eq("roomId", room._id).eq("voterClientId", clientId))
      .collect();
    return votes.map((vote) => vote.optionId);
  },
});

// ——————————————————————— Mutations ———————————————————————

/** Anyone in the room: add a place or a craving. Auto-classified by foods.ts. */
export const addOption = mutation({
  args: {
    code: v.string(),
    text: v.string(),
    name: v.string(),
    clientId: v.string(),
  },
  handler: async (ctx, { code, text, name, clientId }) => {
    const room = await requireRoom(ctx, code);
    const { optionId } = await insertOption(ctx, room, { text, name, clientId });
    return { optionId };
  },
});

/** Remove an option (only the person who added it, or the host). */
export const removeOption = mutation({
  args: { optionId: v.id("options"), clientId: v.string() },
  handler: async (ctx, { optionId, clientId }) => {
    const option = await ctx.db.get(optionId);
    if (!option) return;
    const room = await ctx.db.get(option.roomId);
    if (!room) return;
    if (room.closedAt) throw new ConvexError("This room is closed.");
    if (room.phase !== "collecting") {
      throw new ConvexError("Can't change options mid-decision.");
    }
    if (option.addedByClientId !== clientId && !isTgHost(room, clientId)) {
      throw new ConvexError("You can only remove options you added.");
    }
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_option", (q) => q.eq("optionId", optionId))
      .collect();
    await Promise.all(votes.map((vote) => ctx.db.delete(vote._id)));
    await ctx.db.delete(optionId);
  },
});

/** Toggle this participant's vote on an option (one vote per person per option). */
export const toggleVote = mutation({
  args: { optionId: v.id("options"), clientId: v.string(), name: v.string() },
  handler: async (ctx, { optionId, clientId, name }) => {
    const { voted } = await toggleVoteCore(ctx, optionId, clientId, name);
    return { voted };
  },
});
