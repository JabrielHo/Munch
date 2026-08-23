import { Link } from "react-router-dom";
import { googleMapsSearchUrl, tileColor } from "@/lib/ui";
import { voteWord } from "../../convex/lib";
import type { PublicRoom, PublicOption } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Confetti } from "./Confetti";

interface Props {
  room: PublicRoom;
  options: PublicOption[];
  reducedMotion: boolean;
  backTo: string;
}

/** Spinning or locking closes the round, so there is no re-rolling from here.
 *  When the round belongs to a hangout, the winner has already been written
 *  onto that plan by the time this renders. */
export function ResultView({ room, options, reducedMotion, backTo }: Props) {
  const winner = options.find((option) => option._id === room.winnerOptionId);

  if (!winner) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-xl font-semibold">Hmm, that pick vanished.</p>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link to={backTo}>Back</Link>
        </Button>
      </div>
    );
  }

  const votes = room.decidedVotes ?? winner.voteCount;
  const subline =
    room.mode === "lock"
      ? `🏆 The group chose · ${votes} ${voteWord(votes)}`
      : "🎡 The wheel decided";
  // Include the suggested spot so the link lands on an actual restaurant rather
  // than a search for "ramen".
  const mapsLink = googleMapsSearchUrl(
    (winner.suggestedSpot ? `${winner.suggestedSpot} ` : "") + winner.text,
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6">
      {!reducedMotion && <Confetti />}

      <Card className="flex w-full flex-col items-center gap-2 p-6 text-center">
        <span
          className="grid size-20 place-items-center rounded-xl text-4xl"
          style={{ background: tileColor(winner._id) }}>
          {winner.emoji}
        </span>
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {room.title}
        </span>
        <h1 className="text-2xl font-semibold">{winner.text}</h1>
        <p className="text-sm text-muted-foreground">{subline}</p>
      </Card>

      <div className="flex w-full flex-col gap-2">
        <Button asChild size="lg">
          <a href={mapsLink} target="_blank" rel="noreferrer">
            Open in Maps 📍
          </a>
        </Button>
        <Button asChild variant="ghost">
          <Link to={backTo}>Back</Link>
        </Button>
      </div>
    </div>
  );
}
