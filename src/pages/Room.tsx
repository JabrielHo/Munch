import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CLIENT_ID, useViewerName } from "../lib/identity";
import { CollectView } from "../components/CollectView";
import { DecideView } from "../components/DecideView";
import { ClosedView } from "../components/ClosedView";
import { NameGate } from "../components/NameGate";

const HEARTBEAT_MS = 1_500;

export default function Room() {
  const { code = "" } = useParams();

  const data = useQuery(api.rooms.getRoom, { code, clientId: CLIENT_ID });
  const votes = useQuery(api.rooms.myVotes, { code, clientId: CLIENT_ID });
  const presence = useQuery(api.presence.here, { code });

  const { name, setName } = useViewerName();
  const heartbeat = useMutation(api.presence.heartbeat);
  const leave = useMutation(api.presence.leave);

  useEffect(() => {
    if (!code) return;
    const siteUrl =
      import.meta.env.VITE_CONVEX_SITE_URL ||
      import.meta.env.VITE_CONVEX_URL.replace(".convex.cloud", ".convex.site");
    const beat = () => {
      if (!name) return;
      void heartbeat({ code, clientId: CLIENT_ID, name }).catch(() => {});
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

  // Telegram viewers arrive with a name (from the Mini App session); only web
  // guests without one hit the gate.
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
