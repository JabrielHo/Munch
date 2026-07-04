import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";
import { deployEnv } from "./telegram";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * "I'm leaving" beacon. navigator.sendBeacon fires this on tab/window close —
 * where React's unmount (and the normal leave mutation) can't run — so a guest
 * drops out of presence instantly instead of waiting out the heartbeat window.
 * Sent as text/plain so it's a CORS-simple request (no preflight needed).
 */
http.route({
  path: "/leave",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { code, clientId } = JSON.parse(await request.text());
      if (typeof code === "string" && typeof clientId === "string") {
        await ctx.runMutation(api.presence.leave, { code, clientId });
      }
    } catch {
      // Ignore malformed beacons — this is best-effort cleanup.
    }
    return new Response(null, { status: 204 });
  }),
});

/**
 * Telegram webhook. Authenticity: Telegram echoes back the secret we register
 * with setWebhook in this header — no valid secret, no processing. Always
 * answers 200 for authenticated updates (even on handler errors), because any
 * other status makes Telegram re-deliver the same update in a retry loop.
 */
http.route({
  path: "/telegram",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = deployEnv().TELEGRAM_WEBHOOK_SECRET;
    if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
      return new Response(null, { status: 401 });
    }
    const update = await request.json().catch(() => null);
    if (update) {
      await ctx.runAction(internal.telegram.handleUpdate, { update });
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
