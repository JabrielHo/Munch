import { MAX_NAME, MAX_TEXT, clean } from "../../convex/lib";
import { isTelegram, tgUser, tgDisplayName } from "./telegram";

/**
 * Client-side identity is display-only. The server never trusts anything from
 * here: reads and writes present an access token (see lib/session.ts), and the
 * server derives the real identity (clientId "tg:<user id>", name) from the
 * grant it minted. So this module just holds the viewer's name for greetings
 * and the last-room anchor for bare Mini App opens.
 */
const NAME_KEY = "munch.name";
const LAST_CODE_KEY = "munch.lastCode";

/** Remember the room most recently opened on this device — it's the anchor
 *  that lets a bare Mini App open (bot profile / direct link, no chat message)
 *  land on that group's All-rounds page instead of a dead end. */
export function rememberRoomCode(code: string) {
  localStorage.setItem(LAST_CODE_KEY, code);
}

export function lastRoomCode(): string | null {
  return localStorage.getItem(LAST_CODE_KEY);
}

// Input cap re-exported straight from the server module, so the add-bar's
// `maxLength` can never drift from what the mutations actually enforce.
export { MAX_TEXT };

/**
 * The viewer's display name, for local greetings only. Inside Telegram it comes
 * from the Mini App session (always present — Telegram requires a first name);
 * a `munch.name` in localStorage covers browser dev sessions.
 */
export const VIEWER_NAME =
  (isTelegram ? clean(tgDisplayName(tgUser), MAX_NAME) : null) ||
  localStorage.getItem(NAME_KEY) ||
  "";
