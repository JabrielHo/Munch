import { useEffect, useReducer } from "react";
import { Link, useParams } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ANYONE_CAN_CLOSE_AFTER_MS } from "../../convex/lib";
import { useRoomSession } from "../lib/session";
import { isTelegram, signedInitData } from "../lib/telegram";
import { alertError, tileColor } from "../lib/ui";
import { LoadingScreen } from "../components/LoadingScreen";
import { NoticeScreen } from "../components/NoticeScreen";

const AGE_RECHECK_MS = 60_000;

/** Reached from a room, so the URL carries that room's code — which the access
 *  gate exchanges for a token covering the whole group. */
export default function History() {
  const { code = "" } = useParams();
  const session = useRoomSession(code);
  const token = session.status === "ok" ? session.token : null;
  const rounds = useQuery(api.rooms.groupHistory, token ? { code, token } : "skip");
  // Closing a round is just the "end" host action, aimed at it by its own code.
  const runHostAction = useAction(api.telegram.miniAppHostAction);

  // Neither the reactive query nor React re-runs as time passes, so re-render
  // once a minute to let a round crossing the age threshold grow its Close
  // button while the page is open.
  const [, recheckAges] = useReducer((tick: number) => tick + 1, 0);
  useEffect(() => {
    const intervalId = setInterval(recheckAges, AGE_RECHECK_MS);
    return () => clearInterval(intervalId);
  }, []);

  function closeRound(roundCode: string, title: string) {
    if (!token) return;
    if (!confirm(`Close "${title}" for everyone?`)) return;
    // The token is minted per chat rather than per round, so it authorizes
    // closing any round in this group — which is exactly what the server checks.
    runHostAction({ initData: signedInitData, code: roundCode, token, act: "end" }).catch(
      alertError,
    );
  }

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "denied") return <NoticeScreen message={session.message} />;

  if (rounds === undefined) return <LoadingScreen />;
  if (rounds === null) return <NoticeScreen message="That round isn't here." />;

  return (
    <div className="screen room">
      <header className="room-header">
        <div className="room-titlerow">
          <h1 className="room-title">
            <span>All rounds 🗂</span>
          </h1>
        </div>
      </header>

      {rounds.length === 0 ? (
        <div className="empty">No rounds here yet.</div>
      ) : (
        <div className="options">
          {rounds.map((round) => {
            const startedOn = new Date(round.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
            // Derived here rather than in the query so it stays truthful as
            // rounds age; the server re-checks it on the mutation anyway.
            const canClose =
              !round.closedAt &&
              (round.mine || Date.now() - round.createdAt > ANYONE_CAN_CLOSE_AFTER_MS);
            const outcome = round.winner
              ? ` · 🏆 ${round.winner.text}`
              : round.closedAt
                ? " · no pick"
                : "";

            return (
              <div key={round.code} className="option-row option-row--readonly">
                <Link to={`/r/${round.code}`} className="history-link">
                  <div className="option-emoji" style={{ background: tileColor(round.code) }}>
                    {round.winner?.emoji ?? (round.closedAt ? "🌙" : "🍽")}
                  </div>
                  <div className="option-main">
                    <div className="option-name">{round.title}</div>
                    <div className="option-meta">
                      <span>
                        {startedOn} · by {round.hostName}
                        {outcome}
                      </span>
                    </div>
                  </div>
                </Link>
                {round.closedAt ? (
                  <span className="closed-badge">closed 🌙</span>
                ) : (
                  <span className="live-dot">LIVE</span>
                )}
                {isTelegram && canClose && (
                  <button
                    type="button"
                    className="linklike history-close"
                    onClick={() => closeRound(round.code, round.title)}
                    aria-label={`Close ${round.title}`}>
                    Close
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
