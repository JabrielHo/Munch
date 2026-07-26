import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { findRoomByCode, sessionFromToken } from "./lib";

// Someone counts as "here" if we've heard from them this recently. Clients beat
// every ~1.5s even while the Mini App is backgrounded, so this leaves roughly
// 2.6x of grace for throttled background timers — a member who flicks back to
// the chat keeps their slot. It is also the fallback that drops someone when
// the webview is closed outright and the leave beacon (http.ts) never lands.
const ACTIVE_WINDOW_MS = 4_000;

const NOBODY_HERE = { count: 0, names: [] as string[] };
const MAX_NAMES_SHOWN = 12;

/** Identity comes from the access token, so someone outside the group cannot
 *  appear "here". */
export const heartbeat = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const session = await sessionFromToken(ctx, token);
    if (!session) return;
    const room = await findRoomByCode(ctx, code);
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

export const leave = mutation({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const session = await sessionFromToken(ctx, token);
    if (!session) return;
    const room = await findRoomByCode(ctx, code);
    if (!room || room.tgChatId !== session.tgChatId) return;
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_room_client", (q) =>
        q.eq("roomId", room._id).eq("clientId", session.clientId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const here = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const session = await sessionFromToken(ctx, token);
    if (!session) return NOBODY_HERE;
    const room = await findRoomByCode(ctx, code);
    if (!room || room.tgChatId !== session.tgChatId) return NOBODY_HERE;

    const seenSince = Date.now() - ACTIVE_WINDOW_MS;
    const everyone = await ctx.db
      .query("presence")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    const active = everyone.filter((member) => member.lastSeen >= seenSince);
    return {
      count: active.length,
      names: active.map((member) => member.name).slice(0, MAX_NAMES_SHOWN),
    };
  },
});
