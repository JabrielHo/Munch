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
  colorScheme?: "light" | "dark";
  themeParams?: { bg_color?: string };
  ready: () => void;
  expand: () => void;
  onEvent?: (event: string, handler: () => void) => void;
  setHeaderColor?: (color: string) => void;
  showAlert?: (message: string, callback?: () => void) => void;
  showConfirm?: (message: string, callback: (confirmed: boolean) => void) => void;
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
  };
};

const webApp: TelegramWebApp | null =
  (window as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null;

/** True only inside a real Telegram session — the script also installs a stub
 *  with empty initData in ordinary browsers. */
export const isTelegram = Boolean(webApp && webApp.initData);

export const telegramUser: TelegramUser | null = isTelegram
  ? (webApp!.initDataUnsafe.user ?? null)
  : null;

/** The bot puts a hangout or round code in ?startapp=… and Telegram hands it
 *  back here. */
export const startParam: string | null = isTelegram
  ? (webApp!.initDataUnsafe.start_param ?? null)
  : null;

export const signedInitData: string = isTelegram ? webApp!.initData : "";

export function telegramDisplayName(user: TelegramUser | null): string {
  return user ? telegramFullName(user) : "";
}

/** Munch keeps its own palette but follows Telegram's light/dark choice, which
 *  the user can flip while the app is open — hence the subscription. */
export function syncTheme() {
  const apply = () => {
    const dark = webApp?.colorScheme === "dark";
    document.documentElement.classList.toggle("dark", dark);
  };
  apply();
  webApp?.onEvent?.("themeChanged", apply);
}

/** Dismisses Telegram's own loader, and takes the full pane. */
export function markAppReady() {
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
  syncTheme();
}

/** Telegram's native alert inside the app, the browser's outside it. Both are
 *  blocking and unmissable, which is what an error needs to be. */
export function showAlert(message: string) {
  if (webApp?.showAlert) webApp.showAlert(message);
  else window.alert(message);
}

export function showConfirm(message: string): Promise<boolean> {
  if (webApp?.showConfirm) {
    return new Promise((resolve) => webApp.showConfirm!(message, resolve));
  }
  return Promise.resolve(window.confirm(message));
}

export function haptic(style: "light" | "medium" | "heavy" = "light") {
  webApp?.HapticFeedback?.impactOccurred?.(style);
}

export function hapticResult(type: "success" | "error" | "warning") {
  webApp?.HapticFeedback?.notificationOccurred?.(type);
}
