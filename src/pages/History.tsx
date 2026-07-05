import { useEffect, useReducer } from "react";
import { Link, useParams } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { OLD_ROUND_CLOSE_MS } from "../../convex/lib";
import { CLIENT_ID } from "../lib/identity";
import { isTelegram, tgInitData } from "../lib/telegram";
import { alertError, tileColor } from "../lib/ui";
import { LoadingScreen } from "../components/LoadingScreen";

/**
 * Every round this group has run, newest first — the live ones, and what won
 * in the finished ones. Reached from a room via "🗂 All rounds", so the URL
 * carries that room's code as the group capability. Tapping a round opens it;
 * lingering open rounds can be closed from here (the starter anytime, anyone
 * once the round is a day old — enforced server-side via signed initData).
 */
export default function History() {
  const { code = "" } = useParams();
  const rounds = useQuery(api.rooms.groupHistory, { code, clientId: CLIENT_ID });
  // Closing is just the "end" host action, aimed at an old round by its code.
  const hostAction = useAction(api.telegram.miniAppHostAction);

  // Closability depends on wall-clock age, and neither the reactive query nor
  // React re-runs as time passes — so re-render once a minute to let rounds
  // crossing the age threshold grow their Close button while the page is open.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  function onClose(roundCode: string, title: string) {
    if (!confirm(`Close "${title}" for everyone?`)) return;
    hostAction({ initData: tgInitData, code: roundCode, act: "end" }).catch(alertError);
  }

  if (rounds === undefined) {
    return <LoadingScreen />;
  }

  if (rounds === null) {
    return (
      <div className="screen home">
        <div className="home-top">
          <div className="wordmark">Munch&nbsp;🍜</div>
          <div className="tagline">That round isn't here.</div>
        </div>
        <Link className="btn btn--block btn--lg" to="/">
          What is Munch?
        </Link>
      </div>
    );
  }

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
          {rounds.map((r) => {
            const date = new Date(r.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
            // Derived at render time (not in the reactive query) so it stays
            // truthful as rounds age — the server re-checks on the mutation.
            const closable =
              !r.closedAt && (r.mine || Date.now() - r.createdAt > OLD_ROUND_CLOSE_MS);
            return (
              <div key={r.code} className="option-row option-row--readonly">
                <Link to={`/r/${r.code}`} className="history-link">
                  <div className="option-emoji" style={{ background: tileColor(r.code) }}>
                    {r.winner?.emoji ?? (r.closedAt ? "🌙" : "🍽")}
                  </div>
                  <div className="option-main">
                    <div className="option-name">{r.title}</div>
                    <div className="option-meta">
                      <span>
                        {date} · by {r.hostName}
                        {r.winner ? ` · 🏆 ${r.winner.text}` : r.closedAt ? " · no pick" : ""}
                      </span>
                    </div>
                  </div>
                </Link>
                {r.closedAt ? (
                  <span className="closed-badge">closed 🌙</span>
                ) : (
                  <span className="live-dot">LIVE</span>
                )}
                {isTelegram && closable && (
                  <button
                    type="button"
                    className="linklike history-close"
                    onClick={() => onClose(r.code, r.title)}
                    aria-label={`Close ${r.title}`}>
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
