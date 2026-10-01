import axios from "axios";
import {
  acceptAuthenticatedSession,
  endAuthenticatedSession,
  getSessionIdentity,
  getSessionGeneration,
  isSessionIdentityCurrent,
  isSessionGenerationCurrent,
} from "../auth/sessionScope";

declare module "axios" {
  interface AxiosRequestConfig {
    skipAuthRedirect?: boolean;
    sessionGeneration?: number;
    sessionIdentity?: string | null;
  }
}

export class StaleSessionResponseError extends Error {
  constructor() {
    super("Response belongs to an expired authenticated session");
    this.name = "StaleSessionResponseError";
  }
}

export const isStaleSessionResponseError = (error: unknown) =>
  error instanceof StaleSessionResponseError;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const hasProtocol = (value: string) => /^https?:\/\//i.test(value);
const isRootRelative = (value: string) => value.startsWith("/");
const isLocalHost = (value: string) => /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value);

const normalizeApiBaseUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const withoutTrailingSlash = trimTrailingSlash(trimmed);
  if (hasProtocol(withoutTrailingSlash) || isRootRelative(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }

  return `${isLocalHost(withoutTrailingSlash) ? "http" : "https"}://${withoutTrailingSlash}`;
};

export const API_BASE_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL || ""
);

export const LOCAL_API_BASE_URL = "http://127.0.0.1:5000";

// Dev-only: say out loud which backend this bundle talks to, so a dev server
// silently pointed at the production API is caught in the console.
if (import.meta.env.DEV) {
  console.info(`[movie-tracker] API base: ${API_BASE_URL || `${window.location.origin} (relative, via the Vite proxy)`}`);
}

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
};

const apiClient = axios.create({
  baseURL: API_BASE_URL || undefined,
});

apiClient.interceptors.request.use((config) => {
  config.sessionGeneration = getSessionGeneration();
  config.sessionIdentity = getSessionIdentity(localStorage.getItem("token"));
  return config;
});

const AUTH_PAGES = ["/", "/signup"];

export const shouldClearAppSession = (
  status: number | undefined,
  responseCode: unknown,
  skipProviderAuthRedirect: boolean | undefined
) => status === 401 && !(
  skipProviderAuthRedirect
  && (responseCode === "invalid_credentials" || responseCode === "stremio_reauth_required")
);

// The server now rejects sessions it has invalidated (password reset, deleted
// account, rotated token format). Clear the stale credentials and send the
// person back to sign in rather than leaving the UI in a broken state.
// The server slides the session forward by handing back a renewed token, so a
// device in regular use never gets signed out. Swap it in when it arrives.
const storeRefreshedToken = (headers: unknown) => {
  const refreshed = (headers as Record<string, string> | undefined)?.["x-refreshed-token"];
  if (refreshed && localStorage.getItem("token")) {
    acceptAuthenticatedSession(refreshed);
  }
};

apiClient.interceptors.response.use(
  (response) => {
    if (
      !isSessionIdentityCurrent(response.config.sessionIdentity ?? null)
      || !isSessionGenerationCurrent(response.config.sessionGeneration ?? -1)
    ) {
      return Promise.reject(new StaleSessionResponseError());
    }
    storeRefreshedToken(response.headers);
    return response;
  },
  (error) => {
    if (
      !isSessionIdentityCurrent(error?.config?.sessionIdentity ?? null)
      || !isSessionGenerationCurrent(error?.config?.sessionGeneration ?? -1)
    ) {
      return Promise.reject(new StaleSessionResponseError());
    }
    const status = error?.response?.status;
    const responseCode = error?.response?.data?.code;
    if (
      shouldClearAppSession(status, responseCode, error?.config?.skipAuthRedirect)
      && localStorage.getItem("token")
    ) {
      endAuthenticatedSession();
      if (!AUTH_PAGES.includes(window.location.pathname)) {
        window.location.assign("/");
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
