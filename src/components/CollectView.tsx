import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MAX_OPTION_LENGTH } from "../lib/identity";
import { signedInitData } from "../lib/telegram";
import { alertError, avatarColor } from "../lib/ui";
import type { PublicRoom, PublicOption } from "../lib/types";
import { OptionRow } from "./OptionRow";

interface Props {
  room: PublicRoom;
  options: PublicOption[];
  viewerIsHost: boolean;
  presence: { count: number; names: string[] } | undefined;
  votedIds: Set<string>;
  name: string;
  token: string;
}

export function CollectView({
  room,
  options,
  viewerIsHost,
  presence,
  votedIds,
  name,
  token,
}: Props) {
  const addOption = useMutation(api.rooms.addOption);
  const toggleVote = useMutation(api.rooms.toggleVote);
  const removeOption = useMutation(api.rooms.removeOption);
  const miniAppHostAction = useAction(api.telegram.miniAppHostAction);

  const [draft, setDraft] = useState("");
  // While the add input has focus the on-screen keyboard pushes the fixed dock
  // up over the content, so collapse the dock to just the input row. Host
  // controls and hints come back on blur.
  const [isTyping, setIsTyping] = useState(false);

  // The dock is fixed to the bottom, so reserve exactly its height as padding
  // and the last option is never hidden behind it. Measured rather than
  // hard-coded because the host's dock is taller and its labels can wrap.
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);

  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const measure = () => setDockHeight(dock.offsetHeight);
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(dock);
    return () => resizeObserver.disconnect();
  }, []);

  // Hiding the controls from non-hosts is cosmetic only — the server verifies
  // the signed initData and the access token on every one of these.
  function runHostAction(act: "spin" | "lock" | "end") {
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
  const hereCount = presence?.count ?? 0;

  return (
    <div className="screen room" style={{ paddingBottom: dockHeight ? dockHeight + 16 : undefined }}>
      <header className="room-header">
        <div className="room-titlerow">
          {/* Back goes up a level, to the group's round history. */}
          <Link to={`/h/${room.code}`} className="room-back" aria-label="All rounds">
            ←
          </Link>
          <h1 className="room-title">
            <span>{room.title}</span>
          </h1>
          <span className="live-dot">LIVE</span>
        </div>
        <div className="room-subrow">
          <span className="here-count">{hereCount} here</span>
        </div>
        {peopleHere.length > 0 && (
          <div className="presence-names">
            {peopleHere.map((person, index) => (
              <span key={`${person}-${index}`} className="who-pill">
                <span className="who-dot" style={{ background: avatarColor(person) }} />
                {person}
              </span>
            ))}
          </div>
        )}
      </header>

      {options.length === 0 ? (
        <div className="empty">Nobody's added anything yet. Go first! 👀</div>
      ) : (
        <div className="options">
          {options.map((option) => (
            <OptionRow
              key={option._id}
              option={option}
              voted={votedIds.has(option._id)}
              removable={option.mine || viewerIsHost}
              onVote={handleVote}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      <div className="dock" ref={dockRef}>
        <div className="dock-inner">
          <form className="add-bar" onSubmit={submitOption}>
            <input
              className="input"
              aria-label="Add a place or a craving"
              placeholder="Add a place or a craving…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => setIsTyping(true)}
              onBlur={() => setIsTyping(false)}
              maxLength={MAX_OPTION_LENGTH}
            />
            <button className="fab" type="submit" disabled={!draft.trim()} aria-label="Add option">
              ➤
            </button>
          </form>

          {isTyping ? null : viewerIsHost ? (
            <>
              <div className="host-controls">
                <button
                  type="button"
                  className="btn btn--block"
                  onClick={() => runHostAction("spin")}
                  disabled={options.length === 0}>
                  🎡 Spin the wheel
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  onClick={() => runHostAction("lock")}
                  disabled={options.length === 0}>
                  🔒 Lock top pick{topOption ? `: ${topOption.text}` : ""}
                </button>
              </div>
              <div className="center">
                <button
                  type="button"
                  className="linklike"
                  onClick={() => {
                    if (confirm("Close this round for everyone?")) runHostAction("end");
                  }}>
                  End this round 🌙
                </button>
              </div>
            </>
          ) : (
            <div className="guest-waiting">
              You're in, {name}. The host calls the spin. Keep voting! 🗳️
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
