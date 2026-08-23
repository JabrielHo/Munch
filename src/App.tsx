import { Navigate, Route, Routes, useParams } from "react-router-dom";
import Landing from "./pages/Landing";
import Room from "./pages/Room";
import GroupPlans from "./pages/GroupPlans";
import Hangout from "./pages/Hangout";
import TgEntry from "./pages/TgEntry";

/** Rounds used to live under /h/<code>; links to it are already sitting in old
 *  chat messages, so the route survives as a redirect. */
function LegacyHistoryRedirect() {
  const { code = "" } = useParams();
  return <Navigate to={`/g/${code}`} replace />;
}

export default function App() {
  return (
    <main className="min-h-dvh">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/p/:code" element={<Hangout />} />
        <Route path="/r/:code" element={<Room />} />
        <Route path="/g/:code" element={<GroupPlans />} />
        <Route path="/h/:code" element={<LegacyHistoryRedirect />} />
        <Route path="/tg" element={<TgEntry />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}
