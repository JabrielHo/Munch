import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import Room from "./pages/Room";
import History from "./pages/History";
import TgEntry from "./pages/TgEntry";

export default function App() {
  return (
    <main>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/r/:code" element={<Room />} />
        <Route path="/h/:code" element={<History />} />
        <Route path="/tg" element={<TgEntry />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}
