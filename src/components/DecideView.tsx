import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks";
import type { PublicRoom, PublicOption } from "@/lib/types";
import { SpinWheel, type WheelItem } from "./SpinWheel";
import { ResultView } from "./ResultView";

interface Props {
  room: PublicRoom;
  options: PublicOption[];
  viewerIsHost: boolean;
  backTo: string;
}

const SPIN_MS = 4200;
const SPIN_MS_REDUCED = 500;
const LOCK_MS = 1100;
const LOCK_MS_REDUCED = 350;
const MAX_WHEEL_WEDGES = 8;
/** Below this there isn't enough time left to be worth animating. */
const MIN_ANIMATION_MS = 150;

/**
 * The synced reveal. The winner and the wheel's angle were already decided
 * server-side, so every phone animates to the same result. <Room> keys this
 * component by spinStartedAt, so a fresh spin remounts it and replays cleanly.
 */
export function DecideView({ room, options, viewerIsHost, backTo }: Props) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const isSpin = room.mode === "spin";
  const totalMs = isSpin
    ? prefersReducedMotion
      ? SPIN_MS_REDUCED
      : SPIN_MS
    : prefersReducedMotion
      ? LOCK_MS_REDUCED
      : LOCK_MS;

  // How much of the animation is LEFT when this view first mounts. Someone who
  // joins late gets a shorter window, and the wheel gets that same window so
  // its transition still finishes exactly on the winner, never mid-spin.
  const [remainingMs] = useState(() =>
    Math.max(0, totalMs - (Date.now() - (room.spinStartedAt ?? 0))),
  );
  const [revealed, setRevealed] = useState(() => remainingMs <= 0);

  useEffect(() => {
    if (revealed) return;
    const timeoutId = setTimeout(() => setRevealed(true), remainingMs);
    return () => clearTimeout(timeoutId);
  }, [revealed, remainingMs]);

  if (revealed) {
    return (
      <ResultView
        room={room}
        options={options}
        reducedMotion={prefersReducedMotion}
        backTo={backTo}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6">
      <p className="font-display text-xl font-semibold">
        {isSpin ? "Round and round… 🌀" : "Locking it in…"}
      </p>
      {isSpin ? (
        <>
          <SpinWheel
            items={wheelItems(room, options)}
            angle={room.spinAngle ?? 0}
            animate={!prefersReducedMotion && remainingMs > MIN_ANIMATION_MS}
            durationMs={remainingMs}
          />
          <p className="text-sm text-muted-foreground">
            {viewerIsHost ? "Here we go!" : "Host is spinning — hang tight"}
          </p>
        </>
      ) : (
        <div className="flex gap-2">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-2.5 animate-bounce rounded-full bg-primary"
              style={{ animationDelay: `${dot * 120}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** In the order the server froze them, falling back to the top few options if
 *  that list didn't survive — better a wheel than a blank screen. */
function wheelItems(room: PublicRoom, options: PublicOption[]): WheelItem[] {
  const optionById = new Map(options.map((option) => [option._id, option]));
  const frozen = (room.wheelOptionIds ?? [])
    .map((id) => optionById.get(id))
    .filter((option): option is PublicOption => Boolean(option));
  const wedges = frozen.length > 0 ? frozen : options.slice(0, MAX_WHEEL_WEDGES);
  return wedges.map((option) => ({ id: option._id, emoji: option.emoji }));
}
