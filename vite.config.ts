import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "node:fs";

// GitHub Pages has no SPA rewrite rules, so a hard refresh on a deep link like
// /r/ABC123 would 404. Serving a copy of index.html as 404.html boots the app
// anyway, and React Router then renders the right screen from the URL.
function githubPagesSpaFallback(): Plugin {
  return {
    name: "github-pages-spa-fallback",
    closeBundle() {
      try {
        copyFileSync("dist/index.html", "dist/404.html");
      } catch {
        /* index.html wasn't emitted (non-build command) — nothing to copy */
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (mode === "production" && !env.VITE_CONVEX_URL) {
    throw new Error(
      "VITE_CONVEX_URL is not set for the production build.\n" +
        "Build with `npx convex deploy --cmd 'npm run build'` so Convex injects " +
        "it, or set VITE_CONVEX_URL in the build environment.",
    );
  }

  return {
    plugins: [react(), githubPagesSpaFallback()],
    server: { port: 5173 },
  };
});
