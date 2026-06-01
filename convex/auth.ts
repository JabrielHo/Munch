import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { rateLimiter } from "./rateLimits";
import { hostNameOr } from "./lib";

type Authorize = (params: Record<string, unknown>, ctx: unknown) => Promise<unknown>;
// Capture the host's display name onto their ACCOUNT at sign-up: Convex Auth
// writes this profile onto the `users` row (only on the signUp flow — signIn
// doesn't overwrite it). The name then follows the host to any browser they
// sign in on, instead of living in per-device localStorage.
const basePassword = Password({
  profile(params) {
    return {
      email: params.email as string,
      name: hostNameOr(params.name),
    };
  },
});
const baseOptions = (basePassword as unknown as { options?: { authorize?: Authorize } }).options;
const realAuthorize = baseOptions?.authorize;
// Fail LOUD, not open: if a @convex-dev/auth bump moves the internal authorize,
// surface it at module load instead of silently shipping un-rate-limited auth.
if (typeof realAuthorize !== "function") {
  throw new Error(
    "Could not find the Password provider's authorize to wrap for rate limiting. " +
      "The @convex-dev/auth internals likely changed — update convex/auth.ts.",
  );
}

const rateLimitedAuthorize: Authorize = async (params, ctx) => {
  const limitCtx = ctx as Parameters<typeof rateLimiter.limit>[0];
  if (!(await rateLimiter.limit(limitCtx, "authGlobal")).ok) {
    throw new ConvexError("Too many attempts — please try again shortly.");
  }
  const email = String(params.email ?? "")
    .trim()
    .toLowerCase();
  if (email && !(await rateLimiter.limit(limitCtx, "authPerEmail", { key: email })).ok) {
    throw new ConvexError("Too many attempts for this email — wait a moment.");
  }
  return realAuthorize(params, ctx);
};

const RateLimitedPassword = {
  ...basePassword,
  options: { ...baseOptions, authorize: rateLimitedAuthorize },
} as typeof basePassword;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [RateLimitedPassword],
});
