import { MAX_NAME_LENGTH, MAX_OPTION_LENGTH, tidyText } from "../../convex/lib";
import { isTelegram, telegramUser, telegramDisplayName } from "./telegram";

/**
 * Client-side identity is display-only. The server never trusts anything from
 * here — reads and writes present an access token (see session.ts) and the
 * server derives the real identity from the grant it minted.
 */

const NAME_KEY = "munch.name";
const LAST_CODE_KEY = "munch.lastCode";

/** The anchor that lets a Mini App opened without a room code — from the bot
 *  profile, say — land on that group's All rounds page instead of a dead end. */
export function rememberRoomCode(code: string) {
  localStorage.setItem(LAST_CODE_KEY, code);
}

export function lastRoomCode(): string | null {
  return localStorage.getItem(LAST_CODE_KEY);
}

// Re-exported straight from the server module so the add bar's maxLength can
// never drift from what the mutations actually enforce.
export { MAX_OPTION_LENGTH };

/** For local greetings only. Inside Telegram this is always set, since Telegram
 *  requires a first name; the localStorage fallback covers browser dev. */
export const VIEWER_NAME =
  (isTelegram ? tidyText(telegramDisplayName(telegramUser), MAX_NAME_LENGTH) : null) ||
  localStorage.getItem(NAME_KEY) ||
  "";
