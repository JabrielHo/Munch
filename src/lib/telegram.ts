import { telegramFullName } from "../../convex/lib";

/**
 * index.html loads telegram-web-app.js synchronously, so window.Telegram is
 * already populated by the time this module evaluates — which is why these can
 * be plain constants resolved once at load rather than hooks.
 *
 * Only `signedInitData` has teeth. The unpacked fields below are no more
 * trustworthy than a localStorage value, so they may drive navigation and
 * greetings but nothing else; anything that matters sends the raw signed string
 * to the server, which verifies Telegram's HMAC before acting.
 */

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  ready: () => void;
  expand: () => void;
};

const webApp: TelegramWebApp | null =
  (window as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null;

/** True only inside a real Telegram session — the script also installs a stub
 *  with empty initData in ordinary browsers. */
export const isTelegram = Boolean(webApp && webApp.initData);

export const telegramUser: TelegramUser | null = isTelegram
  ? (webApp!.initDataUnsafe.user ?? null)
  : null;

/** The bot puts the room code in ?startapp=… and Telegram hands it back here. */
export const startParam: string | null = isTelegram
  ? (webApp!.initDataUnsafe.start_param ?? null)
  : null;

export const signedInitData: string = isTelegram ? webApp!.initData : "";

export function telegramDisplayName(user: TelegramUser | null): string {
  return user ? telegramFullName(user) : "";
}

/** Dismisses Telegram's own loader, and takes the full pane. */
export function markAppReady() {
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
}
