import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

export const MAX_NAME_LENGTH = 20;
export const MAX_TITLE_LENGTH = 40;
export const MAX_OPTION_LENGTH = 60;

/** Collapses runs of whitespace inside the text as well as trimming the ends. */
export function tidyText(text: string, maxLength: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** The one option ordering, shared by the room screen, the wheel and the chat
 *  scoreboard so the three can never disagree about who is winning. */
export function byMostVotesFirst(
  a: { voteCount: number; createdAt: number },
  b: { voteCount: number; createdAt: number },
): number {
  return b.voteCount - a.voteCount || a.createdAt - b.createdAt;
}

export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function telegramFullName(user: {
  first_name?: string;
  last_name?: string;
  username?: string;
}): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "";
}

export function voteWord(count: number): string {
  return count === 1 ? "vote" : "votes";
}

/** Shared with the History screen, which re-derives the same rule at render
 *  time — hence living here rather than in rooms.ts. */
export const ANYONE_CAN_CLOSE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Expiry alone cannot revoke access: a client that quietly stops calling
 *  enterRoom — or a token lifted out of localStorage and replayed straight at
 *  the deployment — would keep working for the rest of the hour after its
 *  holder is kicked out. Live clients re-check every ~5 minutes, so this is
 *  three missed refreshes of slack. */
export const MEMBERSHIP_CHECK_MAX_AGE_MS = 15 * 60 * 1000;

/** Identity comes from here and never from client arguments, so a member cannot
 *  act as anyone else and a non-member has no token at all. Grants are minted
 *  by enterRoom in telegram.ts. */
export async function sessionFromToken(ctx: QueryCtx | MutationCtx, token: string) {
  if (!token) return null;
  const grant = await ctx.db
    .query("roomSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!grant || grant.expiresAt < Date.now()) return null;
  // Dev grants were never membership-checked, so staleness means nothing there.
  if (!grant.dev && Date.now() - grant.checkedAt > MEMBERSHIP_CHECK_MAX_AGE_MS) return null;
  return {
    tgChatId: grant.tgChatId,
    tgUserId: grant.tgUserId,
    clientId: `tg:${grant.tgUserId}`,
    name: grant.name,
  };
}

export async function findRoomByCode(ctx: QueryCtx | MutationCtx, code: string) {
  return ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}

export async function requireRoom(ctx: QueryCtx | MutationCtx, code: string) {
  const room = await findRoomByCode(ctx, code);
  if (!room) {
    throw new ConvexError("That room doesn't exist — double-check the code.");
  }
  return room;
}
