import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { Ban, CalendarDays, MapPin, Pencil, Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { formatDay, formatTime } from "../../convex/time";
import { rememberCode } from "@/lib/identity";
import { useGroupSession } from "@/lib/session";
import { haptic, hapticResult, showConfirm, signedInitData } from "@/lib/telegram";
import { alertError, googleMapsSearchUrl } from "@/lib/ui";
import type { RsvpAnswer } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dock, Screen } from "@/components/Screen";
import { GuestList } from "@/components/GuestList";
import { HangoutForm } from "@/components/HangoutForm";
import { LoadingScreen } from "@/components/LoadingScreen";
import { NoticeScreen } from "@/components/NoticeScreen";
import { RsvpButtons } from "@/components/RsvpButtons";

/** The plan, and the one question it asks everyone: are you coming? */
export default function Hangout() {
  const { code = "" } = useParams();
  const session = useGroupSession(code);
  const token = session.status === "ok" ? session.token : null;

  const data = useQuery(api.hangouts.getHangout, token ? { code, token } : "skip");
  const setRsvp = useMutation(api.hangouts.setRsvp);
  const cancelHangout = useAction(api.telegram.cancelHangout);
  const [editing, setEditing] = useState(false);

  // The anchor for a Mini App opened with no code at all — see rememberCode.
  const exists = data != null;
  useEffect(() => {
    if (code && exists) rememberCode(code);
  }, [code, exists]);

  if (session.status === "denied") return <NoticeScreen message={session.message} />;
  if (!token || data === undefined) return <LoadingScreen />;
  if (data === null) return <NoticeScreen message="That hangout isn't here." />;

  const { hangout, rsvps, myAnswer, viewerIsHost } = data;
  const isCancelled = hangout.status === "cancelled";
  // Straight out of /hangout a hangout has a name and nothing else, so its host
  // lands in the form rather than on a card they would have to tap Edit to
  // fill in. Everyone else sees the card, TBC and all, and can already reply.
  const needsDetails = viewerIsHost && !isCancelled && hangout.startsAt === undefined;

  function answer(next: RsvpAnswer) {
    if (!token) return;
    haptic();
    setRsvp({ code, token, answer: next })
      .then(() => hapticResult("success"))
      .catch(alertError);
  }

  async function callOff() {
    if (!token) return;
    const sure = await showConfirm(`Call off "${hangout.title}"? The chat will be told.`);
    if (!sure) return;
    cancelHangout({ initData: signedInitData, code, token }).catch(alertError);
  }

  if (needsDetails || (viewerIsHost && editing)) {
    return (
      <Screen
        title={needsDetails ? "Set it up" : "Edit hangout"}
        subtitle={hangout.title}
        backTo={`/g/${code}`}>
        <HangoutForm
          hangout={hangout}
          token={token}
          onSaved={() => setEditing(false)}
          {...(editing ? { onCancel: () => setEditing(false) } : {})}
        />
      </Screen>
    );
  }

  const roundCode = hangout.round?.code;
  const stillPicking = Boolean(hangout.round) && !hangout.place;

  return (
    <Screen
      title={hangout.title}
      subtitle={`by ${hangout.hostName}`}
      backTo={`/g/${code}`}
      badge={
        isCancelled ? (
          <Badge variant="cant">cancelled</Badge>
        ) : (
          <Badge variant="live">live</Badge>
        )
      }>
      <Card className="divide-y divide-border">
        <div className="flex items-center gap-3 p-4">
          <CalendarDays className="size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            {hangout.startsAt === undefined ? (
              <p className="font-semibold text-muted-foreground">Day and time to be confirmed</p>
            ) : (
              <>
                <p className="font-semibold">{formatDay(hangout.startsAt)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatTime(hangout.startsAt)} · Singapore time
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 p-4">
          <MapPin className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            {hangout.place ? (
              <a
                className="font-semibold underline-offset-4 hover:underline"
                href={googleMapsSearchUrl(hangout.place)}
                target="_blank"
                rel="noreferrer">
                {hangout.place}
              </a>
            ) : stillPicking ? (
              <p className="font-semibold text-muted-foreground">Still picking a spot</p>
            ) : (
              <p className="font-semibold text-muted-foreground">Somewhere — to be confirmed</p>
            )}
          </div>
          {roundCode && (
            <Button asChild size="sm" variant={stillPicking ? "default" : "outline"}>
              <Link to={`/r/${roundCode}`}>
                <Sparkles />
                {stillPicking ? "Pick" : "Round"}
              </Link>
            </Button>
          )}
        </div>
      </Card>

      {!isCancelled && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-base font-semibold">
            {myAnswer ? "Changed your mind?" : "Coming along?"}
          </h2>
          <RsvpButtons value={myAnswer} onPick={answer} />
        </section>
      )}

      <Separator />
      <GuestList rsvps={rsvps} />

      {viewerIsHost && !isCancelled && (
        <Dock>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={() => void callOff()}>
              <Ban />
              Call it off
            </Button>
          </div>
        </Dock>
      )}
      {viewerIsHost && !isCancelled && <div className="h-20" aria-hidden />}
    </Screen>
  );
}
