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

export default apiClient;
