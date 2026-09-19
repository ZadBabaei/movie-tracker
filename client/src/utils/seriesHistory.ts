import type { HistoryScope } from "../api/historyApi";
import type { HistoryEntry } from "../store/useWatchHistoryStore";
import { isTvEntry } from "./historyEntry";

/**
 * Presentation helpers for the TV series page. Every input row is one
 * WatchHistoryEntry occurrence and stays one; nothing here merges records.
 */

/** Route param → positive integer, or null for anything malformed. */
export const parseSeriesTmdbId = (raw: string | undefined): number | null => {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

export interface SeriesScope {
  scope: HistoryScope;
  groupId: string | null;
  /** Set when the query asked for a group but did not name a usable one. */
  invalid: boolean;
}

/** `?scope=group&groupId=…` → group scope; anything else → personal. */
export const parseSeriesScope = (params: URLSearchParams): SeriesScope => {
  const scope = params.get("scope");
  if (scope === "group") {
    const groupId = (params.get("groupId") || "").trim();
    return { scope: "group", groupId: groupId || null, invalid: !/^[a-f0-9]{24}$/i.test(groupId) };
  }
  return { scope: "personal", groupId: null, invalid: false };
};

export const seriesHistoryPath = (seriesTmdbId: number, scope: HistoryScope, groupId?: string | null) =>
  scope === "group" && groupId
    ? `/history/tv/${seriesTmdbId}?scope=group&groupId=${encodeURIComponent(groupId)}`
    : `/history/tv/${seriesTmdbId}?scope=personal`;

const toTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

/** Newest first, then `_id` descending — the same order the endpoint uses. */
export const sortOccurrences = (entries: HistoryEntry[]): HistoryEntry[] =>
  [...entries].sort((a, b) => toTime(b.watchedAt) - toTime(a.watchedAt) || (b._id > a._id ? 1 : b._id < a._id ? -1 : 0));

export interface SeriesHistorySummary {
  /** Number of WatchHistoryEntry records — rewatches count separately. */
  watchCount: number;
  uniqueEpisodes: number;
  seasonsWatched: number;
  firstWatchedAt: string | null;
  latestWatchedAt: string | null;
  /** Series title / artwork from the stored snapshots, for when TMDB is unavailable. */
  seriesTitle: string;
  posterPath: string;
  backdropPath: string;
}

/** Movie Tracker's own numbers for a series, computed from the records themselves. */
export const summarizeSeriesHistory = (entries: HistoryEntry[]): SeriesHistorySummary => {
  const tv = entries.filter(isTvEntry);
  const sorted = sortOccurrences(tv);
  const episodes = new Set(tv.map((entry) => `${entry.tv.seasonNumber}:${entry.tv.episodeNumber}`));
  const seasons = new Set(tv.map((entry) => entry.tv.seasonNumber));
  const withTitle = tv.find((entry) => entry.tv.seriesTitle);
  return {
    watchCount: tv.length,
    uniqueEpisodes: episodes.size,
    seasonsWatched: seasons.size,
    firstWatchedAt: sorted.length ? sorted[sorted.length - 1].watchedAt : null,
    latestWatchedAt: sorted.length ? sorted[0].watchedAt : null,
    seriesTitle: withTitle?.tv.seriesTitle || "",
    posterPath: tv.find((entry) => entry.tv.posterPath)?.tv.posterPath || "",
    backdropPath: tv.find((entry) => entry.tv.backdropPath)?.tv.backdropPath || tv.find((entry) => entry.tv.stillPath)?.tv.stillPath || "",
  };
};

export interface OccurrenceMonth {
  key: string;
  month: string;
  year: string;
  /** One element per WatchHistoryEntry, newest first. */
  entries: HistoryEntry[];
}

/** Visual grouping by watched month (UTC). Children are still the exact records. */
export const groupOccurrencesByMonth = (entries: HistoryEntry[]): OccurrenceMonth[] => {
  const months = new Map<string, OccurrenceMonth>();
  sortOccurrences(entries).forEach((entry) => {
    const date = new Date(entry.watchedAt);
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` : "unknown";
    const existing = months.get(key) || {
      key,
      month: valid ? date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }) : "Unknown date",
      year: valid ? String(date.getUTCFullYear()) : "",
      entries: [],
    };
    existing.entries.push(entry);
    months.set(key, existing);
  });
  return [...months.values()];
};
