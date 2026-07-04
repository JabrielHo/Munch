import { useCallback, useState } from "react";
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

// Input caps — kept here as the single client-side source so input `maxLength`
// props can't drift from each other (they mirror the server limits in convex/lib.ts).
export const MAX_NAME = 20;
export const MAX_TITLE = 40;
export const MAX_TEXT = 60;

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

export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

/**
 * The display name, persisted to localStorage. We initialize state lazily from
 * storage and write through inside the setter (an event-driven action) — so
 * there's no `useEffect` syncing state to storage. That's the "you might not
 * need an effect" pattern: storage is written when the user acts, not reactively.
 */
export function useDisplayName() {
  const [name, setNameState] = useState(
    () => (isTelegram ? cleanName(tgDisplayName(tgUser)) : null) || localStorage.getItem(NAME_KEY) || "",
  );

  const setName = useCallback((next: string) => {
    const value = cleanName(next);
    setNameState(value);
    localStorage.setItem(NAME_KEY, value);
  }, []);

  return [name, setName] as const;
}

/**
 * Who the current viewer is, for display + presence. Inside Telegram the name
 * is pre-seeded from the Mini App session; web guests pick one at the gate.
 */
export function useViewerName() {
  const [name, setName] = useDisplayName();
  return { name, setName };
}
