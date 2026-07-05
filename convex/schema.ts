import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Identity model:
 *  - Rooms are born in a Telegram group chat (/munch). The HOST is the
 *    Telegram user who started the round (tgHostUserId) — no accounts anywhere.
 *  - PARTICIPANTS are Telegram users, identified as clientId
 *    "tg:<telegram user id>" — the chat's vote buttons and the Mini App
 *    resolve to the same id, so one person is one voter on both surfaces.
 *  - Browser sessions without Telegram (dev/testing) fall back to a
 *    per-browser random clientId; there is no standalone web flow.
 */
export default defineSchema({
  rooms: defineTable({
    code: v.string(), // random UUID in the Mini App startapp link — unguessable
    title: v.string(),
    hostName: v.string(), // snapshot of the starter's Telegram name
    tgChatId: v.number(), // the group chat the session lives in
    tgHostUserId: v.number(), // Telegram user who ran /munch
    tgMessageId: v.optional(v.number()), // the bot's live session message (edited in place)
    tgRefreshPending: v.optional(v.boolean()), // a scoreboard re-render is scheduled (debounce)
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
    closedAt: v.optional(v.number()), // closed by the host; read-only when set
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    // closedAt second, so "the open room in this chat" is an index range —
    // chats accumulate closed rounds forever and lookups must not scan them.
    .index("by_tg_chat", ["tgChatId", "closedAt"]),

  options: defineTable({
    roomId: v.id("rooms"),
    text: v.string(),
    kind: v.union(v.literal("place"), v.literal("food")),
    emoji: v.string(),
    cuisine: v.optional(v.string()),
    suggestedSpot: v.optional(v.string()),
    addedByName: v.string(), // snapshot at add time
    addedByClientId: v.string(),
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

  // Access grants: proof that a Telegram user is a current member of a group.
  // Minted by enterRoom (telegram.ts) after a getChatMember check, then
  // presented as `token` by every read/write so the client can't spoof
  // identity or reach a chat it doesn't belong to. Short-lived + re-checked.
  roomSessions: defineTable({
    token: v.string(), // random capability the client holds
    tgChatId: v.number(), // the group this grant is scoped to
    tgUserId: v.number(), // the verified member
    name: v.string(), // their Telegram name, snapshotted (never client-supplied)
    checkedAt: v.number(), // last successful getChatMember (drives re-check cadence)
    expiresAt: v.number(), // grant lifetime; queries/mutations reject once past
  })
    .index("by_token", ["token"])
    .index("by_chat_user", ["tgChatId", "tgUserId"]),
});
