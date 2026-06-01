import { v, ConvexError } from "convex/values";
import { mutation } from "./_generated/server";
import { rateLimiter } from "./rateLimits";

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
