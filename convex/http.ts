import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { deployEnv } from "./telegram";

const http = httpRouter();

/**
 * The "I'm leaving" beacon. navigator.sendBeacon fires this on `pagehide`, when
 * the Mini App is closed or swiped away and React's unmount (so the normal
 * leave mutation) can't reliably run — so the member drops out of presence
 * immediately instead of waiting out the heartbeat window. Sent as text/plain
 * to keep it a CORS-simple request with no preflight.
 */
http.route({
  path: "/leave",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { code, token } = JSON.parse(await request.text());
      if (typeof code === "string" && typeof token === "string") {
        await ctx.runMutation(api.presence.leave, { code, token });
      }
    } catch {
      // Best-effort cleanup: a malformed beacon is not worth reporting.
    }
    return new Response(null, { status: 204 });
  }),
});

/**
 * The Telegram webhook. Telegram echoes the secret we registered with
 * setWebhook in this header, which is what makes an update authentic. Answers
 * 200 for every authenticated update, even when the handler failed, because any
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
