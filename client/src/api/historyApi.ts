import apiClient from "./apiClient";

const auth = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
});

export interface HistoryQuery {
  search?: string;
  year?: number;
  rated?: boolean;
  sort?: "recent" | "rating" | "title";
  cursor?: string;
  limit?: number;
}

export const fetchPersonalHistory = async (query: HistoryQuery = {}) => {
  const response = await apiClient.get("/api/history/personal", { ...auth(), params: query });
  return response.data;
};

export const fetchGroupHistory = async (groupId: string, query: HistoryQuery = {}) => {
  const response = await apiClient.get(`/api/history/group/${groupId}`, { ...auth(), params: query });
  return response.data;
};

export const updateHistoryEntry = async (
  historyEntryId: string,
  payload: { watchedAt: string; watchedLocation: string; watchedNotes: string }
) => {
  const response = await apiClient.patch(`/api/history/${historyEntryId}`, payload, auth());
  return response.data.entry;
};

export const deleteHistoryEntry = async (historyEntryId: string) => {
  const response = await apiClient.delete(`/api/history/${historyEntryId}`, auth());
  return response.data;
};

export const rateHistoryEntry = async (historyEntryId: string, rating: number) => {
  const response = await apiClient.put(`/api/history/${historyEntryId}/rating`, { rating }, auth());
  return response.data.entry;
};
