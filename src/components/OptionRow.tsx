import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { tileColor } from "../lib/ui";
import type { PublicOption } from "../lib/types";

interface Props {
  option: PublicOption;
  voted: boolean;
  removable: boolean;
  onVote: (id: Id<"options">) => void;
  onRemove: (id: Id<"options">) => void;
}

export function OptionRow({ option, voted, removable, onVote, onRemove }: Props) {
  // Bumping these remounts the spans below, which replays their CSS animation.
  const [tapCount, setTapCount] = useState(0);
  const [floatingChipId, setFloatingChipId] = useState<number | null>(null);

  function handleVote() {
    if (!voted) setFloatingChipId(tapCount + 1); // the chip only flies up on a new vote
    setTapCount((count) => count + 1);
    onVote(option._id);
  }

  return (
    <div className={`option-row${option.mine ? " option-row--mine" : ""}`}>
      <div className="option-emoji" style={{ background: tileColor(option._id) }}>
        {option.emoji}
      </div>
      <div className="option-main">
        <div className="option-name">{option.text}</div>
        <div className="option-meta">
          <span>by {option.addedByName}</span>
          {option.suggestedSpot && (
            <span className="option-tag">
              {option.emoji} try: {option.suggestedSpot}
            </span>
          )}
        </div>
      </div>

      {removable && (
        <button
          type="button"
          className="option-remove"
          onClick={() => onRemove(option._id)}
          aria-label={`Remove ${option.text}`}>
          ✕
        </button>
      )}

      <button
        type="button"
        className={`vote-btn${voted ? " vote-btn--on" : ""}`}
        onClick={handleVote}
        aria-pressed={voted}
        aria-label={`Vote for ${option.text}, ${option.voteCount} votes`}>
        {/* The two keys are prefixed so they can never collide: both counters
            can hold the same number, and a collision would stop one of the
            spans from remounting and replaying its animation. */}
        <span key={`count-${tapCount}`} className="vote-count vote-count--bump">
          {option.voteCount}
        </span>
        <span className="vote-plus">{voted ? "voted" : "+1"}</span>
        {floatingChipId !== null && (
          <span
            key={`float-${floatingChipId}`}
            className="vote-float"
            onAnimationEnd={() => setFloatingChipId(null)}>
            🟡
          </span>
        )}
      </button>
    </div>
  );
}
