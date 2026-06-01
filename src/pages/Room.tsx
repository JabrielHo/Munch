import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CLIENT_ID, useDisplayName } from "../lib/identity";
import { CollectView } from "../components/CollectView";
import { DecideView } from "../components/DecideView";
import { ClosedView } from "../components/ClosedView";
import { NameGate } from "../components/NameGate";

const HEARTBEAT_MS = 1_500;

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

  // Presence: heartbeat every HEARTBEAT_MS. We KEEP beating even while the tab is
  // hidden, so tabbing/switching away does NOT drop you from "here" — a
  // backgrounded tab still heartbeats (~1/s, which the presence window
  // tolerates). Only an actual page close removes you: `pagehide` fires a
  // sendBeacon that flushes during teardown (and if the beacon is dropped on a
  // full window close, the short server-side window catches it). In-app
  // navigation is handled by the separate unmount effect below.
  useEffect(() => {
    if (!code) return;
    // The Convex HTTP-actions origin. Set explicitly in local dev; in a prod
    // build it's derivable from the deployment URL (.convex.cloud → .convex.site).
    const siteUrl =
      import.meta.env.VITE_CONVEX_SITE_URL ||
      import.meta.env.VITE_CONVEX_URL.replace(".convex.cloud", ".convex.site");
    const beat = () => {
      void heartbeat({ code, clientId: CLIENT_ID, name: name || "Guest" }).catch(
        () => {},
      );
    };
    const leaveOnClose = () => {
      if (siteUrl) {
        navigator.sendBeacon(
          `${siteUrl}/leave`,
          JSON.stringify({ code, clientId: CLIENT_ID }),
        );
      }
    };

    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    window.addEventListener("pagehide", leaveOnClose);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", leaveOnClose);
    };
  }, [code, name, heartbeat]);

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
