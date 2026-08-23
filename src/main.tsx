import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { markAppReady } from "./lib/telegram";
import "./index.css";

/**
 * Anything that throws in here happens before React exists, so it cannot be
 * caught by a boundary and leaves a blank page. In a Telegram webview there is
 * no console to check either, so the two things that can go wrong at startup —
 * a missing backend URL, and a failure inside markAppReady — are reported on
 * screen instead of thrown.
 */
const root = createRoot(document.getElementById("root")!);

function fatal(message: string) {
  root.render(
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "1.5rem",
        textAlign: "center",
        font: "16px/1.5 system-ui, sans-serif",
        background: "#fff7ec",
        color: "#2b1b14",
      }}>
      <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>Munch 🎉</div>
      <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{message}</p>
    </div>,
  );
}

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  fatal(
    "Munch can't reach its backend — the build went out without VITE_CONVEX_URL.\n\n" +
      "Locally: run `npx convex dev` (it writes .env.local).\n" +
      "On Cloudflare Pages: set the build command to " +
      "`npx convex deploy --cmd 'npm run build'`.",
  );
} else {
  // Dismisses Telegram's loader and adopts its light/dark choice before the
  // first paint. Wrapped because a failure inside the bridge is not a reason to
  // show nothing at all — the app works fine without it in a browser.
  try {
    markAppReady();
  } catch (err) {
    console.error("Telegram bridge failed", err);
  }

  const convex = new ConvexReactClient(convexUrl);

  root.render(
    <StrictMode>
      <ErrorBoundary>
        <ConvexProvider client={convex}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ConvexProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
