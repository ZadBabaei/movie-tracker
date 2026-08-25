import axios from "axios";

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

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
};

const apiClient = axios.create({
  baseURL: API_BASE_URL || undefined,
});

const AUTH_PAGES = ["/", "/signup"];

// The server now rejects sessions it has invalidated (password reset, deleted
// account, rotated token format). Clear the stale credentials and send the
// person back to sign in rather than leaving the UI in a broken state.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 && localStorage.getItem("token")) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("userId");
      if (!AUTH_PAGES.includes(window.location.pathname)) {
        window.location.assign("/");
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
