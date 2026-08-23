import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isTelegram, signedInitData } from "./telegram";
import { readableError } from "./ui";

/**
 * The access gate. Before anything renders, the app trades its signed Telegram
 * identity for a short-lived token via `enterGroup`, which the server only
 * grants to a current member of that chat. Every read and write then presents
 * the token, so someone forwarded a link gets nowhere.
 *
 * The code in the URL only picks which chat to ask about — it can name a
 * hangout or a round, and the grant it returns covers the whole group either
 * way. Refreshing on an interval is what keeps membership being re-checked
 * while the page stays open, so leaving the group revokes access in minutes.
 */

const TOKEN_KEY = "munch.token";
const TOKEN_REFRESH_MS = 5 * 60 * 1000;

export type SessionState =
  | { status: "loading" }
  | { status: "ok"; token: string }
  | { status: "denied"; message: string };

export function useGroupSession(code: string): SessionState {
  const enterGroup = useAction(api.telegram.enterGroup);
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
        const { token } = await enterGroup({ initData: signedInitData, code });
        localStorage.setItem(TOKEN_KEY, token);
        if (stillMounted) setState({ status: "ok", token });
      } catch (err) {
        const message = readableError(err);
        const membershipDenied = message.includes("not in this group");
        // A transient failure on an already-open session keeps the screen up.
        // Only a real membership denial — or a failure on first load — walls it off.
        if (stillMounted) {
          setState((previous) =>
            membershipDenied || previous.status !== "ok" ? { status: "denied", message } : previous,
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
  }, [code, enterGroup]);

  return state;
}
