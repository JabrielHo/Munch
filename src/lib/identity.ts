import { useCallback, useState } from "react";
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
 * and their Telegram name replaces the name gate.
 */
const CLIENT_KEY = "munch.clientId";
const NAME_KEY = "munch.name";

// Input caps re-exported straight from the server module, so `maxLength`
// props can never drift from what the mutations actually enforce.
export { MAX_NAME, MAX_TEXT };

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
 * The viewer's display name. Inside Telegram it's pre-seeded from the Mini App
 * session; web guests pick one at the gate, persisted to localStorage. State
 * initializes lazily from storage and writes through inside the setter (an
 * event-driven action) — no `useEffect` syncing state to storage.
 */
export function useViewerName() {
  const [name, setNameState] = useState(
    () =>
      (isTelegram ? clean(tgDisplayName(tgUser), MAX_NAME) : null) ||
      localStorage.getItem(NAME_KEY) ||
      "",
  );

  const setName = useCallback((next: string) => {
    const value = clean(next, MAX_NAME);
    setNameState(value);
    localStorage.setItem(NAME_KEY, value);
  }, []);

  return { name, setName };
}
