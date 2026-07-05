import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CLIENT_ID, VIEWER_NAME, rememberRoomCode } from "../lib/identity";
import { CollectView } from "../components/CollectView";
import { DecideView } from "../components/DecideView";
import { ClosedView } from "../components/ClosedView";
import { LoadingScreen } from "../components/LoadingScreen";

const HEARTBEAT_MS = 1_500;

export default function Room() {
  const { code = "" } = useParams();

  const data = useQuery(api.rooms.getRoom, { code, clientId: CLIENT_ID });
  const presence = useQuery(api.presence.here, { code });

  const name = VIEWER_NAME;
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

  // Anchor for bare Mini App opens (no startapp param): remember the room so
  // TgEntry can land on this group's history instead of a dead end.
  const found = data != null;
  useEffect(() => {
    if (code && found) rememberRoomCode(code);
  }, [code, found]);

  if (data === undefined) {
    return <LoadingScreen />;
  }

  if (data === null) {
    return (
      <div className="screen home">
        <div className="home-top">
          <div className="wordmark">Munch&nbsp;🍜</div>
          <div className="tagline">That round isn't here.</div>
        </div>
        <Link className="btn btn--block btn--lg" to="/">
          What is Munch?
        </Link>
      </div>
    );
  }

  const { room, options, viewerIsHost, myVoteIds } = data;
  const votedIds = new Set<string>(myVoteIds);

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
