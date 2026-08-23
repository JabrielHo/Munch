import { Button } from "@/components/ui/button";

const STEPS = [
  { emoji: "1️⃣", text: "Send /hangout in the group chat." },
  { emoji: "2️⃣", text: "Pick the day, the time and the place." },
  { emoji: "3️⃣", text: "Everyone taps one button: in, maybe, or can't." },
  { emoji: "4️⃣", text: "On the day, I remind the chat who's coming." },
];

/** The web root is a signpost. The hosted site exists to serve the Mini App;
 *  there is no standalone web experience and there is not meant to be one. */
export default function Landing() {
  // Set VITE_TELEGRAM_BOT_LINK at build time to render a button to the bot.
  const botLink = import.meta.env.VITE_TELEGRAM_BOT_LINK;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="space-y-3 text-center">
        <div className="font-display text-4xl font-semibold">Munch 🎉</div>
        <p className="text-lg text-muted-foreground">
          Sort out hangouts without leaving the group chat.
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        {STEPS.map((step) => (
          <li key={step.text} className="flex items-start gap-3 rounded-lg bg-card p-3 shadow-sm">
            <span className="text-lg leading-6">{step.emoji}</span>
            <span className="text-sm">{step.text}</span>
          </li>
        ))}
      </ol>

      <p className="text-center text-sm text-muted-foreground">
        Still just deciding where to eat? <b>/munch</b> spins the wheel like it always did.
      </p>

      {botLink && (
        <Button asChild size="lg" className="w-full">
          <a href={botLink}>Add Munch to your group</a>
        </Button>
      )}
    </div>
  );
}
