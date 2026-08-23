import { useEffect, useReducer } from "react";
import { Link, useParams } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { CalendarDays, ChevronRight, MapPin, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { ANYONE_CAN_CLOSE_AFTER_MS } from "../../convex/lib";
import { formatWhen } from "../../convex/time";
import { useGroupSession } from "@/lib/session";
import { isTelegram, showConfirm, signedInitData } from "@/lib/telegram";
import { alertError, tileColor } from "@/lib/ui";
import type { FeedCard } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyNote, Screen } from "@/components/Screen";
import { LoadingScreen } from "@/components/LoadingScreen";
import { NoticeScreen } from "@/components/NoticeScreen";

const AGE_RECHECK_MS = 60_000;

/**
 * Everything this group has going on. Reached with any hangout or round code in
 * the URL, which the access gate trades for a token covering the whole chat —
 * so both tabs load from the one grant.
 */
export default function GroupPlans() {
  const { code = "" } = useParams();
  const session = useGroupSession(code);
  const token = session.status === "ok" ? session.token : null;

  const feed = useQuery(api.hangouts.groupFeed, token ? { token } : "skip");
  const rounds = useQuery(api.rooms.groupHistory, token ? { token } : "skip");
  const runHostAction = useAction(api.telegram.miniAppHostAction);

  // Neither the reactive query nor React re-runs as time passes, so re-render
  // once a minute to let a round crossing the age threshold grow its Close
  // button while the page is open.
  const [, recheckAges] = useReducer((tick: number) => tick + 1, 0);
  useEffect(() => {
    const intervalId = setInterval(recheckAges, AGE_RECHECK_MS);
    return () => clearInterval(intervalId);
  }, []);

  async function closeRound(roundCode: string, title: string) {
    if (!token) return;
    if (!(await showConfirm(`Close "${title}" for everyone?`))) return;
    // The token is minted per chat rather than per round, so it authorizes
    // closing any round in this group — which is exactly what the server checks.
    runHostAction({ initData: signedInitData, code: roundCode, token, act: "end" }).catch(
      alertError,
    );
  }

  if (session.status === "denied") return <NoticeScreen message={session.message} />;
  if (!token || feed === undefined || rounds === undefined) return <LoadingScreen />;
  if (feed === null || rounds === null) {
    return <NoticeScreen message="Reopen Munch from your group chat." />;
  }

  // Rounds started by a hangout are shown on that hangout instead, so the food
  // tab doesn't list the same thing twice.
  const standaloneRounds = rounds.filter((round) => !round.fromHangout);

  return (
    <Screen title="Your group" subtitle="Plans and food rounds">
      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">🎉 Hangouts</TabsTrigger>
          <TabsTrigger value="rounds">🍜 Food rounds</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Coming up
            </h2>
            {feed.upcoming.length === 0 ? (
              <EmptyNote>
                Nothing planned. Send <b>/hangout</b> in the chat to start one.
              </EmptyNote>
            ) : (
              feed.upcoming.map((card) => <PlanRow key={card.code} card={card} />)
            )}
          </section>

          {feed.past.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Been and gone
              </h2>
              {feed.past.map((card) => (
                <PlanRow key={card.code} card={card} past />
              ))}
            </section>
          )}
        </TabsContent>

        <TabsContent value="rounds" className="flex flex-col gap-2">
          {standaloneRounds.length === 0 ? (
            <EmptyNote>
              No food rounds yet. Send <b>/munch</b> in the chat to spin one up.
            </EmptyNote>
          ) : (
            standaloneRounds.map((round) => {
              const startedOn = new Date(round.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              });
              // Derived here rather than in the query so it stays truthful as
              // rounds age; the server re-checks it on the mutation anyway.
              const canClose =
                !round.closedAt &&
                (round.mine || Date.now() - round.createdAt > ANYONE_CAN_CLOSE_AFTER_MS);

              return (
                <Card key={round.code} className="flex items-center gap-3 p-3">
                  <Link to={`/r/${round.code}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-lg text-lg"
                      style={{ background: tileColor(round.code) }}>
                      {round.winner?.emoji ?? (round.closedAt ? "🌙" : "🍽")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{round.title}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {startedOn} · by {round.hostName}
                        {round.winner ? ` · 🏆 ${round.winner.text}` : ""}
                      </span>
                    </span>
                  </Link>
                  {round.closedAt ? (
                    <Badge variant="muted">closed</Badge>
                  ) : (
                    <Badge variant="live">live</Badge>
                  )}
                  {isTelegram && canClose && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void closeRound(round.code, round.title)}>
                      Close
                    </Button>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </Screen>
  );
}

function PlanRow({ card, past }: { card: FeedCard; past?: boolean }) {
  const when = card.startsAt === undefined ? "Day to be confirmed" : formatWhen(card.startsAt);
  const where = card.place ?? (card.deciding ? "Picking a spot 🎡" : "Somewhere — TBC");

  return (
    <Card className={past ? "opacity-70" : undefined}>
      <Link to={`/p/${card.code}`} className="flex items-center gap-3 p-4">
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{card.title}</span>
            {card.status === "draft" && <Badge variant="muted">draft</Badge>}
            {card.status === "cancelled" && <Badge variant="cant">off</Badge>}
          </span>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" />
            <span className="truncate">{when}</span>
          </span>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{where}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-going">
          <Users className="size-4" />
          {card.goingCount}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </Card>
  );
}
