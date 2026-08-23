import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatTime, whenToEpoch } from "../../convex/time";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

/** The calendar and its date library are a third of the bundle, and only the
 *  person planning a hangout ever opens one — everyone else answers from the
 *  chat and never loads the app at all. So it arrives when the popover does. */
const Calendar = lazy(() =>
  import("@/components/ui/calendar").then((module) => ({ default: module.Calendar })),
);

type Props = {
  id?: string;
  type: "date" | "time";
  /** "YYYY-MM-DD" for a date, "HH:MM" for a time — the same shape the server takes. */
  value: string;
  onChange: (next: string) => void;
  /** Earliest selectable date, as "YYYY-MM-DD". Ignored for a time field. */
  min?: string;
  className?: string;
};

/** Every half hour. Long enough to scroll, short enough to never need typing. */
const TIME_STEP_MINUTES = 30;

/**
 * A date or time field Munch draws end to end.
 *
 * It used to be a native `<input type="date">`, which every engine dresses its
 * own way in shadow DOM that mostly ignores our CSS: desktop Chrome puts a
 * calendar button inside, Android Chrome draws a dropdown arrow, iOS Safari
 * neither. Styling around that was a losing game, so the control is ours now —
 * a popover with a calendar, or a list of times — and it looks the same on
 * every phone in the group.
 *
 * The value stays a plain "YYYY-MM-DD" / "HH:MM" string, so nothing downstream
 * had to change.
 */
export function DateTimeInput({ id, type, value, onChange, min, className }: Props) {
  const [open, setOpen] = useState(false);
  const Icon = type === "date" ? CalendarDays : Clock;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        className={cn(
          "flex h-12 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-base",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}>
        <span className={cn("flex-1 truncate", !value && "text-muted-foreground")}>
          {describe(type, value)}
        </span>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent>
        {type === "date" ? (
          <Suspense fallback={<Skeleton className="m-3 h-72 w-72" />}>
            <Calendar
              mode="single"
              autoFocus
              selected={parseDate(value)}
              defaultMonth={parseDate(value)}
              disabled={min ? { before: parseDate(min)! } : undefined}
              onSelect={(day) => {
                if (!day) return;
                onChange(toDateValue(day));
                setOpen(false);
              }}
            />
          </Suspense>
        ) : (
          <TimeList
            value={value}
            onPick={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function TimeList({ value, onPick }: { value: string; onPick: (next: string) => void }) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Opening on midnight when the hangout is at seven would mean scrolling past
  // fourteen rows to see the answer you already picked.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div className="max-h-64 w-40 overflow-y-auto p-1" role="listbox" aria-label="Time">
      {everyHalfHour().map((time) => {
        const selected = time === value;
        return (
          <button
            key={time}
            ref={selected ? selectedRef : undefined}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onPick(time)}
            className={cn(
              "w-full rounded-md px-3 py-2.5 text-left text-base font-semibold",
              selected ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}>
            {labelForTime(time)}
          </button>
        );
      })}
    </div>
  );
}

function everyHalfHour(): string[] {
  const times: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += TIME_STEP_MINUTES) {
    times.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  }
  return times;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The calendar works in Date objects, which carry the device's timezone, while
 * Munch stores a bare Singapore date. Both of these only ever touch the local
 * date parts, so the day can never shift under a traveller's phone clock.
 */
function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateValue(day: Date): string {
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

function labelForTime(time: string): string {
  return formatTime(whenToEpoch({ date: "2000-01-01", time }));
}

/** Munch's own wording rather than the device locale's "23/08/2026", which
 *  changes shape from phone to phone. */
function describe(type: "date" | "time", value: string): string {
  if (!value) return type === "date" ? "Pick a day" : "Pick a time";
  return type === "date"
    ? formatDate(whenToEpoch({ date: value, time: "12:00" }))
    : labelForTime(value);
}
