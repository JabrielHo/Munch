import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { auth } from "./auth";

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

export default http;
