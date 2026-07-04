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
  // Local, transient animation triggers — keyed remounts replay the CSS.
  const [bump, setBump] = useState(0);
  const [floatId, setFloatId] = useState<number | null>(null);

  function handleVote() {
    if (!voted) setFloatId(bump + 1); // floating chip only when adding a vote
    setBump((b) => b + 1);
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
        {/* Keys are prefixed so the count span and the float span can never
            collide — they're remounted on each tap to replay their animation,
            and `bump` + `floatId` can hold the same number. */}
        <span key={`n-${bump}`} className="vote-count vote-count--bump">
          {option.voteCount}
        </span>
        <span className="vote-plus">{voted ? "voted" : "+1"}</span>
        {floatId !== null && (
          <span key={`f-${floatId}`} className="vote-float" onAnimationEnd={() => setFloatId(null)}>
            🟡
          </span>
        )}
      </button>
    </div>
  );
}
