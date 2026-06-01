import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { roomByCode, clean, MAX_NAME } from "./lib";

// Someone counts as "here" if we've heard from them in the last 4s. Clients
// heartbeat every ~1.5s (even while the tab is hidden), so this is a ~2.6x grace
// window that tolerates background timer throttling — a tabbed-away user keeps
// their slot. It's also the fallback that drops a guest when the browser/window
// is fully closed and the on-close beacon gets dropped during teardown.
const ACTIVE_WINDOW_MS = 4_000;

/** Upsert this client's presence row with a fresh timestamp. */
export const heartbeat = mutation({
  args: { code: v.string(), clientId: v.string(), name: v.string() },
  handler: async (ctx, { code, clientId, name }) => {
    const room = await roomByCode(ctx, code);
    if (!room) return;

    const who = clean(name, MAX_NAME) || "Someone";
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_room_client", (q) => q.eq("roomId", room._id).eq("clientId", clientId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { name: who, lastSeen: Date.now() });
    } else {
      await ctx.db.insert("presence", {
        roomId: room._id,
        clientId,
        name: who,
        lastSeen: Date.now(),
      });
    }
  },
});

/** Explicitly drop this client's presence (called when they leave the room). */
export const leave = mutation({
  args: { code: v.string(), clientId: v.string() },
  handler: async (ctx, { code, clientId }) => {
    const room = await roomByCode(ctx, code);
    if (!room) return;
    const row = await ctx.db
      .query("presence")
      .withIndex("by_room_client", (q) => q.eq("roomId", room._id).eq("clientId", clientId))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

/** Who's currently in the room (active within the window). */
export const here = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await roomByCode(ctx, code);
    if (!room) return { count: 0, names: [] as string[] };

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
