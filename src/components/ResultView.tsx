import { Link } from "react-router-dom";
import { mapsUrl, tileColor } from "../lib/ui";
import { voteWord } from "../../convex/lib";
import type { PublicRoom, PublicOption } from "../lib/types";
import { Confetti } from "./Confetti";

interface Props {
  room: PublicRoom;
  options: PublicOption[];
  reducedMotion: boolean;
}

/**
 * The final reveal. Spinning/locking closes the room, so the decision is final
 * here — no re-rolling or editing, just the pick and where to eat it.
 */
export function ResultView({ room, options, reducedMotion }: Props) {
  const winner = options.find((o) => o._id === room.winnerOptionId);

  if (!winner) {
    return (
      <div className="screen result">
        <div className="card card--hero result-card">
          <div className="result-name">Hmm, that pick vanished.</div>
        </div>
        <div className="result-actions">
          <Link to={`/h/${room.code}`} className="btn btn--grape btn--block">
            ← All rounds
          </Link>
        </div>
      </div>
    );
  }

  const byVote = room.mode === "lock";
  const votes = room.decidedVotes ?? winner.voteCount;
  const subline = byVote ? `🏆 The squad chose · ${votes} ${voteWord(votes)}` : "🎡 The wheel decided";
  const query = (winner.suggestedSpot ? `${winner.suggestedSpot} ` : "") + winner.text;
  const maps = mapsUrl(query);

  return (
    <div className="screen result">
      {!reducedMotion && <Confetti />}

      <div className="card card--hero result-card">
        <div className="result-emoji" style={{ background: tileColor(winner._id) }}>
          {winner.emoji}
        </div>
        <div className="result-kicker">{room.title}</div>
        <h1 className="result-name">{winner.text}</h1>
        <div className="result-sub">{subline}</div>
        {winner.suggestedSpot && (
          <a className="result-try" href={maps} target="_blank" rel="noreferrer">
            Try: {winner.suggestedSpot} 📍
          </a>
        )}
      </div>

      <div className="result-actions">
        <a className="btn btn--block btn--lg" href={maps} target="_blank" rel="noreferrer">
          Let's eat! 🎉
        </a>
        <Link to={`/h/${room.code}`} className="linklike">
          ← All rounds
        </Link>
      </div>
    </div>
  );
}
