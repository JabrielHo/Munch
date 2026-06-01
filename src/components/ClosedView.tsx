import { Link } from "react-router-dom";
import type { Doc } from "../../convex/_generated/dataModel";
import type { PublicRoom } from "../lib/types";
import { tileColor } from "../lib/ui";

/**
 * A closed room — read-only for everyone. The options and the final pick stay
 * visible so the host (and friends) can look back at what was decided, but
 * nothing can change and there's no reopening.
 */
export function ClosedView({ room, options }: { room: PublicRoom; options: Doc<"options">[] }) {
  const winner = options.find((o) => o._id === room.winnerOptionId);

  return (
    <div className="screen room">
      <header className="room-header">
        <div className="room-titlerow">
          <Link to="/" className="room-back" aria-label="Back to menu">
            ←
          </Link>
          <h1 className="room-title">
            <span>{room.title}</span>
          </h1>
          <span className="closed-badge">closed 🌙</span>
        </div>
      </header>

      {winner && (
        <div className="card chosen-card">
          <div className="chosen-emoji" style={{ background: tileColor(winner._id) }}>
            {winner.emoji}
          </div>
          <div className="chosen-main">
            <div className="chosen-kicker">{room.mode === "lock" ? "🏆 The squad chose" : "🎡 The wheel chose"}</div>
            <div className="chosen-name">{winner.text}</div>
          </div>
        </div>
      )}

      {options.length === 0 ? (
        <div className="empty">No options were added.</div>
      ) : (
        <div className="options">
          {options.map((o) => (
            <div
              key={o._id}
              className={`option-row option-row--readonly${o._id === room.winnerOptionId ? " option-row--won" : ""}`}>
              <div className="option-emoji" style={{ background: tileColor(o._id) }}>
                {o.emoji}
              </div>
              <div className="option-main">
                <div className="option-name">{o.text}</div>
                <div className="option-meta">
                  <span>by {o.addedByName}</span>
                </div>
              </div>
              <div className="vote-static">
                {o.voteCount}
                <span>{o.voteCount === 1 ? "vote" : "votes"}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="dock">
        <div className="dock-inner">
          <Link to="/" className="btn btn--grape btn--block btn--lg">
            ← Back to menu
          </Link>
        </div>
      </div>
    </div>
  );
}
