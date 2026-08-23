import { MAX_NAME_LENGTH, MAX_OPTION_LENGTH, MAX_PLACE_LENGTH, tidyText } from "../../convex/lib";
import { isTelegram, telegramUser, telegramDisplayName } from "./telegram";

/**
 * Client-side identity is display-only. The server never trusts anything from
 * here — reads and writes present an access token (see session.ts) and the
 * server derives the real identity from the grant it minted.
 */

const NAME_KEY = "munch.name";
const LAST_CODE_KEY = "munch.lastCode";

/** The anchor that lets a Mini App opened with no code — from the bot profile,
 *  say — land on that group's plans instead of a dead end. */
export function rememberCode(code: string) {
  localStorage.setItem(LAST_CODE_KEY, code);
}

export function lastCode(): string | null {
  return localStorage.getItem(LAST_CODE_KEY);
}

// Re-exported straight from the server module so an input's maxLength can never
// drift from what the mutations actually enforce.
export { MAX_OPTION_LENGTH, MAX_PLACE_LENGTH };

/** For local greetings only. Inside Telegram this is always set, since Telegram
 *  requires a first name; the localStorage fallback covers browser dev. */
export const VIEWER_NAME =
  (isTelegram ? tidyText(telegramDisplayName(telegramUser), MAX_NAME_LENGTH) : null) ||
  localStorage.getItem(NAME_KEY) ||
  "";
