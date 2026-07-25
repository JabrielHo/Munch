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

/** How long a grant survives without a fresh getChatMember behind it. The
 *  client re-enters every 5 minutes (REFRESH_MS in src/lib/session.ts) and
 *  enterRoom re-checks membership whenever the last check is over 4 minutes
 *  old, so a live session's checkedAt is never more than ~5 minutes stale —
 *  this bound is three missed refreshes' slack. It exists because expiresAt
 *  alone can't revoke: a client that simply stops calling enterRoom (or a
 *  token lifted out of localStorage and replayed straight at the deployment)
 *  would otherwise keep full access for the rest of the hour after its holder
 *  is kicked from the group. */
export const SESSION_MAX_STALE_MS = 15 * 60 * 1000;

/** Resolve an access token to the member it was granted to, or null if the
 *  token is unknown, expired, or no longer backed by a recent membership
 *  check. The single trust anchor for the client-facing reads/writes:
 *  identity (clientId, name) comes from HERE, never from client args, so a
 *  member can't act as anyone else and a non-member has no token at all. See
 *  enterRoom in telegram.ts for how grants are minted. */
export async function sessionFromToken(ctx: QueryCtx | MutationCtx, token: string) {
  if (!token) return null;
  const s = await ctx.db
    .query("roomSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!s || s.expiresAt < Date.now()) return null;
  // Revocation is server-driven: membership must have been confirmed recently,
  // not merely at some point inside the grant's lifetime. Dev grants carry no
  // membership check at all (devGrantSession), so staleness means nothing there.
  if (!s.dev && Date.now() - s.checkedAt > SESSION_MAX_STALE_MS) return null;
  return { tgChatId: s.tgChatId, tgUserId: s.tgUserId, clientId: `tg:${s.tgUserId}`, name: s.name };
}

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
