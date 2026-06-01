import { useEffect, useState } from "react";
import { ACCENT_COLORS as WEDGE_COLORS } from "../lib/ui";

export interface WheelItem {
  id: string;
  emoji: string;
}

interface Props {
  items: WheelItem[];
  /** Final rotation in degrees, precomputed on the server so all phones match. */
  angle: number;
  /** When false (reduced motion / late joiner), snap straight to the angle. */
  animate: boolean;
  durationMs: number;
}

export function SpinWheel({ items, angle, animate, durationMs }: Props) {
  const n = Math.max(items.length, 1);
  const seg = 360 / n;

  // Start at 0, then on the next frame jump to `angle` so the CSS transition
  // actually plays. Driving an animation is a valid effect (with cleanup).
  const [rotation, setRotation] = useState(animate ? 0 : angle);
  useEffect(() => {
    if (!animate) {
      setRotation(angle);
      return;
    }
    const raf = requestAnimationFrame(() => setRotation(angle));
    return () => cancelAnimationFrame(raf);
  }, [animate, angle]);

  const gradient = `conic-gradient(${items
    .map((_, i) => `${WEDGE_COLORS[i % WEDGE_COLORS.length]} ${i * seg}deg ${(i + 1) * seg}deg`)
    .join(", ")})`;

  return (
    <div className="wheel-wrap">
      <div className="wheel-pointer" />
      <div
        className="wheel"
        style={{
          background: n === 1 ? WEDGE_COLORS[0] : gradient,
          transform: `rotate(${rotation}deg)`,
          transition: animate ? `transform ${durationMs}ms var(--ease-spin)` : "none",
        }}>
        {items.map((item, i) => {
          const mid = i * seg + seg / 2;
          return (
            <span
              key={item.id}
              className="wheel-emoji"
              style={{
                transform: `translate(-50%, -50%) rotate(${mid}deg) translateY(calc(var(--r) * -0.62)) rotate(${-mid}deg)`,
              }}>
              {item.emoji}
            </span>
          );
        })}
      </div>
      <div className="wheel-hub">🍜</div>
    </div>
  );
}
