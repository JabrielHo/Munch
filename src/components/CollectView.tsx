import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { Lock, Plus, Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MAX_OPTION_LENGTH } from "@/lib/identity";
import { haptic, showConfirm, signedInitData } from "@/lib/telegram";
import { alertError, avatarColor } from "@/lib/ui";
import type { PublicRoom, PublicOption } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dock, EmptyNote, Screen } from "@/components/Screen";
import { OptionRow } from "./OptionRow";

interface Props {
  room: PublicRoom;
  options: PublicOption[];
  viewerIsHost: boolean;
  presence: { count: number; names: string[] } | undefined;
  votedIds: Set<string>;
  name: string;
  token: string;
  backTo: string;
}

export function CollectView({
  room,
  options,
  viewerIsHost,
  presence,
  votedIds,
  name,
  token,
  backTo,
}: Props) {
  const addOption = useMutation(api.rooms.addOption);
  const toggleVote = useMutation(api.rooms.toggleVote);
  const removeOption = useMutation(api.rooms.removeOption);
  const miniAppHostAction = useAction(api.telegram.miniAppHostAction);

  const [draft, setDraft] = useState("");

  // Hiding the controls from non-hosts is cosmetic only — the server verifies
  // the signed initData and the access token on every one of these.
  function runHostAction(act: "spin" | "lock" | "end") {
    haptic("medium");
    miniAppHostAction({ initData: signedInitData, code: room.code, token, act }).catch(alertError);
  }

  function submitOption(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    addOption({ code: room.code, text, token })
      .then(() => setDraft(""))
      .catch(alertError);
  }

  function handleVote(optionId: Id<"options">) {
    toggleVote({ optionId, token }).catch(alertError);
  }

  function handleRemove(optionId: Id<"options">) {
    removeOption({ optionId, token }).catch(alertError);
  }

  const topOption = options[0];
  const peopleHere = presence?.names ?? [];

  return (
    <Screen
      title={room.title}
      subtitle={`${presence?.count ?? 0} here now`}
      backTo={backTo}
      badge={<Badge variant="live">live</Badge>}>
      {peopleHere.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {peopleHere.map((person, index) => (
            <span
              key={`${person}-${index}`}
              className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
              <span className="size-2 rounded-full" style={{ background: avatarColor(person) }} />
              {person}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 pb-52">
        {options.length === 0 ? (
          <EmptyNote>Nobody's added anything yet. Go first 👀</EmptyNote>
        ) : (
          options.map((option) => (
            <OptionRow
              key={option._id}
              option={option}
              voted={votedIds.has(option._id)}
              removable={option.mine || viewerIsHost}
              onVote={handleVote}
              onRemove={handleRemove}
            />
          ))
        )}
      </div>

      <Dock>
        <form className="flex gap-2" onSubmit={submitOption}>
          <Input
            aria-label="Add a place or a craving"
            placeholder="A place, or just a craving…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_OPTION_LENGTH}
          />
          <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Add option">
            <Plus />
          </Button>
        </form>

        {viewerIsHost ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => runHostAction("spin")} disabled={options.length === 0}>
                <Sparkles />
                Spin
              </Button>
              <Button
                variant="outline"
                onClick={() => runHostAction("lock")}
                disabled={options.length === 0}>
                <Lock />
                Lock top pick
              </Button>
            </div>
            {topOption && (
              <p className="truncate text-center text-xs text-muted-foreground">
                Top pick right now: <b>{topOption.text}</b>
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() =>
                void showConfirm("Close this round for everyone?").then(
                  (sure) => sure && runHostAction("end"),
                )
              }>
              End this round
            </Button>
          </>
        ) : (
          <p className="pb-1 text-center text-sm text-muted-foreground">
            You're in{name ? `, ${name}` : ""}. Keep voting — the host calls the spin 🗳️
          </p>
        )}
      </Dock>
    </Screen>
  );
}
