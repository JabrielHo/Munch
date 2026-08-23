import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import { markAppReady } from "./lib/telegram";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    "Missing VITE_CONVEX_URL.\n" +
      "• Locally: run `npx convex dev` (it writes .env.local).\n" +
      "• On Cloudflare Pages: set the build command to " +
      "`npx convex deploy --cmd 'npm run build'`, or add VITE_CONVEX_URL " +
      "to the Pages environment variables.",
  );
}

const convex = new ConvexReactClient(convexUrl);

// Dismiss Telegram's loader and adopt its light/dark choice before the first
// paint, so the app never flashes the wrong theme at the user.
markAppReady();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConvexProvider>
  </StrictMode>,
);
