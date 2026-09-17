import type { HistoryEntry, HistoryTvEpisode } from "../store/useWatchHistoryStore";

const TMDB_IMAGE = "https://image.tmdb.org/t/p";

const pad = (value: number) => String(value).padStart(2, "0");

/** "S01E03" — zero-padded season/episode code used across history surfaces. */
export const formatEpisodeCode = (tv: Pick<HistoryTvEpisode, "seasonNumber" | "episodeNumber">) =>
  `S${pad(tv.seasonNumber)}E${pad(tv.episodeNumber)}`;

export const isTvEntry = (entry: HistoryEntry): entry is HistoryEntry & { mediaType: "tv_episode"; tv: HistoryTvEpisode } =>
  entry.mediaType === "tv_episode" && !!entry.tv;

/** Primary title: movie title, or the series title for an episode. */
export const getEntryTitle = (entry: HistoryEntry): string => {
  if (isTvEntry(entry)) return entry.tv.seriesTitle || "Untitled series";
  return entry.movie?.title || "Untitled movie";
};

/** Secondary line for episodes ("S01E03 · Pilot"); empty for movies. */
export const getEntrySubtitle = (entry: HistoryEntry): string => {
  if (!isTvEntry(entry)) return "";
  const code = formatEpisodeCode(entry.tv);
  return entry.tv.episodeTitle ? `${code} · ${entry.tv.episodeTitle}` : code;
};

/** Poster-style artwork path (movie poster or series poster). */
export const getEntryPosterPath = (entry: HistoryEntry): string => {
  if (isTvEntry(entry)) return entry.tv.posterPath || entry.tv.stillPath || "";
  return entry.movie?.poster || "";
};

/** Wide artwork for hero use (series backdrop / episode still), poster as fallback. */
export const getEntryBackdropPath = (entry: HistoryEntry): string => {
  if (isTvEntry(entry)) return entry.tv.backdropPath || entry.tv.stillPath || entry.tv.posterPath || "";
  return entry.movie?.poster || "";
};

export const historyImageUrl = (path: string | undefined, size = "w500") => {
  if (!path) return "";
  return path.startsWith("http") ? path : `${TMDB_IMAGE}/${size}${path.startsWith("/") ? path : `/${path}`}`;
};

/** Text searched by the client-side history filter. */
export const getEntrySearchText = (entry: HistoryEntry): string =>
  [getEntryTitle(entry), isTvEntry(entry) ? entry.tv.episodeTitle : "", isTvEntry(entry) ? formatEpisodeCode(entry.tv) : ""]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
