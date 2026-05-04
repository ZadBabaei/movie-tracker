import axios from "axios";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const API_BASE_URL = trimTrailingSlash(
  process.env.REACT_APP_API_BASE_URL || ""
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
