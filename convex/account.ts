import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { rateLimiter } from "./rateLimits";
import { clean, hostNameOr, MAX_NAME } from "./lib";

/**
 * Returns whether an email is free to register. Lives in a mutation (not a
 * query) because rate limiting has to record usage, which queries can't do.
 * Used so "Create account" sends an existing user to sign in instead of
 * silently logging them in (the Password provider treats sign-up with a
 * matching password as a sign-in).
 */
export const checkEmail = mutation({
  args: { email: v.string(), clientId: v.string() },
  handler: async (ctx, { email, clientId }) => {
    const perDevice = await rateLimiter.limit(ctx, "emailCheck", { key: clientId });
    if (!perDevice.ok) {
      throw new ConvexError("Too many tries — wait a moment and try again.");
    }
    const global = await rateLimiter.limit(ctx, "emailCheckGlobal");
    if (!global.ok) {
      throw new ConvexError("It's busy right now — try again in a moment.");
    }

    const existing = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", email))
      .first();
    return existing === null;
  },
});

/**
 * The signed-in host's own profile (name + email). Returns null when nobody is
 * signed in. The name lives on the account, so it's the single source of truth
 * for the host across every device.
 */
export const myProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    // Default a blank/legacy name to "Host" so an authenticated host is never
    // left empty (which would hide them from presence and block add/vote).
    return { name: hostNameOr(user.name), email: user.email ?? "" };
  },
});

/**
 * Rename the signed-in host. Stored on the account, so the change syncs to
 * every browser they sign in on — and (since the host's in-room identity reads
 * from here) to their presence pill and "added by" labels too.
 */
export const setMyName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in first.");
    const who = clean(name, MAX_NAME);
    if (!who) throw new ConvexError("Enter a name.");
    await ctx.db.patch(userId, { name: who });
    return { name: who };
  },
});
