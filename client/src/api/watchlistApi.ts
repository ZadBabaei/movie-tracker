import apiClient from "./apiClient";

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return { headers: { Authorization: `Bearer ${token}` } };
};

export const fetchWatchlist = async () => {
  const res = await apiClient.get("/api/watchlist", getAuthHeaders());
  return res.data;
};

export const addToWatchlist = async (movie: {
  imdbID: string;
  title: string;
  poster_path?: string;
  vote_average?: number;
}) => {
  const res = await apiClient.post("/api/watchlist", { movie }, getAuthHeaders());
  return res.data;
};

export const removeFromWatchlist = async (movieId: string) => {
  const res = await apiClient.delete(`/api/watchlist/${movieId}`, getAuthHeaders());
  return res.data;
};

export const markAsWatched = async (
  movieId: string,
  groupId: string,
  metadata?: {
    watchedDate?: string;
    watchedWhere?: string;
    watchedWith?: string[];
  }
) => {
  const payload = {
    groupId,
    ...metadata,
    watchedAt: metadata?.watchedDate,
    watchedLocation: metadata?.watchedWhere,
  };
  const res = await apiClient.post(
    `/api/watchlist/${movieId}/mark-watched`,
    payload,
    getAuthHeaders()
  );
  return res.data;
};
