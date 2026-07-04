import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CLIENT_ID, MAX_TEXT } from "../lib/identity";
import { isTelegram, tgInitData } from "../lib/telegram";
import { useClipboard } from "../lib/hooks";
import { avatarColor, humanError, shareUrl } from "../lib/ui";
import type { PublicRoom, PublicOption } from "../lib/types";
import { OptionRow } from "./OptionRow";

interface Props {
  room: PublicRoom;
  options: PublicOption[];
  viewerIsHost: boolean;
  presence: { count: number; names: string[] } | undefined;
  votedIds: Set<string>;
  name: string;
}

export function CollectView({ room, options, viewerIsHost, presence, votedIds, name }: Props) {
  const addOption = useMutation(api.rooms.addOption);
  const toggleVote = useMutation(api.rooms.toggleVote);
  const removeOption = useMutation(api.rooms.removeOption);
  const miniAppHost = useAction(api.telegram.miniAppHostAction);

  // Host controls only render for the Telegram starter (inside the Mini App),
  // and every host action is verified server-side against the signed initData.
  function hostAct(act: "spin" | "lock" | "end") {
    miniAppHost({ initData: tgInitData, code: room.code, act }).catch((err) =>
      alert(humanError(err)),
    );
  }

  const [text, setText] = useState("");
  const { copied, copy } = useClipboard();

  // The dock is fixed to the bottom; reserve exactly its height as bottom
  // padding so the last option is never hidden behind it (the host's dock is
  // taller, and the "Lock top pick: …" label can wrap). Re-measures on resize.
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  
  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const measure = () => setDockHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    addOption({ code: room.code, text: value, name, clientId: CLIENT_ID })
      .then(() => setText(""))
      .catch((err) => alert(humanError(err)));
  }

  function onVote(optionId: Id<"options">) {
    toggleVote({ optionId, clientId: CLIENT_ID, name }).catch((err) => alert(humanError(err)));
  }

  function onRemove(optionId: Id<"options">) {
    removeOption({ optionId, clientId: CLIENT_ID }).catch((err) => alert(humanError(err)));
  }

  const leader = options[0];
  const names = presence?.names ?? [];
  const here = presence?.count ?? 0;

  return (
    <div
      className="screen room"
      style={{ paddingBottom: dockHeight ? dockHeight + 16 : undefined }}
    >
      <header className="room-header">
        <div className="room-titlerow">
          {/* Inside Telegram there's no "menu" to go back to — the chat is home. */}
          {!isTelegram && (
            <Link to="/" className="room-back" aria-label="Back to menu">
              ←
            </Link>
          )}
          <h1 className="room-title">
            <span>{room.title}</span>
          </h1>
          <span className="live-dot">LIVE</span>
        </div>
        <div className="room-subrow">
          {!isTelegram && (
            <button
              type="button"
              className={`share-chip${copied ? " share-chip--done" : ""}`}
              onClick={() => void copy(shareUrl(room.code))}>
              {copied ? "Copied! ✓ paste in the chat" : "Copy link 🔗"}
            </button>
          )}
          <span className="here-count">{here} here</span>
        </div>
        {names.length > 0 && (
          <div className="presence-names">
            {names.map((n, i) => (
              <span key={`${n}-${i}`} className="who-pill">
                <span className="who-dot" style={{ background: avatarColor(n) }} />
                {n}
              </span>
            ))}
          </div>
        )}
      </header>

      {options.length === 0 ? (
        <div className="empty">Nobody's added anything yet. Go first! 👀</div>
      ) : (
        <div className="options">
          {options.map((o) => (
            <OptionRow
              key={o._id}
              option={o}
              mine={o.mine}
              voted={votedIds.has(o._id)}
              removable={o.mine || viewerIsHost}
              onVote={onVote}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}

      <div className="dock" ref={dockRef}>
        <div className="dock-inner">
          <form className="add-bar" onSubmit={submitAdd}>
            <input
              className="input"
              aria-label="Add a place or a craving"
              placeholder="Add a place or a craving…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_TEXT}
            />
            <button className="fab" type="submit" disabled={!text.trim()} aria-label="Add option">
              ➤
            </button>
          </form>

          {viewerIsHost ? (
            <>
              <div className="host-controls">
                <button
                  type="button"
                  className="btn btn--block"
                  onClick={() => hostAct("spin")}
                  disabled={options.length === 0}>
                  🎡 Spin the wheel
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  onClick={() => hostAct("lock")}
                  disabled={options.length === 0}>
                  🔒 Lock top pick{leader ? `: ${leader.text}` : ""}
                </button>
              </div>
              <div className="center">
                <button
                  type="button"
                  className="linklike"
                  onClick={() => {
                    if (confirm("Close this room for everyone?")) {
                      hostAct("end");
                    }
                  }}>
                  End this room 🌙
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
