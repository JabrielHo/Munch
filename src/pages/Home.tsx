import { useEffect, useReducer, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { MAX_NAME, MAX_TITLE, useViewerName } from "../lib/identity";
import { humanError } from "../lib/ui";
import { HostSignIn } from "../components/HostSignIn";

type NameEditState = { mode: "idle" | "editing" | "saving"; draft: string };
type NameEditAction =
  | { type: "edit"; name: string }
  | { type: "change"; value: string }
  | { type: "saving" }
  | { type: "saved" }
  | { type: "failed" }
  | { type: "cancel" };

const NAME_EDIT_IDLE: NameEditState = { mode: "idle", draft: "" };

function nameEditReducer(state: NameEditState, action: NameEditAction): NameEditState {
  switch (action.type) {
    case "edit":
      return { mode: "editing", draft: action.name };
    case "change":
      return { ...state, draft: action.value };
    case "saving":
      return { ...state, mode: "saving" };
    case "failed":
      return { ...state, mode: "editing" };
    case "saved":
    case "cancel":
      return NAME_EDIT_IDLE;
    default:
      return state;
  }
}

export default function Home() {
  const navigate = useNavigate();
  // The host's name lives on their account — resolved (with guests) in one place.
  const { name: hostName, isAuthenticated, resolving } = useViewerName();
  const { signOut } = useAuthActions();
  const createRoom = useMutation(api.rooms.createRoom);
  const setMyName = useMutation(api.account.setMyName);
  const recent = useQuery(api.rooms.myRooms, isAuthenticated ? {} : "skip");

  const [title, setTitle] = useState("");
  const [showSignIn, setShowSignIn] = useState(false);
  const [creating, setCreating] = useState(false);

  // Inline name editor. Saving writes to the account, so it syncs everywhere.
  const [nameEdit, dispatchName] = useReducer(nameEditReducer, NAME_EDIT_IDLE);

  // Move focus into the field when the editor opens (a deliberate user action),
  // rather than autoFocus which would yank focus on page load.
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (nameEdit.mode === "editing") nameInputRef.current?.focus();
  }, [nameEdit.mode]);

  async function startRoom() {
    if (resolving) return;
    if (!isAuthenticated) {
      setShowSignIn(true);
      return;
    }
    setCreating(true);
    try {
      const { code } = await createRoom({ title });
      navigate(`/r/${code}`);
    } catch (err) {
      alert(humanError(err));
    } finally {
      setCreating(false);
    }
  }

  async function saveName() {
    const next = nameEdit.draft.trim();
    if (!next) return;
    dispatchName({ type: "saving" });
    try {
      await setMyName({ name: next });
      dispatchName({ type: "saved" });
    } catch (err) {
      alert(humanError(err));
      dispatchName({ type: "failed" });
    }
  }

  const booting = resolving || (isAuthenticated && recent === undefined);
  if (booting) {
    return (
      <div className="screen">
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="screen home">
      <div className="home-top">
        <div className="wordmark">Munch&nbsp;🍜</div>
        <div className="tagline">Stop asking. Start eating.</div>
      </div>

      {showSignIn && !isAuthenticated ? (
        <HostSignIn />
      ) : isAuthenticated ? (
        <div className="stack">
          {nameEdit.mode !== "idle" ? (
            <div className="stack">
              <input
                ref={nameInputRef}
                className="input"
                aria-label="Your name"
                placeholder="Your name"
                value={nameEdit.draft}
                onChange={(e) => dispatchName({ type: "change", value: e.target.value })}
                maxLength={MAX_NAME}
              />
              <div className="host-controls">
                <button
                  type="button"
                  className="btn btn--block"
                  onClick={saveName}
                  disabled={nameEdit.mode === "saving" || !nameEdit.draft.trim()}>
                  {nameEdit.mode === "saving" ? "Saving…" : "Save name"}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  onClick={() => dispatchName({ type: "cancel" })}
                  disabled={nameEdit.mode === "saving"}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="hosting-as">
              Hosting as <strong>{hostName || "…"}</strong>
              <button
                type="button"
                className="linklike"
                style={{ marginLeft: 8 }}
                onClick={() => dispatchName({ type: "edit", name: hostName })}>
                edit
              </button>
            </div>
          )}
          <input
            className="input"
            aria-label="Name this round"
            placeholder="Name this round (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
          />
          <button
            type="button"
            className="btn btn--block btn--lg"
            onClick={startRoom}
            disabled={creating || nameEdit.mode !== "idle" || !hostName}>
            {creating ? "Spinning it up…" : "Start a room 🎉"}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn--block btn--lg" onClick={startRoom}>
          Start a room 🎉
        </button>
      )}

      {recent && recent.length > 0 && (
        <div className="recent">
          <div className="recent-label">Jump back in</div>
          <div className="recent-scroll">
            {recent.map((r) => (
              <Link key={r.code} className="recent-item" to={`/r/${r.code}`}>
                <span>
                  {r.title}
                  {r.closedAt ? " · closed" : ""}
                </span>
                <span aria-hidden>→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="home-footer">
        {isAuthenticated ? (
          <button
            type="button"
            className="linklike"
            onClick={() => {
              setShowSignIn(false);
              void signOut();
            }}>
            Sign out
          </button>
        ) : (
          "No account needed to join. Just wait for a friend to send a link."
        )}
      </div>
    </div>
  );
}
