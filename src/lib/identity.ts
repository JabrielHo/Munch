import { MAX_NAME, MAX_TEXT, clean } from "../../convex/lib";
import { isTelegram, tgUser, tgDisplayName } from "./telegram";

/**
 * Participant identity, kept entirely on the device — no account needed.
 *
 * `CLIENT_ID` is a stable random id per browser (used to dedupe votes and let
 * people remove their own options). It's computed once at module load, so no
 * component ever needs an effect to read it.
 *
 * Inside Telegram, identity comes from the Mini App session instead: the
 * clientId is "tg:<telegram user id>" — the SAME id the bot writes for votes
 * cast on the chat's buttons — so a person is one voter across both surfaces,
 * and their Telegram name is used directly, with no prompt to pick one.
 */
const CLIENT_KEY = "munch.clientId";
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

function readClientId(): string {
  if (isTelegram && tgUser) return `tg:${tgUser.id}`;
  let id = localStorage.getItem(CLIENT_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

export const CLIENT_ID = readClientId();

/**
 * The viewer's display name, fixed for the app's lifetime like CLIENT_ID:
 * inside Telegram it comes from the Mini App session (always present —
 * Telegram requires a first name). A `munch.name` in localStorage covers
 * browser-based dev sessions; the app never prompts for one.
 */
export const VIEWER_NAME =
  (isTelegram ? clean(tgDisplayName(tgUser), MAX_NAME) : null) ||
  localStorage.getItem(NAME_KEY) ||
  "";
