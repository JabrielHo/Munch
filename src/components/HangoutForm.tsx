import { useState } from "react";
import { useMutation } from "convex/react";
import { Check, MapPin, Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { MAX_TITLE_LENGTH } from "../../convex/lib";
import { epochToWhen, type LocalWhen } from "../../convex/time";
import { MAX_PLACE_LENGTH } from "@/lib/identity";
import { alertError } from "@/lib/ui";
import type { PublicHangout } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dock } from "@/components/Screen";
import { WhenPicker } from "@/components/WhenPicker";

/** Most hangouts are dinner, and dinner is at seven. */
const DEFAULT_TIME = "19:00";

/**
 * The host's whole job, on one screen: name it, pick a day and time, then
 * either say where or hand that question to the wheel.
 *
 * The card is already in the chat by the time anyone gets here — /hangout posts
 * it — so saving edits that message rather than sending anything new.
 */
export function HangoutForm({
  hangout,
  token,
  onSaved,
  onCancel,
}: {
  hangout: PublicHangout;
  token: string;
  onSaved: () => void;
  /** Omitted when the hangout has no details yet: there is nothing to go back
   *  to, so the screen offers the header's back arrow instead. */
  onCancel?: () => void;
}) {
  const saveDetails = useMutation(api.hangouts.saveDetails);

  const [title, setTitle] = useState(hangout.title);
  const [when, setWhen] = useState<LocalWhen>(
    hangout.when ?? { date: epochToWhen(Date.now()).date, time: DEFAULT_TIME },
  );
  const [useWheel, setUseWheel] = useState(Boolean(hangout.round) && !hangout.place);
  const [place, setPlace] = useState(hangout.place ?? "");
  const [busy, setBusy] = useState(false);

  const ready = title.trim().length > 0 && Boolean(when.date) && Boolean(when.time);

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await saveDetails({
        code: hangout.code,
        token,
        title,
        when,
        place: useWheel ? undefined : place,
        decideWithWheel: useWheel,
      });
      onSaved();
    } catch (err) {
      alertError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-5 pb-40">
        <div className="flex flex-col gap-2">
          <Label htmlFor="hangout-title">What are we doing?</Label>
          <Input
            id="hangout-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            placeholder="Dinner, movie night, badminton…"
          />
        </div>

        <WhenPicker value={when} onChange={setWhen} />

        <div className="flex flex-col gap-2">
          <Label>Where?</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={useWheel ? "outline" : "default"}
              onClick={() => setUseWheel(false)}>
              <MapPin />
              I'll say
            </Button>
            <Button
              type="button"
              variant={useWheel ? "default" : "outline"}
              onClick={() => setUseWheel(true)}>
              <Sparkles />
              Let us pick
            </Button>
          </div>
          {useWheel ? (
            <p className="text-sm text-muted-foreground">
              Everyone throws in a spot or a craving, votes, and you spin the wheel. Whatever wins
              becomes the place.
            </p>
          ) : (
            <Input
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              maxLength={MAX_PLACE_LENGTH}
              placeholder="Jen's place, Bugis MRT, that new ramen bar…"
            />
          )}
        </div>
      </div>

      <Dock>
        <Button size="lg" disabled={!ready || busy} onClick={() => void save()}>
          <Check />
          Save
        </Button>
        {onCancel && (
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </Dock>
    </>
  );
}
