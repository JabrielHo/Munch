import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { VIEWER_NAME, rememberCode } from "@/lib/identity";
import { useGroupSession } from "@/lib/session";
import { CollectView } from "@/components/CollectView";
import { DecideView } from "@/components/DecideView";
import { ClosedView } from "@/components/ClosedView";
import { LoadingScreen } from "@/components/LoadingScreen";
import { NoticeScreen } from "@/components/NoticeScreen";

const HEARTBEAT_MS = 1_500;

/** One round of picking a place: adding, voting, and the synced reveal. */
export default function Room() {
  const { code = "" } = useParams();
  const session = useGroupSession(code);
  const token = session.status === "ok" ? session.token : null;

  const roomData = useQuery(api.rooms.getRoom, token ? { code, token } : "skip");
  const presence = useQuery(api.presence.here, token ? { code, token } : "skip");

  const sendHeartbeat = useMutation(api.presence.heartbeat);
  const leaveRoom = useMutation(api.presence.leave);

  useEffect(() => {
    if (!code || !token) return;
    const siteUrl =
      import.meta.env.VITE_CONVEX_SITE_URL ||
      import.meta.env.VITE_CONVEX_URL.replace(".convex.cloud", ".convex.site");

    const beat = () => {
      void sendHeartbeat({ code, token }).catch(() => {});
    };
    // A closing webview can't reliably finish a mutation, so leaving is sent as
    // a beacon instead — see the /leave route in convex/http.ts.
    const announceLeaving = () => {
      if (siteUrl) {
        navigator.sendBeacon(`${siteUrl}/leave`, JSON.stringify({ code, token }));
      }
    };

    beat();
    const intervalId = setInterval(beat, HEARTBEAT_MS);
    window.addEventListener("pagehide", announceLeaving);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("pagehide", announceLeaving);
    };
  }, [code, token, sendHeartbeat]);

  useEffect(() => {
    if (!code || !token) return;
    return () => {
      void leaveRoom({ code, token }).catch(() => {});
    };
  }, [code, token, leaveRoom]);

  // The anchor for a Mini App opened with no code — see rememberCode.
  const roomExists = roomData != null;
  useEffect(() => {
    if (code && roomExists) rememberCode(code);
  }, [code, roomExists]);

  if (session.status === "denied") return <NoticeScreen message={session.message} />;
  if (!token || roomData === undefined) return <LoadingScreen />;
  if (roomData === null) return <NoticeScreen message="That round isn't here." />;

  const { room, options, viewerIsHost, myVoteIds, hangoutCode } = roomData;
  // A round spun up by a hangout belongs to it, so back goes there rather than
  // to the flat list of rounds.
  const backTo = hangoutCode ? `/p/${hangoutCode}` : `/g/${room.code}`;

  // A decided room is closed too, but the spin animation and result reveal take
  // precedence so everyone still gets to watch the decision play out.
  if (room.phase === "deciding") {
    return (
      <DecideView
        key={room.spinStartedAt ?? "decide"}
        room={room}
        options={options}
        viewerIsHost={viewerIsHost}
        backTo={backTo}
      />
    );
  }

  if (room.closedAt) {
    return <ClosedView room={room} options={options} backTo={backTo} />;
  }

  return (
    <CollectView
      room={room}
      options={options}
      viewerIsHost={viewerIsHost}
      presence={presence}
      votedIds={new Set<string>(myVoteIds)}
      name={VIEWER_NAME}
      token={token}
      backTo={backTo}
    />
  );
}
