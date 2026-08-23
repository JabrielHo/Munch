import { ConvexError } from "convex/values";
import { hapticResult, showAlert } from "./telegram";

/** The brand accent palette — wheel wedges, confetti and avatars all draw from
 *  this one source of truth. */
export const ACCENT_COLORS = ["#FF5A3C", "#FFC542", "#2FB877", "#7C5CFF", "#4CC4E8"];

/** Soft tints for the emoji tile behind each option. */
const TILE_TINTS = ["#FFE3DC", "#FFF0CC", "#DDF6EA", "#E7E0FF", "#DCF3FA", "#FFE7C2"];

function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash;
}

// Hashed rather than random so an option or a person keeps the same colour
// across re-renders and across screens.
export function tileColor(seed: string): string {
  return TILE_TINTS[hashString(seed) % TILE_TINTS.length];
}

export function avatarColor(seed: string): string {
  return ACCENT_COLORS[hashString(seed) % ACCENT_COLORS.length];
}

/** The one or two letters an avatar falls back to when there is no photo — and
 *  there never is, since Munch asks Telegram for nothing but a name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

export { googleMapsSearchUrl } from "../../convex/lib";

/** The message meant for the user, dug out of whatever was thrown. */
export function readableError(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data) {
      return String((data as { message: unknown }).message);
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("Server Error") ? "Something went wrong — try again." : message;
}

/** The standard `.catch()` for anything the user just tapped. */
export function alertError(err: unknown) {
  hapticResult("error");
  showAlert(readableError(err));
}
