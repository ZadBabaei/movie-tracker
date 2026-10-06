const LOCAL_APP_URL = "http://localhost:3000";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

// Staging also runs with NODE_ENV=production; Railway always sets its
// environment variables, so either signal means users can receive our links.
export const isDeployedEnvironment = () =>
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT);

const isLoopbackHost = (hostname: string) =>
  LOOPBACK_HOSTS.has(hostname.toLowerCase()) || hostname.toLowerCase().endsWith(".localhost");

/**
 * Public frontend origin used in emailed links. Local development falls back
 * to the Vite dev URL; deployed environments must configure a public https
 * APP_URL so users are never emailed a localhost link.
 */
export const getAppUrl = (): string => {
  const raw = String(process.env.APP_URL || "").trim();
  const deployed = isDeployedEnvironment();

  if (!raw) {
    if (deployed) throw new ConfigurationError("APP_URL must be set to the public frontend URL.");
    return LOCAL_APP_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigurationError("APP_URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ConfigurationError("APP_URL must use http or https.");
  }
  if (deployed && (parsed.protocol !== "https:" || isLoopbackHost(parsed.hostname))) {
    throw new ConfigurationError("APP_URL must be a public https URL in deployed environments.");
  }

  return raw.replace(/\/+$/, "");
};

export const buildPasswordResetLink = (rawToken: string) =>
  `${getAppUrl()}/reset-password/${encodeURIComponent(rawToken)}`;
