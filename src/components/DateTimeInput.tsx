import { useRef } from "react";
import type { InputHTMLAttributes } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { type: "date" | "time" };

/**
 * A native date or time field wearing our own icon.
 *
 * Every engine draws the built-in picker button its own way: desktop Chrome a
 * calendar, Android Chrome a dropdown arrow, iOS Safari nothing at all. Left
 * alone the field reads as a different control on each platform, so index.css
 * hides that button and this draws one icon that looks the same everywhere.
 *
 * Hiding it costs the tap target, so the button below opens the picker through
 * `showPicker()` instead. Chrome 99, Safari 16 and Firefox 101 all support it,
 * which covers every webview Telegram runs. The field itself stays a real
 * `date` / `time` input, so each platform's own picker is what opens — the iOS
 * wheel included — and typing, keyboards and screen readers behave as usual.
 */
export function DateTimeInput({ type, ...props }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = type === "date" ? CalendarDays : Clock;

  function openPicker() {
    const input = inputRef.current;
    if (!input || input.disabled) return;
    try {
      input.showPicker();
    } catch {
      // Older engines, or a call the browser didn't tie to a real tap. Focusing
      // is the honest fallback: it opens the picker on iOS and lets everyone
      // else type the value.
      input.focus();
    }
  }

  return (
    <div className="relative">
      <Input ref={inputRef} type={type} {...props} />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        aria-label={type === "date" ? "Choose a date" : "Choose a time"}
        // Firefox draws its own icon inside the field and gives us nothing to
        // hide, so this steps aside there rather than sitting beside a duplicate.
        className="native-picker-icon absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
        <Icon className="size-4" />
      </button>
    </div>
  );
}
