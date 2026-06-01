import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { MAX_NAME, MAX_TITLE, useViewerName } from "../lib/identity";
import { humanError } from "../lib/ui";
import { HostSignIn } from "../components/HostSignIn";

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
  const [nameMode, setNameMode] = useState<"idle" | "editing" | "saving">("idle");
  const [draftName, setDraftName] = useState("");

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
    const next = draftName.trim();
    if (!next) return;
    setNameMode("saving");
    try {
      await setMyName({ name: next });
      setNameMode("idle");
    } catch (err) {
      alert(humanError(err));
      setNameMode("editing");
    }
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
          {nameMode !== "idle" ? (
            <div className="stack">
              <input
                className="input"
                placeholder="Your name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={MAX_NAME}
                autoFocus
              />
              <div className="host-controls">
                <button
                  className="btn btn--block"
                  onClick={saveName}
                  disabled={nameMode === "saving" || !draftName.trim()}>
                  {nameMode === "saving" ? "Saving…" : "Save name"}
                </button>
                <button
                  className="btn btn--ghost btn--block"
                  onClick={() => setNameMode("idle")}
                  disabled={nameMode === "saving"}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="hosting-as">
              Hosting as <strong>{hostName || "…"}</strong>
              <button
                className="linklike"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  setDraftName(hostName);
                  setNameMode("editing");
                }}>
                edit
              </button>
            </div>
          )}
          <input
            className="input"
            placeholder="Name this round (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
          />
          <button
            className="btn btn--block btn--lg"
            onClick={startRoom}
            disabled={creating || nameMode !== "idle" || !hostName}>
            {creating ? "Spinning it up…" : "Start a room 🎉"}
          </button>
        </div>
      ) : (
        <button className="btn btn--block btn--lg" onClick={startRoom}>
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
                <code>{r.code}</code>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="home-footer">
        {isAuthenticated ? (
          <button
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
