import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CLIENT_ID, useDisplayName } from "../lib/identity";
import { CollectView } from "../components/CollectView";
import { DecideView } from "../components/DecideView";
import { ClosedView } from "../components/ClosedView";
import { NameGate } from "../components/NameGate";

export default function Room() {
  const { code = "" } = useParams();

  // All server state comes from reactive Convex subscriptions — never fetched
  // inside an effect. The list, votes, and presence update themselves live.
  const data = useQuery(api.rooms.getRoom, { code });
  const votes = useQuery(api.rooms.myVotes, { code, clientId: CLIENT_ID });
  const presence = useQuery(api.presence.here, { code });

  const [name, setName] = useDisplayName();
  const heartbeat = useMutation(api.presence.heartbeat);
  const leave = useMutation(api.presence.leave);

  // Presence: heartbeat ~every 1s while the tab is visible, and drop INSTANTLY
  // when it's hidden (tab/app switch, phone lock) or closed. `visibilitychange`
  // → hidden is the reliable cross-platform "going away" signal — pagehide and
  // beforeunload don't fire dependably on mobile — with `pagehide` as a
  // desktop-close backstop. sendBeacon is guaranteed to flush during teardown.
  // The heartbeat pauses while hidden so it can't re-add a guest who just left.
  useEffect(() => {
    if (!code) return;
    // The Convex HTTP-actions origin. Set explicitly in local dev; in a prod
    // build it's derivable from the deployment URL (.convex.cloud → .convex.site).
    const siteUrl =
      import.meta.env.VITE_CONVEX_SITE_URL ||
      import.meta.env.VITE_CONVEX_URL.replace(".convex.cloud", ".convex.site");
    let alive = true;
    const beat = () => {
      if (alive && document.visibilityState === "visible") {
        void heartbeat({ code, clientId: CLIENT_ID, name: name || "Guest" }).catch(
          () => {},
        );
      }
    };
    const leaveNow = () => {
      // Primary: a mutation over the still-open socket. This is what fires when
      // the tab is just hidden (you switch to another tab/app, lock the phone),
      // and it needs no env var, so it works regardless of dev-server state.
      void leave({ code, clientId: CLIENT_ID }).catch(() => {});
      // Best-effort backstop for an actual close, where the socket is already
      // gone (only works if VITE_CONVEX_SITE_URL was set at build time).
      if (siteUrl) {
        navigator.sendBeacon(
          `${siteUrl}/leave`,
          JSON.stringify({ code, clientId: CLIENT_ID }),
        );
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leaveNow();
      else beat(); // re-announce the moment they come back
    };

    beat();
    const id = setInterval(beat, 1_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leaveNow);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leaveNow);
    };
  }, [code, name, heartbeat, leave]);

  // In-app navigation away (React unmount) → leave over the open socket, instant.
  // Separate from the heartbeat effect so it doesn't fire on name changes.
  useEffect(() => {
    if (!code) return;
    return () => {
      void leave({ code, clientId: CLIENT_ID }).catch(() => {});
    };
  }, [code, leave]);

  if (data === undefined) {
    return (
      <div className="screen">
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="screen home">
        <div className="home-top">
          <div className="wordmark">Munch&nbsp;🍜</div>
          <div className="tagline">That room isn't here.</div>
        </div>
        <Link className="btn btn--block btn--lg" to="/">
          Back to start
        </Link>
      </div>
    );
  }

  const { room, options, viewerIsHost } = data;
  const votedIds = new Set<string>(votes ?? []);

  // A decided room is also "closed", but the spin animation + result reveal
  // take precedence so everyone still sees the decision play out.
  if (room.phase === "deciding") {
    return (
      <DecideView key={room.spinStartedAt ?? "decide"} room={room} options={options} viewerIsHost={viewerIsHost} />
    );
  }

  if (room.closedAt) {
    return <ClosedView room={room} options={options} />;
  }

  // Ask for a name up front before anyone can add or vote. The host already
  // named themselves when creating the room, so they skip straight through.
  if (!name) {
    return <NameGate room={room} onSubmit={setName} />;
  }

  return (
    <CollectView
      room={room}
      options={options}
      viewerIsHost={viewerIsHost}
      presence={presence}
      votedIds={votedIds}
      name={name}
    />
  );
}
