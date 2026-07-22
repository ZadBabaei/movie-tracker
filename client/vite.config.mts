import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const clientEnvAliases = {
  VITE_API_BASE_URL: "REACT_APP_API_BASE_URL",
  VITE_SOCKET_URL: "REACT_APP_SOCKET_URL",
  VITE_GOOGLE_CLIENT_ID: "REACT_APP_GOOGLE_CLIENT_ID",
  VITE_ENABLE_BUG_REPORTS: "REACT_APP_ENABLE_BUG_REPORTS",
  VITE_TMDB_API_KEY: "REACT_APP_TMDB_API_KEY",
} as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(process.env.PORT) || 3000;
  const apiProxyTarget = process.env.VITE_DEV_API_PROXY || "http://127.0.0.1:5000";
  const define = Object.fromEntries(
    Object.entries(clientEnvAliases).map(([viteKey, craKey]) => [
      `import.meta.env.${viteKey}`,
      JSON.stringify(env[viteKey] || env[craKey] || ""),
    ])
  );

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
