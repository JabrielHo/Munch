import { useState } from "react";
import { ACCENT_COLORS as COLORS } from "../lib/ui";

/**
 * A one-shot burst of CSS-shape particles (no library, on-brand colors).
 * Particle layout is randomized once via a lazy initializer so it stays fixed
 * across re-renders — no effect needed.
 */
export function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 44 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2.4 + Math.random() * 1.8,
      rotate: Math.random() * 360,
      color: COLORS[i % COLORS.length],
      round: Math.random() > 0.5,
    })),
  );

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            borderRadius: p.round ? "50%" : "3px",
            transform: `rotate(${p.rotate}deg)`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
