import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateTimeInput } from "@/components/DateTimeInput";
import { epochToWhen, formatDay, whenToEpoch, type LocalWhen } from "../../convex/time";

const DAY_MS = 24 * 60 * 60 * 1000;
const QUICK_DAYS = 6;
const QUICK_TIMES = ["12:00", "18:00", "19:00", "20:00"];

/** Noon, so shifting by whole days can't skate across a boundary. */
function dateOffsetFromToday(days: number): string {
  return epochToWhen(whenToEpoch({ date: epochToWhen(Date.now()).date, time: "12:00" }) + days * DAY_MS)
    .date;
}

function dayLabel(date: string): string {
  return formatDay(whenToEpoch({ date, time: "12:00" }));
}

function timeLabel(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour < 12 ? "am" : "pm";
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${shown}${suffix}` : `${shown}:${String(minute).padStart(2, "0")}${suffix}`;
}

/**
 * Day and time, chosen by tapping rather than typing. The chips cover the next
 * week, which is when almost every hangout actually happens; anything further
 * out falls through to the phone's own date picker, which every person with a
 * phone has already used.
 */
export function WhenPicker({
  value,
  onChange,
}: {
  value: LocalWhen;
  onChange: (next: LocalWhen) => void;
}) {
  const quickDates = Array.from({ length: QUICK_DAYS }, (_, index) => dateOffsetFromToday(index));
  const isCustomDate = value.date !== "" && !quickDates.includes(value.date);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="hangout-date">Which day?</Label>
        <div className="flex flex-wrap gap-2">
          {quickDates.map((date) => (
            <Button
              key={date}
              type="button"
              size="sm"
              variant={value.date === date ? "default" : "outline"}
              onClick={() => onChange({ ...value, date })}>
              {dayLabel(date)}
            </Button>
          ))}
        </div>
        <DateTimeInput
          id="hangout-date"
          type="date"
          value={value.date}
          min={quickDates[0]}
          onChange={(date) => onChange({ ...value, date })}
          className={isCustomDate ? "border-primary" : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="hangout-time">What time?</Label>
        <div className="flex flex-wrap gap-2">
          {QUICK_TIMES.map((time) => (
            <Button
              key={time}
              type="button"
              size="sm"
              variant={value.time === time ? "default" : "outline"}
              onClick={() => onChange({ ...value, time })}>
              {timeLabel(time)}
            </Button>
          ))}
        </div>
        <DateTimeInput
          id="hangout-time"
          type="time"
          value={value.time}
          onChange={(time) => onChange({ ...value, time })}
        />
      </div>
    </div>
  );
}
