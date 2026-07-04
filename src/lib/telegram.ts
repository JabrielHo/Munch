/**
 * Telegram Mini App bridge.
 *
 * When the app is opened inside Telegram (via the bot's "Open Munch" button,
 * a t.me/<bot>/<app>?startapp=<code> direct link), the synchronous
 * telegram-web-app.js script in index.html populates window.Telegram.WebApp
 * before this module evaluates — so these can be plain constants, resolved
 * once at load, exactly like CLIENT_ID.
 *
 * Trust model: the fields here (user, start_param) drive identity and
 * navigation on the CLIENT, same trust level as the localStorage clientId the
 * web flow uses. Host actions (spin/lock/end) are the ones with teeth, and
 * those send the raw signed `initData` string to the server, which verifies
 * Telegram's HMAC before acting.
 */

import { tgFullName } from "../../convex/lib";

export type TgWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TgWebApp = {
  initData: string;
  initDataUnsafe: { user?: TgWebAppUser; start_param?: string };
  ready: () => void;
  expand: () => void;
};

const webApp: TgWebApp | null =
  (window as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null;

/** True only for a real Telegram session (the script also loads a stub with
 *  empty initData in ordinary browsers). */
export const isTelegram = Boolean(webApp && webApp.initData);

export const tgUser: TgWebAppUser | null = isTelegram
  ? (webApp!.initDataUnsafe.user ?? null)
  : null;

/** The bot puts the room code in ?startapp=… — Telegram hands it back here. */
export const tgStartParam: string | null = isTelegram
  ? (webApp!.initDataUnsafe.start_param ?? null)
  : null;

/** The signed payload host actions send for server-side verification. */
export const tgInitData: string = isTelegram ? webApp!.initData : "";

export function tgDisplayName(user: TgWebAppUser | null): string {
  return user ? tgFullName(user) : "";
}

/** Tell Telegram we've rendered (dismisses its loader) and use the full pane. */
export function tgReady() {
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
}
