import { useEffect, useState } from "react";
import { ACCENT_COLORS as WEDGE_COLORS } from "@/lib/ui";

export interface WheelItem {
  id: string;
  emoji: string;
}

interface Props {
  items: WheelItem[];
  /** Final rotation in degrees, precomputed on the server so all phones match. */
  angle: number;
  /** When false — reduced motion, or a late joiner — snap straight to the angle. */
  animate: boolean;
  durationMs: number;
}

/** How far out from the centre each emoji sits, as a fraction of the radius. */
const EMOJI_RADIUS_RATIO = 0.62;
const WHEEL_SIZE = "min(72vw, 300px)";

export function SpinWheel({ items, angle, animate, durationMs }: Props) {
  const wedgeCount = Math.max(items.length, 1);
  const wedgeAngle = 360 / wedgeCount;

  // Start at 0, then jump to `angle` on the next frame so the CSS transition
  // has two values to animate between and actually plays.
  const [rotation, setRotation] = useState(animate ? 0 : angle);
  useEffect(() => {
    if (!animate) {
      setRotation(angle);
      return;
    }
    const frame = requestAnimationFrame(() => setRotation(angle));
    return () => cancelAnimationFrame(frame);
  }, [animate, angle]);

  const wedgeGradient = `conic-gradient(${items
    .map((_, index) => {
      const color = WEDGE_COLORS[index % WEDGE_COLORS.length];
      return `${color} ${index * wedgeAngle}deg ${(index + 1) * wedgeAngle}deg`;
    })
    .join(", ")})`;

  return (
    <div
      className="relative mx-auto"
      style={{ width: WHEEL_SIZE, height: WHEEL_SIZE, ["--r" as string]: `calc(${WHEEL_SIZE} / 2)` }}>
      {/* The fixed pointer the winning wedge is rotated underneath. */}
      <div className="absolute -top-1 left-1/2 z-10 size-0 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-primary" />
      <div
        className="absolute inset-0 rounded-full border-8 border-card shadow-lg"
        style={{
          background: wedgeCount === 1 ? WEDGE_COLORS[0] : wedgeGradient,
          transform: `rotate(${rotation}deg)`,
          transition: animate ? `transform ${durationMs}ms var(--ease-spin)` : "none",
        }}>
        {items.map((item, index) => {
          // Rotate out to the wedge's centre, slide along the radius, then
          // un-rotate so the emoji itself stays upright.
          const wedgeCenter = index * wedgeAngle + wedgeAngle / 2;
          const transform =
            `translate(-50%, -50%) rotate(${wedgeCenter}deg) ` +
            `translateY(calc(var(--r) * -${EMOJI_RADIUS_RATIO})) rotate(${-wedgeCenter}deg)`;
          return (
            <span
              key={item.id}
              className="absolute left-1/2 top-1/2 text-2xl"
              style={{ transform }}>
              {item.emoji}
            </span>
          );
        })}
      </div>
      <div className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-card text-xl shadow-md">
        🍜
      </div>
    </div>
  );
}
