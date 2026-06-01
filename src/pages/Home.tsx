import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useDisplayName, MAX_NAME, MAX_TITLE } from "../lib/identity";
import { humanError } from "../lib/ui";
import { HostSignIn } from "../components/HostSignIn";

export default function Home() {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [name, setName] = useDisplayName();
  const createRoom = useMutation(api.rooms.createRoom);
  const recent = useQuery(api.rooms.myRooms, isAuthenticated ? {} : "skip");

  const [title, setTitle] = useState("");
  const [showSignIn, setShowSignIn] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hadName] = useState(() => name.trim().length > 0);

  async function startRoom() {
    if (isLoading) return;
    if (!isAuthenticated) {
      setShowSignIn(true);
      return;
    }
    setCreating(true);
    try {
      const hostName = name.trim() || "Host";
      const { code } = await createRoom({ title, hostName });
      if (!name.trim()) setName(hostName);
      navigate(`/r/${code}`);
    } catch (err) {
      alert(humanError(err));
    } finally {
      setCreating(false);
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
          {hadName ? (
            <div className="hosting-as">
              Hosting as <strong>{name}</strong>
            </div>
          ) : (
            <input
              className="input"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME}
              autoFocus
            />
          )}
          <input
            className="input"
            placeholder="Name this round (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
          />
          <button className="btn btn--block btn--lg" onClick={startRoom} disabled={creating || !name.trim()}>
            {creating ? "Spinning it up…" : name.trim() ? "Start a room 🎉" : "Enter your name first ☝️"}
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
