import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Everything here is born in a Telegram group chat. A hangout is the plan —
 * when, where, and who is coming. A room is the smaller thing: one round of
 * picking a place by voting or spinning the wheel, either standalone (/munch)
 * or attached to a hangout whose place is still up in the air.
 *
 * Whoever ran the command hosts it; everyone else is just a Telegram user,
 * identified as clientId "tg:<telegram user id>". There are no accounts
 * anywhere.
 */
export default defineSchema({
  // The plan itself: /hangout posts a live RSVP card straight away and the host
  // fills in the details afterwards, which the bot edits into the same message.
  // A hangout is real from the moment it is created — there is no draft step.
  hangouts: defineTable({
    code: v.string(), // random UUID; rides in the Mini App's startapp link
    title: v.string(),
    hostName: v.string(), // the creator's Telegram name, snapshotted at /hangout
    tgChatId: v.number(),
    tgHostUserId: v.number(),
    tgMessageId: v.optional(v.number()), // the bot's card, edited in place
    tgRefreshPending: v.optional(v.boolean()), // a card re-render is already scheduled
    // "cancelled" = called off, read-only forever.
    status: v.union(v.literal("open"), v.literal("cancelled")),
    // Unset until the host picks a day, which the card shows as "TBC". People
    // can still say they're coming before then.
    startsAt: v.optional(v.number()), // ms epoch; the wall clock is Singapore time
    place: v.optional(v.string()), // typed by the host, or copied from a decided round
    // Set when the group is deciding the place with the wheel instead. The
    // round's winner is written back into `place` when it lands.
    roomId: v.optional(v.id("rooms")),
    // The scheduled day-of reminder, kept so moving the hangout can cancel it.
    reminderJobId: v.optional(v.id("_scheduled_functions")),
    remindedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_tg_chat", ["tgChatId", "createdAt"]),

  // One row per person per hangout, rewritten in place when they change their
  // mind. tgUserId comes from the tapped button or the access token, never from
  // a client argument.
  rsvps: defineTable({
    hangoutId: v.id("hangouts"),
    tgUserId: v.number(),
    name: v.string(),
    answer: v.union(v.literal("in"), v.literal("maybe"), v.literal("out")),
    updatedAt: v.number(),
  })
    .index("by_hangout", ["hangoutId"])
    .index("by_hangout_user", ["hangoutId", "tgUserId"]),

  rooms: defineTable({
    code: v.string(), // random UUID; rides in the Mini App's startapp link
    title: v.string(),
    hostName: v.string(), // the starter's Telegram name, snapshotted at /munch
    tgChatId: v.number(),
    tgHostUserId: v.number(), // the Telegram user who ran /munch
    tgMessageId: v.optional(v.number()), // the bot's scoreboard message, edited in place
    tgRefreshPending: v.optional(v.boolean()), // a scoreboard re-render is already scheduled
    // "collecting" = people adding and voting; "deciding" = the synced reveal.
    phase: v.union(v.literal("collecting"), v.literal("deciding")),
    mode: v.optional(v.union(v.literal("spin"), v.literal("lock"))),
    winnerOptionId: v.optional(v.id("options")),
    decidedVotes: v.optional(v.number()), // the winner's vote count at decision time
    // Spin animation, precomputed server-side so every phone lands identically.
    spinAngle: v.optional(v.number()), // final rotation in degrees
    spinStartedAt: v.optional(v.number()), // ms epoch; clients sync their animation to it
    wheelOptionIds: v.optional(v.array(v.id("options"))), // frozen wheel order
    closedAt: v.optional(v.number()), // set = read-only, forever
    // Set when this round exists to answer a hangout's "where?". The winner is
    // written back to that hangout's `place`.
    hangoutId: v.optional(v.id("hangouts")),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    // closedAt comes second so "the open rooms in this chat" is an index range.
    // A chat accumulates closed rounds forever and lookups must not scan them.
    .index("by_tg_chat", ["tgChatId", "closedAt"]),

  options: defineTable({
    roomId: v.id("rooms"),
    text: v.string(),
    kind: v.union(v.literal("place"), v.literal("food")),
    emoji: v.string(),
    cuisine: v.optional(v.string()),
    suggestedSpot: v.optional(v.string()),
    addedByName: v.string(), // snapshotted at add time
    addedByClientId: v.string(),
    voteCount: v.number(), // denormalized so sorting and rendering stay cheap
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

  // Proof that a Telegram user is a current member of a group. Minted by
  // enterRoom (telegram.ts) after a getChatMember check, then presented as
  // `token` on every read and write so a client can neither spoof an identity
  // nor reach a chat it doesn't belong to.
  roomSessions: defineTable({
    token: v.string(), // the random capability the client holds
    tgChatId: v.number(), // the group this grant is scoped to
    tgUserId: v.number(), // the verified member
    name: v.string(), // their Telegram name, snapshotted (never client-supplied)
    checkedAt: v.number(), // last successful getChatMember; drives re-check cadence
    expiresAt: v.number(),
    // Set by devGrantSession for browser testing. Such a grant was never
    // membership-checked, so it is exempt from the checkedAt staleness bound
    // (see lib.ts). Only an internal mutation can set it.
    dev: v.optional(v.boolean()),
  })
    .index("by_token", ["token"])
    .index("by_chat_user", ["tgChatId", "tgUserId"]),
});
