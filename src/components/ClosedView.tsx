import { Link } from "react-router-dom";
import type { PublicRoom, PublicOption } from "@/lib/types";
import { tileColor } from "@/lib/ui";
import { voteWord } from "../../convex/lib";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyNote, Screen } from "@/components/Screen";

interface Props {
  room: PublicRoom;
  options: PublicOption[];
  backTo: string;
}

/** A closed round, read-only for everyone, with no way to reopen it. */
export function ClosedView({ room, options, backTo }: Props) {
  const winner = options.find((option) => option._id === room.winnerOptionId);

  return (
    <Screen title={room.title} backTo={backTo} badge={<Badge variant="muted">closed</Badge>}>
      {winner && (
        <Card className="flex items-center gap-3 p-4">
          <span
            className="grid size-14 shrink-0 place-items-center rounded-xl text-2xl"
            style={{ background: tileColor(winner._id) }}>
            {winner.emoji}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {room.mode === "lock" ? "🏆 The group chose" : "🎡 The wheel chose"}
            </div>
            <div className="truncate text-lg font-semibold">{winner.text}</div>
          </div>
        </Card>
      )}

      {options.length === 0 ? (
        <EmptyNote>No options were added.</EmptyNote>
      ) : (
        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <Card
              key={option._id}
              className={cn(
                "flex items-center gap-3 p-3",
                option._id === room.winnerOptionId && "border-primary",
              )}>
              <span
                className="grid size-10 shrink-0 place-items-center rounded-lg text-lg"
                style={{ background: tileColor(option._id) }}>
                {option.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{option.text}</div>
                <div className="truncate text-xs text-muted-foreground">by {option.addedByName}</div>
              </div>
              <div className="shrink-0 text-sm font-bold text-muted-foreground">
                {option.voteCount} {voteWord(option.voteCount)}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Button asChild variant="outline" size="lg">
        <Link to={backTo}>Back</Link>
      </Button>
    </Screen>
  );
}
