import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isTelegram, startParam, markAppReady } from "@/lib/telegram";
import { lastCode } from "@/lib/identity";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/LoadingScreen";

/**
 * The Mini App entry point — the URL registered with BotFather. Telegram opens
 * it with a code riding in ?startapp=…, so this screen exists only to forward
 * on to whatever that code names.
 *
 * Hangout codes are prefixed `h-` when the bot builds the link. A round code is
 * a bare UUID, which always starts with a hex digit, so the two can never be
 * confused — and old links, from before hangouts existed, still land correctly.
 */
export default function TgEntry() {
  const navigate = useNavigate();

  useEffect(() => {
    markAppReady();
    if (!isTelegram) return;
    if (startParam) {
      const hangout = startParam.startsWith("h-") ? startParam.slice(2) : null;
      navigate(hangout ? `/p/${hangout}` : `/r/${startParam}`, { replace: true });
      return;
    }
    // Opened with no code (from the bot profile or a direct link): land on the
    // plans of whichever group this device last used.
    const previous = lastCode();
    if (previous) navigate(`/g/${previous}`, { replace: true });
  }, [navigate]);

  if (!isTelegram) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="space-y-2">
          <div className="font-display text-3xl font-semibold">Munch 🎉</div>
          <p className="text-muted-foreground">This door only opens from inside Telegram.</p>
        </div>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link to="/">What is Munch?</Link>
        </Button>
      </div>
    );
  }

  // The effect above handles both navigations, so this only shows on a device
  // that has never had a group to remember.
  if (!startParam && !lastCode()) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="font-display text-3xl font-semibold">Munch 🎉</div>
        <p className="text-muted-foreground">
          Nothing planned yet. Send <b>/hangout</b> in your group chat, then tap the button on my
          message.
        </p>
      </div>
    );
  }

  return <LoadingScreen />;
}
