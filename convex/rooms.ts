import { v, ConvexError } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { classify } from "./foods";
import { MAX_NAME, MAX_TITLE, MAX_TEXT, clean, hostNameOr, roomByCode, requireRoom, requireHost } from "./lib";

// —— Tunables ——
const MAX_OPTIONS_PER_ROOM = 60;
const MAX_OPTIONS_PER_CLIENT = 25;
const WHEEL_MAX = 8; // wheel only renders the top N for legible wedges
const SPIN_TURNS = 5; // full rotations before the wheel settles

// Playful fallback names when the host doesn't title the round.
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

// —— Helpers ——
function randomRoomName(): string {
  return ROOM_NAMES[Math.floor(Math.random() * ROOM_NAMES.length)];
}

/** Write the canonical "deciding" patch — one source of truth for both spin and
 *  lockTop, so they can't drift on which spin fields to set vs. clear. Deciding
 *  is final, so the room also closes here. */
async function decide(
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
    const userId = await getAuthUserId(ctx);
    const viewerIsHost = userId !== null && userId === room.hostUserId;

    // Resolve account holders' CURRENT names once, so a rename is reflected on
    // everything they own — not just rows written after the rename.
    const accountIds = new Set<Id<"users">>([room.hostUserId]);
    for (const r of rows) if (r.addedByUserId) accountIds.add(r.addedByUserId);
    const liveName = new Map<Id<"users">, string>();
    await Promise.all(
      [...accountIds].map(async (id) => {
        const u = await ctx.db.get(id);
        if (u?.name) liveName.set(id, u.name);
      }),
    );

    // addedByClientId is the ONLY thing gating removeOption, so it must never
    // ship to clients — exposing it would let any participant read another's id
    // and delete their option. Resolve "is this mine?" here and drop the raw ids.
    const options = rows.map(({ addedByClientId, addedByUserId, ...rest }) => ({
      ...rest,
      // Account holders show their live name; guests keep their add-time snapshot.
      addedByName: (addedByUserId && liveName.get(addedByUserId)) || rest.addedByName,
      mine: addedByClientId === clientId,
    }));
    // Don't ship the host's internal account id to anonymous participants; show
    // the host's live account name as the room's host label.
    const { hostUserId, ...roomFields } = room;
    const publicRoom = { ...roomFields, hostName: liveName.get(hostUserId) || room.hostName };
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

/** The signed-in host's recent rooms (for "jump back in" on the home screen). */
export const myRooms = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_host", (q) => q.eq("hostUserId", userId))
      .collect();
    rooms.sort((a, b) => b.createdAt - a.createdAt);
    return rooms.slice(0, 30).map((r) => ({
      code: r.code,
      title: r.title,
      closedAt: r.closedAt,
    }));
  },
});

// ——————————————————————— Mutations ———————————————————————

/** Host-only: spin up a fresh room and return its shareable code. */
export const createRoom = mutation({
  args: { title: v.string() },
  handler: async (ctx, { title }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in to start a room.");
    // The host's name is owned by their account, not passed by the client.
    const user = await ctx.db.get(userId);
    const hostName = hostNameOr(user?.name);

    // 122-bit random UUID — unguessable and unique by construction, so there's
    // no collision check and no retry loop.
    const code = crypto.randomUUID();

    await ctx.db.insert("rooms", {
      code,
      title: clean(title, MAX_TITLE) || randomRoomName(),
      hostUserId: userId,
      hostName,
      phase: "collecting",
      createdAt: Date.now(),
    });
    return { code };
  },
});

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
    if (room.closedAt) throw new ConvexError("This room is closed.");
    if (room.phase !== "collecting") {
      throw new ConvexError("The decision's already happening — hang tight!");
    }
    // If the adder is signed in (the host), tag the option with their account so
    // getRoom can show their CURRENT name even after a rename.
    const addedByUserId = await getAuthUserId(ctx);
    const who = clean(name, MAX_NAME);
    if (!who) throw new ConvexError("Add your name first.");
    const value = clean(text, MAX_TEXT);
    if (!value) throw new ConvexError("Type a place or a craving to add.");

    const all = await ctx.db
      .query("options")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    if (all.length >= MAX_OPTIONS_PER_ROOM) {
      throw new ConvexError("That's plenty of options already!");
    }
    if (all.filter((o) => o.addedByClientId === clientId).length >= MAX_OPTIONS_PER_CLIENT) {
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
      addedByClientId: clientId,
      ...(addedByUserId ? { addedByUserId } : {}),
      voteCount: 0,
      createdAt: Date.now(),
    });
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
    const userId = await getAuthUserId(ctx);
    const isHost = userId !== null && userId === room.hostUserId;
    if (option.addedByClientId !== clientId && !isHost) {
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
      return { voted: false };
    }
    await ctx.db.insert("votes", {
      roomId: room._id,
      optionId,
      voterClientId: clientId,
      voterName: who,
      createdAt: Date.now(),
    });
    await ctx.db.patch(optionId, { voteCount: option.voteCount + 1 });
    return { voted: true };
  },
});

/** Host-only: spin the wheel. Winner + final angle are computed here so every
 *  phone animates to the exact same result. */
export const spin = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await requireHost(ctx, code);
    if (room.closedAt) throw new ConvexError("This room is closed.");
    const options = await ctx.db
      .query("options")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    if (options.length === 0) throw new ConvexError("Add at least one option to spin.");

    options.sort((a, b) => b.voteCount - a.voteCount || a.createdAt - b.createdAt);
    const wheel = options.slice(0, WHEEL_MAX);

    const idx = Math.floor(Math.random() * wheel.length);
    const winner = wheel[idx];
    const seg = 360 / wheel.length;
    const jitter = (Math.random() - 0.5) * seg * 0.5;
    // Rotate so the winning wedge's centre lands under the fixed top pointer.
    const spinAngle = SPIN_TURNS * 360 - (idx * seg + seg / 2) + jitter;

    await decide(ctx, room, {
      mode: "spin",
      winnerId: winner._id,
      votes: winner.voteCount,
      spinAngle,
      wheelOptionIds: wheel.map((o) => o._id),
    });
    return { winnerOptionId: winner._id };
  },
});

/** Host-only: skip the wheel and lock in the current top-voted option. */
export const lockTop = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await requireHost(ctx, code);
    if (room.closedAt) throw new ConvexError("This room is closed.");
    const options = await ctx.db
      .query("options")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    if (options.length === 0) throw new ConvexError("Add at least one option first.");

    const max = Math.max(...options.map((o) => o.voteCount));
    const leaders = options.filter((o) => o.voteCount === max);
    const winner = leaders[Math.floor(Math.random() * leaders.length)];

    await decide(ctx, room, {
      mode: "lock",
      winnerId: winner._id,
      votes: winner.voteCount,
    });
    return { winnerOptionId: winner._id };
  },
});

/** Host-only: close the room for good. It becomes read-only for everyone — the
 *  options and the final pick stay viewable, but nothing can change and it
 *  cannot be reopened. */
export const closeRoom = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await requireHost(ctx, code);
    await ctx.db.patch(room._id, { closedAt: Date.now() });
  },
});
