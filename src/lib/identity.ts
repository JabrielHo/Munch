import { useCallback, useState } from "react";

/**
 * Participant identity, kept entirely on the device — no account needed.
 *
 * `CLIENT_ID` is a stable random id per browser (used to dedupe votes and let
 * people remove their own options). It's computed once at module load, so no
 * component ever needs an effect to read it.
 */
const CLIENT_KEY = "munch.clientId";
const NAME_KEY = "munch.name";

// Input caps — kept here as the single client-side source so input `maxLength`
// props can't drift from each other (they mirror the server limits in convex/lib.ts).
export const MAX_NAME = 20;
export const MAX_TITLE = 40;
export const MAX_TEXT = 60;

function readClientId(): string {
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
  const [name, setNameState] = useState(() => localStorage.getItem(NAME_KEY) ?? "");

  const setName = useCallback((next: string) => {
    const value = cleanName(next);
    setNameState(value);
    localStorage.setItem(NAME_KEY, value);
  }, []);

  return [name, setName] as const;
}
