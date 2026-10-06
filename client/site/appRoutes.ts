import { readFileSync } from "node:fs";
import path from "node:path";

// The single list of URLs served by the React app lives in vercel.json as
// rewrites to /app (Vercel's clean URL for app.html). The dev and preview
// servers read the same list, and a test checks it against src/App.tsx.

export const APP_SHELL = "/app.html";
export const APP_SHELL_ROUTE = "/app";

interface VercelConfig {
  rewrites?: { source: string; destination: string }[];
}

// Paths resolve from the client directory, the working directory for Vite and
// Vitest (vite.config.mts reads its env files the same way).
export const clientPath = (...segments: string[]) => path.resolve(process.cwd(), ...segments);

const vercelConfigPath = clientPath("vercel.json");

export const readAppRouteSources = (configPath = vercelConfigPath): string[] => {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as VercelConfig;
  return (config.rewrites ?? [])
    .filter((rewrite) => rewrite.destination === APP_SHELL_ROUTE)
    .map((rewrite) => rewrite.source);
};

// Supports the two Vercel path forms used in vercel.json: literal segments and
// a trailing "/:name*" wildcard that also matches the bare prefix.
export const vercelSourceToRegExp = (source: string) => {
  const pattern = source
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (/^:\w+\*$/.test(segment)) return "(?:/.*)?";
      if (/^:\w+$/.test(segment)) return "/[^/]+";
      return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
    })
    .join("");
  return new RegExp(`^${pattern || "/"}$`);
};

export const createAppRouteMatcher = (sources = readAppRouteSources()) => {
  const patterns = sources.map(vercelSourceToRegExp);
  return (pathname: string) => patterns.some((pattern) => pattern.test(pathname));
};
