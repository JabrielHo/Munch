import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isTelegram, tgInitData } from "./telegram";
import { humanError } from "./ui";

/**
 * The room access gate. Before rendering a room or its history, the app trades
 * its signed Telegram identity for a short-lived access token by calling
 * `enterRoom` — which the server only grants after confirming the user is a
 * current member of the room's group. Every read/write then presents the
 * token, so a non-member (or a forwarded link) gets nowhere.
 *
 * The token is refreshed on an interval so membership is re-checked while the
 * page stays open — leaving or being kicked revokes access within minutes.
 */
const TOKEN_KEY = "munch.token";
const REFRESH_MS = 5 * 60 * 1000;

export type SessionState =
  | { status: "loading" }
  | { status: "ok"; token: string }
  | { status: "denied"; message: string };

export function useRoomSession(code: string): SessionState {
  const enter = useAction(api.telegram.enterRoom);
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    if (!code) return;
    let alive = true;

    async function sync() {
      // Outside Telegram (browser dev) there's no initData to verify — fall
      // back to a manually-seeded token (npx convex run telegram:devGrantSession).
      if (!isTelegram) {
        const t = localStorage.getItem(TOKEN_KEY);
        if (alive) {
          setState(
            t
              ? { status: "ok", token: t }
              : { status: "denied", message: "Open Munch from your Telegram group chat." },
          );
        }
        return;
      }
      try {
        const { token } = await enter({ initData: tgInitData, code });
        localStorage.setItem(TOKEN_KEY, token);
        if (alive) setState({ status: "ok", token });
      } catch (err) {
        const message = humanError(err);
        const membershipDenied = message.includes("not in this group");
        // A transient failure on an already-open session keeps the room up;
        // only a real membership denial (or the initial load) shows the wall.
        if (alive) {
          setState((prev) =>
            membershipDenied || prev.status !== "ok" ? { status: "denied", message } : prev,
          );
        }
      }
    }

    void sync();
    const id = setInterval(() => void sync(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [code, enter]);

  return state;
}
