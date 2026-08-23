import { Button } from "@/components/ui/button";
import type { RsvpAnswer } from "@/lib/types";

const CHOICES = [
  { answer: "in", label: "I'm in", emoji: "✅", variant: "going" },
  { answer: "maybe", label: "Maybe", emoji: "🤔", variant: "maybe" },
  { answer: "out", label: "Can't", emoji: "❌", variant: "cant" },
] as const;

/**
 * The whole point of the app for most people: three buttons, one tap, done.
 * The same three sit on the chat message, so nobody has to open anything at
 * all — this is here for the people who did.
 */
export function RsvpButtons({
  value,
  onPick,
  disabled,
}: {
  value: RsvpAnswer | null;
  onPick: (answer: RsvpAnswer) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {CHOICES.map((choice) => (
        <Button
          key={choice.answer}
          type="button"
          size="lg"
          variant={choice.variant}
          selected={value === choice.answer}
          disabled={disabled}
          onClick={() => onPick(choice.answer)}
          aria-pressed={value === choice.answer}
          className="flex-col gap-0.5 text-xs">
          <span className="text-lg leading-none">{choice.emoji}</span>
          {choice.label}
        </Button>
      ))}
    </div>
  );
}
