/**
 * Every date in Munch is Singapore wall-clock time. Asia/Singapore has had no
 * daylight saving since 1935, so a fixed offset is exact rather than an
 * approximation, and it lets the server and the Mini App agree on "which day is
 * this" without either of them consulting the device clock's timezone.
 *
 * The wire format is the two strings a phone's native pickers already produce:
 * a "YYYY-MM-DD" date and a "HH:MM" time. The server turns that pair into the
 * epoch millisecond it stores.
 */

export const TZ_LABEL = "Asia/Singapore";
export const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The chat is reminded at this hour, local time, on the day itself. */
export const REMINDER_HOUR = 9;
/** How close to the start a late-published hangout still earns a reminder. */
export const LATE_REMINDER_LEAD_MS = 60 * 60 * 1000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A Date whose UTC getters read out Singapore wall-clock parts. */
function localParts(epochMs: number): Date {
  return new Date(epochMs + TZ_OFFSET_MS);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export type LocalWhen = { date: string; time: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export function isValidWhen(when: LocalWhen): boolean {
  if (!DATE_PATTERN.test(when.date) || !TIME_PATTERN.test(when.time)) return false;
  const [hour, minute] = when.time.split(":").map(Number);
  if (hour > 23 || minute > 59) return false;
  const epoch = whenToEpoch(when);
  if (!Number.isFinite(epoch)) return false;
  // Rejects the calendar-shaped-but-unreal, like 2026-02-31, which Date.UTC
  // would silently roll forward into March.
  return epochToWhen(epoch).date === when.date;
}

/** "2026-08-29" + "19:30" in Singapore, as an epoch millisecond. */
export function whenToEpoch(when: LocalWhen): number {
  const [year, month, day] = when.date.split("-").map(Number);
  const [hour, minute] = when.time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) - TZ_OFFSET_MS;
}

export function epochToWhen(epochMs: number): LocalWhen {
  const parts = localParts(epochMs);
  return {
    date: `${parts.getUTCFullYear()}-${pad(parts.getUTCMonth() + 1)}-${pad(parts.getUTCDate())}`,
    time: `${pad(parts.getUTCHours())}:${pad(parts.getUTCMinutes())}`,
  };
}

/** Midnight, Singapore time, of the day that epochMs falls in. */
export function startOfLocalDay(epochMs: number): number {
  const shifted = epochMs + TZ_OFFSET_MS;
  return shifted - (shifted % DAY_MS) - TZ_OFFSET_MS;
}

export function daysApart(epochMs: number, fromMs: number): number {
  return Math.round((startOfLocalDay(epochMs) - startOfLocalDay(fromMs)) / DAY_MS);
}

/**
 * "Fri 29 Aug". Never relative, so it stays true in a message that was written
 * once and not looked at again — which is every chat card the bot edits and
 * then leaves alone for a week.
 */
export function formatDate(epochMs: number, nowMs: number = Date.now()): string {
  const parts = localParts(epochMs);
  const stamp = `${WEEKDAYS[parts.getUTCDay()]} ${parts.getUTCDate()} ${MONTHS[parts.getUTCMonth()]}`;
  // A date more than a few months out is ambiguous without the year.
  return Math.abs(daysApart(epochMs, nowMs)) > 300
    ? `${stamp} ${parts.getUTCFullYear()}`
    : stamp;
}

/** "Today", "Tomorrow", "Fri 29 Aug" — whichever a person would actually say.
 *  Only for surfaces that re-render as time passes: the Mini App, and the
 *  reminder, which is composed at the moment it is sent. */
export function formatDay(epochMs: number, nowMs: number = Date.now()): string {
  const offset = daysApart(epochMs, nowMs);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return formatDate(epochMs, nowMs);
}

/** 12-hour clock, because that is how the group chat says it. */
export function formatTime(epochMs: number): string {
  const parts = localParts(epochMs);
  const hour24 = parts.getUTCHours();
  const minute = parts.getUTCMinutes();
  const suffix = hour24 < 12 ? "am" : "pm";
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour}${suffix}` : `${hour}:${pad(minute)}${suffix}`;
}

export function formatWhen(epochMs: number, nowMs: number = Date.now()): string {
  return `${formatDay(epochMs, nowMs)} · ${formatTime(epochMs)}`;
}

/**
 * When to nudge the chat: the morning of the hangout. A hangout published after
 * that moment has already missed it, so it falls back to an hour before the
 * start; one published inside that hour gets no reminder, since the message
 * would land on top of the thing it was reminding about.
 */
export function reminderTimeFor(startsAt: number, nowMs: number): number | null {
  const morningOf = startOfLocalDay(startsAt) + REMINDER_HOUR * 60 * 60 * 1000;
  if (morningOf > nowMs) return morningOf;
  const lastCall = startsAt - LATE_REMINDER_LEAD_MS;
  return lastCall > nowMs ? lastCall : null;
}
