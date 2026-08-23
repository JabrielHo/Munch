import { useState } from "react";
import { X } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { tileColor } from "@/lib/ui";
import { haptic } from "@/lib/telegram";
import type { PublicOption } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface Props {
  option: PublicOption;
  voted: boolean;
  removable: boolean;
  onVote: (id: Id<"options">) => void;
  onRemove: (id: Id<"options">) => void;
}

export function OptionRow({ option, voted, removable, onVote, onRemove }: Props) {
  // Bumping this remounts the count, which replays its CSS animation.
  const [tapCount, setTapCount] = useState(0);

  function handleVote() {
    haptic();
    setTapCount((count) => count + 1);
    onVote(option._id);
  }

  return (
    <Card className={cn("flex items-center gap-3 p-3", option.mine && "border-primary/40")}>
      <span
        className="grid size-11 shrink-0 place-items-center rounded-lg text-xl"
        style={{ background: tileColor(option._id) }}>
        {option.emoji}
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{option.text}</div>
        <div className="truncate text-xs text-muted-foreground">
          by {option.addedByName}
          {option.suggestedSpot && ` · try ${option.suggestedSpot}`}
        </div>
      </div>

      {removable && (
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          onClick={() => onRemove(option._id)}
          aria-label={`Remove ${option.text}`}>
          <X className="size-4" />
        </button>
      )}

      <button
        type="button"
        className={cn(
          "flex h-11 min-w-14 shrink-0 flex-col items-center justify-center rounded-lg px-2 text-xs font-bold transition-colors",
          voted
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-secondary",
        )}
        onClick={handleVote}
        aria-pressed={voted}
        aria-label={`Vote for ${option.text}, ${option.voteCount} votes`}>
        <span key={tapCount} className="animate-bump text-base leading-none">
          {option.voteCount}
        </span>
        <span>{voted ? "voted" : "+1"}</span>
      </button>
    </Card>
  );
}
