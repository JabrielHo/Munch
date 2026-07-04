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

/** Look up a room by its share code — an opaque token, matched exactly. */
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
