import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

/**
 * Identity model:
 *  - The HOST signs in (Convex Auth) → identified by a `users` id. They own the
 *    room and are the only one who can spin / lock / reset.
 *  - PARTICIPANTS join via the link with no account, identified by a per-browser
 *    `clientId` (random id kept in localStorage) plus a required display name.
 */
export default defineSchema({
  // Tables that power Convex Auth (users, authSessions, authAccounts, …).
  ...authTables,

  rooms: defineTable({
    code: v.string(), // short shareable code, stored UPPERCASE
    title: v.string(),
    hostUserId: v.id("users"),
    hostName: v.string(),
    // "collecting" = people adding/voting; "deciding" = the synced reveal.
    phase: v.union(v.literal("collecting"), v.literal("deciding")),
    // How the current decision is being made (set when entering "deciding").
    mode: v.optional(v.union(v.literal("spin"), v.literal("lock"))),
    winnerOptionId: v.optional(v.id("options")),
    decidedVotes: v.optional(v.number()), // winner's vote count at decision time
    // Spin animation state — server-precomputed so every phone lands identically.
    spinAngle: v.optional(v.number()), // final rotation in degrees
    spinStartedAt: v.optional(v.number()), // ms epoch; clients sync from this
    wheelOptionIds: v.optional(v.array(v.id("options"))), // frozen wheel order
    closedAt: v.optional(v.number()), // host closed the room; read-only when set
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_host", ["hostUserId"]),

  options: defineTable({
    roomId: v.id("rooms"),
    text: v.string(),
    kind: v.union(v.literal("place"), v.literal("food")),
    emoji: v.string(),
    cuisine: v.optional(v.string()),
    suggestedSpot: v.optional(v.string()),
    addedByName: v.string(), // snapshot at add time; the live name wins if addedByUserId is set
    addedByClientId: v.string(),
    // Set when an account holder (the host) added it — lets getRoom resolve the
    // CURRENT account name so a rename shows up on options they already added.
    addedByUserId: v.optional(v.id("users")),
    voteCount: v.number(), // denormalized for cheap sorting/rendering
    createdAt: v.number(),
  }).index("by_room", ["roomId"]),

  votes: defineTable({
    roomId: v.id("rooms"),
    optionId: v.id("options"),
    voterClientId: v.string(),
    voterName: v.string(),
    createdAt: v.number(),
  })
    .index("by_option", ["optionId"])
    .index("by_option_client", ["optionId", "voterClientId"])
    .index("by_room_client", ["roomId", "voterClientId"]),

  presence: defineTable({
    roomId: v.id("rooms"),
    clientId: v.string(),
    name: v.string(),
    lastSeen: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_client", ["roomId", "clientId"]),
});
