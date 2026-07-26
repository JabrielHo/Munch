import { Link } from "react-router-dom";
import type { PublicRoom, PublicOption } from "../lib/types";
import { tileColor } from "../lib/ui";
import { voteWord } from "../../convex/lib";

interface Props {
  room: PublicRoom;
  options: PublicOption[];
}

/** A closed room, read-only for everyone, with no way to reopen it. */
export function ClosedView({ room, options }: Props) {
  const winner = options.find((option) => option._id === room.winnerOptionId);

  return (
    <div className="screen room">
      <header className="room-header">
        <div className="room-titlerow">
          <Link to={`/h/${room.code}`} className="room-back" aria-label="All rounds">
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
            <div className="chosen-kicker">
              {room.mode === "lock" ? "🏆 The squad chose" : "🎡 The wheel chose"}
            </div>
            <div className="chosen-name">{winner.text}</div>
          </div>
        </div>
      )}

      {options.length === 0 ? (
        <div className="empty">No options were added.</div>
      ) : (
        <div className="options">
          {options.map((option) => {
            const won = option._id === room.winnerOptionId;
            return (
              <div
                key={option._id}
                className={`option-row option-row--readonly${won ? " option-row--won" : ""}`}>
                <div className="option-emoji" style={{ background: tileColor(option._id) }}>
                  {option.emoji}
                </div>
                <div className="option-main">
                  <div className="option-name">{option.text}</div>
                  <div className="option-meta">
                    <span>by {option.addedByName}</span>
                  </div>
                </div>
                <div className="vote-static">
                  {option.voteCount}
                  <span>{voteWord(option.voteCount)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="dock">
        <div className="dock-inner">
          <Link to={`/h/${room.code}`} className="btn btn--grape btn--block btn--lg">
            ← All rounds
          </Link>
        </div>
      </div>
    </div>
  );
}
