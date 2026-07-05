import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

// Input caps, shared by every mutation that validates text.
export const MAX_NAME = 20;
export const MAX_TITLE = 40;
export const MAX_TEXT = 60;

/** Collapse whitespace, trim, and cap length. */
export function clean(s: string, max: number): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

/** The one option ordering: most votes first, then first-added. Shared by the
 *  room query, the wheel, and the bot's keyboard so they can't disagree. */
export function byVotesDesc(
  a: { voteCount: number; createdAt: number },
  b: { voteCount: number; createdAt: number },
): number {
  return b.voteCount - a.voteCount || a.createdAt - b.createdAt;
}

/** Google Maps search link — used by the bot's result message and the Mini
 *  App result card alike. */
export function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** A Telegram user's human name: full name, else username, else "". Shared by
 *  the bot (chat rendering) and the Mini App (pre-seeding the display name). */
export function tgFullName(u: {
  first_name?: string;
  last_name?: string;
  username?: string;
}): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "";
}

/** "vote"/"votes" — one pluralization for the bot message and the Mini App cards. */
export function voteWord(n: number): string {
  return n === 1 ? "vote" : "votes";
}

/** After this age, ANYONE in the group may close a lingering open round (the
 *  starter can always close their own). Lives here (not rooms.ts) because the
 *  History page computes the same freshness client-side at render time. */
export const OLD_ROUND_CLOSE_MS = 24 * 60 * 60 * 1000;

/** Look up a room by its room code — an opaque token, matched exactly. */
export async function roomByCode(ctx: QueryCtx | MutationCtx, code: string) {
  return ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}

/** Like roomByCode, but throws a friendly error when the room is missing. */
export async function requireRoom(ctx: QueryCtx | MutationCtx, code: string) {
  const room = await roomByCode(ctx, code);
  if (!room) {
    throw new ConvexError("That room doesn't exist — double-check the code.");
  }
  return room;
}
