import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const clientEnvAliases = {
  VITE_API_BASE_URL: "REACT_APP_API_BASE_URL",
  VITE_SOCKET_URL: "REACT_APP_SOCKET_URL",
  VITE_GOOGLE_CLIENT_ID: "REACT_APP_GOOGLE_CLIENT_ID",
  VITE_ENABLE_BUG_REPORTS: "REACT_APP_ENABLE_BUG_REPORTS",
  VITE_TMDB_API_KEY: "REACT_APP_TMDB_API_KEY",
  VITE_POSTHOG_KEY: "REACT_APP_POSTHOG_KEY",
  VITE_POSTHOG_HOST: "REACT_APP_POSTHOG_HOST",
} as const;

// `vite --mode localapi` is the one way to run the client against a local
// backend: any VITE_API_BASE_URL from .env files (usually the production API)
// is ignored, so /api and /socket.io always go through the dev proxy below.
// Pick the backend port with VITE_DEV_API_PROXY (default 127.0.0.1:5000).
const LOCAL_API_MODE = "localapi";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(process.env.PORT) || 3000;
  const apiProxyTarget = process.env.VITE_DEV_API_PROXY || "http://127.0.0.1:5000";
  const localApi = mode === LOCAL_API_MODE;
  const define = Object.fromEntries(
    Object.entries(clientEnvAliases).map(([viteKey, craKey]) => {
      const value = env[viteKey] || env[craKey] || "";
      const forcedLocal = localApi && (viteKey === "VITE_API_BASE_URL" || viteKey === "VITE_SOCKET_URL");
      return [`import.meta.env.${viteKey}`, JSON.stringify(forcedLocal ? "" : value)];
    })
  );

  if (command === "serve") {
    const apiBase = localApi ? "" : env.VITE_API_BASE_URL || env.REACT_APP_API_BASE_URL || "";
    // Make the backend the dev server will talk to impossible to miss.
    console.info(
      apiBase
        ? `[movie-tracker] API calls go directly to ${apiBase} (set by VITE_API_BASE_URL; use "vite --mode ${LOCAL_API_MODE}" for a local backend)`
        : `[movie-tracker] API calls are proxied to ${apiProxyTarget} (VITE_DEV_API_PROXY)`
    );
  }

  return {
    plugins: [react()],
    define,
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        "/socket.io": {
          target: apiProxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      host: "127.0.0.1",
      port,
      strictPort: true,
    },
    build: {
      outDir: "dist",
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/setupTests.js",
      css: true,
    },
  };
});
