import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { VIEWER_NAME, rememberRoomCode } from "../lib/identity";
import { useRoomSession } from "../lib/session";
import { CollectView } from "../components/CollectView";
import { DecideView } from "../components/DecideView";
import { ClosedView } from "../components/ClosedView";
import { LoadingScreen } from "../components/LoadingScreen";
import { NoticeScreen } from "../components/NoticeScreen";

const HEARTBEAT_MS = 1_500;

export default function Room() {
  const { code = "" } = useParams();
  const session = useRoomSession(code);
  const token = session.status === "ok" ? session.token : null;

  const data = useQuery(api.rooms.getRoom, token ? { code, token } : "skip");
  const presence = useQuery(api.presence.here, token ? { code, token } : "skip");

  const heartbeat = useMutation(api.presence.heartbeat);
  const leave = useMutation(api.presence.leave);

  useEffect(() => {
    if (!code || !token) return;
    const siteUrl =
      import.meta.env.VITE_CONVEX_SITE_URL ||
      import.meta.env.VITE_CONVEX_URL.replace(".convex.cloud", ".convex.site");
    const beat = () => {
      void heartbeat({ code, token }).catch(() => {});
    };
    const leaveOnClose = () => {
      if (siteUrl) {
        navigator.sendBeacon(`${siteUrl}/leave`, JSON.stringify({ code, token }));
      }
    };

    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    window.addEventListener("pagehide", leaveOnClose);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", leaveOnClose);
    };
  }, [code, token, heartbeat]);

  useEffect(() => {
    if (!code || !token) return;
    return () => {
      void leave({ code, token }).catch(() => {});
    };
  }, [code, token, leave]);

  // Anchor for bare Mini App opens (no startapp param): remember the room so
  // TgEntry can land on this group's history instead of a dead end.
  const found = data != null;
  useEffect(() => {
    if (code && found) rememberRoomCode(code);
  }, [code, found]);

  if (session.status === "denied") return <NoticeScreen message={session.message} />;
  if (!token) return <LoadingScreen />;

  if (data === undefined) return <LoadingScreen />;
  if (data === null) return <NoticeScreen message="That round isn't here." />;

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
      name={VIEWER_NAME}
      token={token}
    />
  );
}
