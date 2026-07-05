import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { roomByCode, sessionFromToken } from "./lib";

// Someone counts as "here" if we've heard from them in the last 4s. Clients
// heartbeat every ~1.5s (even while the Mini App is backgrounded), so this is a
// ~2.6x grace window that tolerates background timer throttling — a member who
// switches back to the chat keeps their slot. It's also the fallback that drops
// someone when the webview is fully closed and the on-close beacon (see
// http.ts /leave) gets dropped during teardown.
const ACTIVE_WINDOW_MS = 4_000;

/** Upsert this member's presence row with a fresh timestamp. Identity comes
 *  from the access token — a non-member has none, so they can't appear "here". */
export const heartbeat = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const session = await sessionFromToken(ctx, token);
    if (!session) return;
    const room = await roomByCode(ctx, code);
    if (!room || room.tgChatId !== session.tgChatId) return;

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_room_client", (q) =>
        q.eq("roomId", room._id).eq("clientId", session.clientId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { name: session.name, lastSeen: Date.now() });
    } else {
      await ctx.db.insert("presence", {
        roomId: room._id,
        clientId: session.clientId,
        name: session.name,
        lastSeen: Date.now(),
      });
    }
  },
});

/** Explicitly drop this member's presence (called when they leave the room). */
export const leave = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const session = await sessionFromToken(ctx, token);
    if (!session) return;
    const room = await roomByCode(ctx, code);
    if (!room || room.tgChatId !== session.tgChatId) return;
    const row = await ctx.db
      .query("presence")
      .withIndex("by_room_client", (q) =>
        q.eq("roomId", room._id).eq("clientId", session.clientId),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

/** Who's currently in the room (active within the window). */
export const here = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const empty = { count: 0, names: [] as string[] };
    const session = await sessionFromToken(ctx, token);
    if (!session) return empty;
    const room = await roomByCode(ctx, code);
    if (!room || room.tgChatId !== session.tgChatId) return empty;

    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    const active = rows.filter((r) => r.lastSeen >= cutoff);
    return {
      count: active.length,
      names: active.map((r) => r.name).slice(0, 12),
    };
  },
});
