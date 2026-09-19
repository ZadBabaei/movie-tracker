import { afterEach, describe, expect, test, vi } from "vitest";
import viteConfig from "../vite.config.mjs";

// Guards the local-development contract: `vite --mode localapi` must never
// let a VITE_API_BASE_URL from .env files (typically the production API) leak
// into the bundle, so /api always goes through the dev proxy.

type Resolver = (env: { mode: string; command: "serve" | "build"; isSsrBuild?: boolean; isPreview?: boolean }) => any;
const resolve = viteConfig as unknown as Resolver;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("vite --mode localapi", () => {
  test("blanks the API and socket base URLs even when the environment sets them", () => {
    vi.stubEnv("VITE_API_BASE_URL", "movie-tracker-production.example.railway.app");
    vi.stubEnv("VITE_SOCKET_URL", "https://sockets.example.com");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const config = resolve({ mode: "localapi", command: "serve" });
    expect(config.define["import.meta.env.VITE_API_BASE_URL"]).toBe('""');
    expect(config.define["import.meta.env.VITE_SOCKET_URL"]).toBe('""');
    expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:5000");
  });

  test("honours VITE_DEV_API_PROXY for the proxied backend and announces it", () => {
    vi.stubEnv("VITE_DEV_API_PROXY", "http://127.0.0.1:5002");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const config = resolve({ mode: "localapi", command: "serve" });
    expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:5002");
    expect(config.server.proxy["/socket.io"].target).toBe("http://127.0.0.1:5002");
    expect(info).toHaveBeenCalledWith(expect.stringContaining("proxied to http://127.0.0.1:5002"));
  });

  test("other modes keep the configured API base and say so", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const config = resolve({ mode: "development", command: "serve" });
    expect(config.define["import.meta.env.VITE_API_BASE_URL"]).toBe('"https://api.example.com"');
    expect(info).toHaveBeenCalledWith(expect.stringContaining("directly to https://api.example.com"));
  });
});
