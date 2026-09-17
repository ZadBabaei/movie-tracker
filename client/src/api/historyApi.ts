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

// ---------------------------------------------------------------------------
// TV episodes. Each watched episode is its own history record; the server
// rejects any TV payload that carries a movieId, and nothing here ever adds
// one. Optional metadata is omitted rather than sent as placeholders.
// ---------------------------------------------------------------------------

export interface TvEpisodeWatchIdentity {
  seriesTmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeTmdbId?: number | null;
  seriesTitle: string;
  episodeTitle?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  stillPath?: string | null;
  airDate?: string | null;
}

export interface TvWatchDetails {
  /** "personal" or a group id. */
  scopeId: string;
  watchedAt?: string;
  watchedLocation?: string;
  participants?: string[];
  watchedNotes?: string;
}

export interface TvEpisodeHistoryPayload {
  mediaType: "tv_episode";
  tv: {
    seriesTmdbId: number;
    seasonNumber: number;
    episodeNumber: number;
    episodeTmdbId?: number;
    seriesTitle: string;
    episodeTitle?: string;
    posterPath?: string;
    backdropPath?: string;
    stillPath?: string;
    airDate?: string;
  };
  scope: "personal" | "group";
  groupId?: string;
  watchedAt?: string;
  watchedLocation?: string;
  participants?: string[];
  watchedNotes?: string;
}

const definedOnly = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")) as T;

export const buildTvEpisodeHistoryPayload = (
  episode: TvEpisodeWatchIdentity,
  details: TvWatchDetails
): TvEpisodeHistoryPayload => {
  const isGroup = Boolean(details.scopeId) && details.scopeId !== "personal";
  return definedOnly({
    mediaType: "tv_episode" as const,
    tv: definedOnly({
      seriesTmdbId: episode.seriesTmdbId,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      episodeTmdbId: episode.episodeTmdbId ?? undefined,
      seriesTitle: episode.seriesTitle,
      episodeTitle: episode.episodeTitle ?? undefined,
      posterPath: episode.posterPath ?? undefined,
      backdropPath: episode.backdropPath ?? undefined,
      stillPath: episode.stillPath ?? undefined,
      airDate: episode.airDate ?? undefined,
    }),
    scope: isGroup ? ("group" as const) : ("personal" as const),
    groupId: isGroup ? details.scopeId : undefined,
    watchedAt: details.watchedAt,
    watchedLocation: details.watchedLocation,
    participants: isGroup && details.participants?.length ? details.participants : undefined,
    watchedNotes: details.watchedNotes,
  });
};

export const createTvEpisodeHistoryEntry = async (payload: TvEpisodeHistoryPayload) => {
  const response = await apiClient.post("/api/history", payload, auth());
  return response.data.entry;
};

export interface TvEpisodeSubmitResult<E extends TvEpisodeWatchIdentity> {
  succeeded: Array<{ episode: E; entry: any }>;
  failed: Array<{ episode: E; message: string }>;
}

const errorMessage = (error: unknown) =>
  (error as any)?.response?.data?.msg || (error as Error)?.message || "Request failed.";

/**
 * Saves every episode as an independent request and reports exactly which
 * ones landed, so a caller can retry only the failures.
 */
export const createTvEpisodeHistoryEntries = async <E extends TvEpisodeWatchIdentity>(
  episodes: E[],
  details: TvWatchDetails
): Promise<TvEpisodeSubmitResult<E>> => {
  const settled = await Promise.allSettled(
    episodes.map((episode) => createTvEpisodeHistoryEntry(buildTvEpisodeHistoryPayload(episode, details)))
  );
  const result: TvEpisodeSubmitResult<E> = { succeeded: [], failed: [] };
  settled.forEach((outcome, index) => {
    const episode = episodes[index];
    if (outcome.status === "fulfilled") result.succeeded.push({ episode, entry: outcome.value });
    else result.failed.push({ episode, message: errorMessage(outcome.reason) });
  });
  return result;
};
