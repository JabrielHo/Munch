import { ConvexError } from "convex/values";

// The brand accent palette — wheel wedges, confetti, presence dots all draw
// from this one source of truth.
export const ACCENT_COLORS = ["#FF5A3C", "#FFC542", "#2FB877", "#7C5CFF", "#4CC4E8"];
// Soft tints for the emoji tiles behind each option.
const TILE_TINTS = ["#FFE3DC", "#FFF0CC", "#DDF6EA", "#E7E0FF", "#DCF3FA", "#FFE7C2"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function tileColor(seed: string): string {
  return TILE_TINTS[hash(seed) % TILE_TINTS.length];
}

export function avatarColor(seed: string): string {
  return ACCENT_COLORS[hash(seed) % ACCENT_COLORS.length];
}

// One maps-link builder for every surface (bot messages import it too).
export { mapsUrl } from "../../convex/lib";

/** Pull the friendly message out of a thrown error (ConvexError carries it). */
export function humanError(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data) {
      return String((data as { message: unknown }).message);
    }
  }
  const m = err instanceof Error ? err.message : String(err);
  return m.includes("Server Error") ? "Something went wrong — try again." : m;
}

/** The standard failure handler for user-initiated calls: `.catch(alertError)`. */
export function alertError(err: unknown) {
  alert(humanError(err));
}
