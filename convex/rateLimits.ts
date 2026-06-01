import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

/**
 * One rate limiter for the whole app, so every bucket (and its tuning) lives in
 * a single place. Two concerns share it:
 *  - the email-existence check (account.ts), keyed per device + a global ceiling
 *  - the auth sign-in/sign-up attempts (auth.ts), keyed per email + a global
 *    ceiling, so the auth endpoint can't be used as an enumeration oracle.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  emailCheck: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 10 },
  emailCheckGlobal: { kind: "token bucket", rate: 200, period: MINUTE, capacity: 200 },
  authGlobal: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 60 },
  authPerEmail: { kind: "token bucket", rate: 6, period: MINUTE, capacity: 6 },
});
