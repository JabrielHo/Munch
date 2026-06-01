import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "../lib/hooks";
import type { PublicRoom, PublicOption } from "../lib/types";
import { SpinWheel, type WheelItem } from "./SpinWheel";
import { ResultView } from "./ResultView";

interface Props {
  room: PublicRoom;
  options: PublicOption[];
  viewerIsHost: boolean;
}

/**
 * The synced reveal. The host's spin/lock mutation wrote the winner + (for the
 * wheel) a server-precomputed angle + start time, so every phone animates to
 * the same result. This component is keyed by spinStartedAt in <Room>, so a
 * fresh spin remounts it and replays cleanly — no stale state to reset.
 */
export function DecideView({ room, options, viewerIsHost }: Props) {
  const reduced = usePrefersReducedMotion();
  const isSpin = room.mode === "spin";
  const totalMs = isSpin ? (reduced ? 500 : 4200) : reduced ? 350 : 1100;
  const startedAt = room.spinStartedAt ?? 0;

  // How much of the animation is LEFT when this view first mounts. Captured once
  // (this component is keyed by spinStartedAt in <Room>, so it's fresh per spin).
  // A late joiner gets a shorter window — and we hand that same window to the
  // wheel so its CSS transition finishes exactly on the winner, never mid-spin.
  const [remaining] = useState(() => Math.max(0, totalMs - (Date.now() - startedAt)));
  const [revealed, setRevealed] = useState(() => remaining <= 0);

  // Flip to the result once the remaining window elapses (timer = external).
  useEffect(() => {
    if (revealed) return;
    const id = setTimeout(() => setRevealed(true), remaining);
    return () => clearTimeout(id);
  }, [revealed, remaining]);

  if (revealed) {
    return <ResultView room={room} options={options} reducedMotion={reduced} />;
  }

  if (isSpin) {
    const byId = new Map(options.map((o) => [o._id, o]));
    let items: WheelItem[] = (room.wheelOptionIds ?? [])
      .map((id) => byId.get(id))
      .filter((o): o is PublicOption => Boolean(o))
      .map((o) => ({ id: o._id, emoji: o.emoji }));
    if (items.length === 0) {
      items = options.slice(0, 8).map((o) => ({ id: o._id, emoji: o.emoji }));
    }

    return (
      <div className="screen decide">
        <div className="decide-hype">Round and round… 🌀</div>
        <SpinWheel
          items={items}
          angle={room.spinAngle ?? 0}
          animate={!reduced && remaining > 150}
          durationMs={remaining}
        />
        <div className="decide-guest">{viewerIsHost ? "Here we go!" : "Host is spinning… hang tight"}</div>
      </div>
    );
  }

  // Lock mode: a quick suspense beat before the reveal.
  return (
    <div className="screen decide">
      <div className="decide-hype">Locking it in…</div>
      <div className="suspense">
        <span>·</span>
        <span>·</span>
        <span>·</span>
      </div>
    </div>
  );
}
