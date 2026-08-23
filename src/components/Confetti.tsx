import { useState } from "react";
import { ACCENT_COLORS } from "@/lib/ui";

const PIECE_COUNT = 44;

/** Randomized once in a lazy initializer, so the pieces stay put across
 *  re-renders instead of teleporting mid-fall. */
export function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: PIECE_COUNT }, (_, index) => ({
      leftPercent: Math.random() * 100,
      delaySeconds: Math.random() * 0.5,
      durationSeconds: 2.4 + Math.random() * 1.8,
      rotateDegrees: Math.random() * 360,
      color: ACCENT_COLORS[index % ACCENT_COLORS.length],
      isRound: Math.random() > 0.5,
    })),
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="animate-confetti absolute top-0 block size-2.5"
          style={{
            left: `${piece.leftPercent}%`,
            background: piece.color,
            borderRadius: piece.isRound ? "50%" : "3px",
            transform: `rotate(${piece.rotateDegrees}deg)`,
            animationDuration: `${piece.durationSeconds}s`,
            animationDelay: `${piece.delaySeconds}s`,
          }}
        />
      ))}
    </div>
  );
}
