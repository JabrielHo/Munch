import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Fail the production build loudly if the Convex URL isn't wired up, instead
  // of shipping a bundle that crashes to a blank screen for every visitor.
  const env = loadEnv(mode, process.cwd(), "");
  if (mode === "production" && !env.VITE_CONVEX_URL) {
    throw new Error(
      "VITE_CONVEX_URL is not set for the production build.\n" +
        "Build with `npx convex deploy --cmd 'npm run build'` so Convex injects " +
        "it, or set VITE_CONVEX_URL in the build environment.",
    );
  }

  return {
    plugins: [react()],
    server: { port: 5173 },
  };
});
