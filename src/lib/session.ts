import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isTelegram, signedInitData } from "./telegram";
import { readableError } from "./ui";

/**
 * The room access gate. Before a room renders, the app trades its signed
 * Telegram identity for a short-lived token via `enterRoom`, which the server
 * only grants to a current member of the room's group. Every read and write
 * then presents that token, so someone forwarded the link gets nowhere.
 *
 * Refreshing on an interval is what keeps membership being re-checked while the
 * page stays open, so leaving the group revokes access within minutes.
 */

const TOKEN_KEY = "munch.token";
const TOKEN_REFRESH_MS = 5 * 60 * 1000;

export type SessionState =
  | { status: "loading" }
  | { status: "ok"; token: string }
  | { status: "denied"; message: string };

export function useRoomSession(code: string): SessionState {
  const enterRoom = useAction(api.telegram.enterRoom);
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    if (!code) return;
    let stillMounted = true;

    async function refreshToken() {
      // Outside Telegram (browser dev) there is no initData to verify, so fall
      // back to a token seeded by hand with telegram:devGrantSession.
      if (!isTelegram) {
        const devToken = localStorage.getItem(TOKEN_KEY);
        if (!stillMounted) return;
        setState(
          devToken
            ? { status: "ok", token: devToken }
            : { status: "denied", message: "Open Munch from your Telegram group chat." },
        );
        return;
      }

      try {
        const { token } = await enterRoom({ initData: signedInitData, code });
        localStorage.setItem(TOKEN_KEY, token);
        if (stillMounted) setState({ status: "ok", token });
      } catch (err) {
        const message = readableError(err);
        const membershipDenied = message.includes("not in this group");
        // A transient failure on an already-open session keeps the room up.
        // Only a real membership denial — or a failure on first load — walls it off.
        if (stillMounted) {
          setState((previous) =>
            membershipDenied || previous.status !== "ok"
              ? { status: "denied", message }
              : previous,
          );
        }
      }
    }

    void refreshToken();
    const intervalId = setInterval(() => void refreshToken(), TOKEN_REFRESH_MS);
    return () => {
      stillMounted = false;
      clearInterval(intervalId);
    };
  }, [code, enterRoom]);

  return state;
}
