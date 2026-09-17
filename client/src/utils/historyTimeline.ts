import type { HistoryEntry } from "../store/useWatchHistoryStore";
import { formatEpisodeCode, getEntryPosterPath, getEntryTitle, isTvEntry } from "./historyEntry";

/**
 * Timeline model over raw watch history.
 *
 * Storage stays one document per watched episode. This module only decides how
 * those records are *presented*: every movie watch is its own item, and TV
 * episodes of one series watched on one calendar day fold into a single
 * "session" item that still carries every underlying record.
 */

// ---------------------------------------------------------------------------
// Calendar day
// ---------------------------------------------------------------------------

/**
 * The timeline calendar day is the UTC date of `watchedAt`.
 *
 * Mark-watched forms collect a date-only value; JavaScript stores it as UTC
 * midnight and the history UI already formats dates with `timeZone: "UTC"`.
 * Using the UTC date therefore preserves exactly the date the user entered
 * instead of shifting it by the browser's zone. Returns "" for invalid input.
 */
export const historyCalendarDay = (watchedAt: string | Date | undefined | null): string => {
  if (!watchedAt) return "";
  const date = new Date(watchedAt);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MovieTimelineItem {
  kind: "movie";
  /** Stable id for React keys / selection: the entry id. */
  id: string;
  entry: HistoryEntry;
  calendarDay: string;
  sortAt: number;
}

export interface TvSessionTimelineItem {
  kind: "tv_session";
  /** `tv:<seriesTmdbId>:<calendarDay>` — recomputed from raw state every time. */
  id: string;
  seriesTmdbId: number;
  seriesTitle: string;
  calendarDay: string;
  /** Every underlying watch record, in raw (newest-first) order. Never deduplicated. */
  entries: HistoryEntry[];
  posterPath: string;
  backdropPath: string;
  episodeSummary: string;
  /** Number of watch events, i.e. `entries.length` — rewatches count. */
  watchCount: number;
  /** Max `watchedAt` among entries. */
  sortAt: number;
}

export type TimelineItem = MovieTimelineItem | TvSessionTimelineItem;

export const tvSessionKey = (seriesTmdbId: number, calendarDay: string) => `tv:${seriesTmdbId}:${calendarDay}`;

export const entrySessionKey = (entry: HistoryEntry): string | null =>
  isTvEntry(entry) ? tvSessionKey(entry.tv.seriesTmdbId, historyCalendarDay(entry.watchedAt)) : null;

// ---------------------------------------------------------------------------
// Episode summary
// ---------------------------------------------------------------------------

const pad = (value: number) => String(value).padStart(2, "0");

const seasonLabel = (seasonNumber: number) => (seasonNumber === 0 ? "Specials" : `S${pad(seasonNumber)}`);

/**
 * Compact, deterministic summary of the episodes in a session.
 *
 *   contiguous            → "S01 · E01–E04"
 *   non-contiguous        → "S01 · E01, E03, E05"
 *   cross-season          → "S01 · E08 · S02 · E01–E02"
 *   same-day rewatch      → "S01 · E01 ×2, E02"   (a range is never used once
 *                            any episode repeats, so the repeat stays visible)
 *   specials              → "Specials · E01–E02"
 *
 * Episodes are listed by season/episode number for compactness; the entries
 * array remains the source of truth for watch order.
 */
export const describeTvSessionEpisodes = (entries: Array<Pick<HistoryEntry, "tv">>): string => {
  const counts = new Map<number, Map<number, number>>();
  entries.forEach((entry) => {
    if (!entry.tv) return;
    const season = counts.get(entry.tv.seasonNumber) ?? new Map<number, number>();
    season.set(entry.tv.episodeNumber, (season.get(entry.tv.episodeNumber) ?? 0) + 1);
    counts.set(entry.tv.seasonNumber, season);
  });
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([seasonNumber, episodes]) => {
      const sorted = [...episodes.entries()].sort(([a], [b]) => a - b);
      const numbers = sorted.map(([episodeNumber]) => episodeNumber);
      const hasRepeat = sorted.some(([, count]) => count > 1);
      const contiguous = numbers.every((value, index) => index === 0 || value === numbers[index - 1] + 1);
      let text: string;
      if (numbers.length === 1) {
        const [episodeNumber, count] = sorted[0];
        text = `E${pad(episodeNumber)}${count > 1 ? ` ×${count}` : ""}`;
      } else if (contiguous && !hasRepeat) {
        text = `E${pad(numbers[0])}–E${pad(numbers[numbers.length - 1])}`;
      } else {
        text = sorted.map(([episodeNumber, count]) => `E${pad(episodeNumber)}${count > 1 ? ` ×${count}` : ""}`).join(", ");
      }
      return `${seasonLabel(seasonNumber)} · ${text}`;
    })
    .join(" · ");
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const toTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

/**
 * Folds raw entries into timeline items. Movies never group — a rewatch of the
 * same film on the same day is still two items. Episodes group by
 * `seriesTmdbId + calendar day` only; season, episode, participants and
 * location play no part in the key.
 *
 * Ordering: newest first by `sortAt` (max watchedAt of the item); ties keep the
 * order in which the item first appeared in the input, which for API pages is
 * the server's `(watchedAt desc, _id desc)`.
 */
export const buildTimeline = (entries: HistoryEntry[]): TimelineItem[] => {
  const items: Array<{ item: TimelineItem; firstIndex: number }> = [];
  const sessions = new Map<string, TvSessionTimelineItem>();

  entries.forEach((entry, index) => {
    const calendarDay = historyCalendarDay(entry.watchedAt);
    const time = toTime(entry.watchedAt);
    if (!isTvEntry(entry)) {
      items.push({ item: { kind: "movie", id: entry._id, entry, calendarDay, sortAt: time }, firstIndex: index });
      return;
    }
    const key = tvSessionKey(entry.tv.seriesTmdbId, calendarDay);
    const existing = sessions.get(key);
    if (existing) {
      existing.entries.push(entry);
      existing.watchCount = existing.entries.length;
      existing.sortAt = Math.max(existing.sortAt, time);
      if (!existing.posterPath) existing.posterPath = entry.tv.posterPath || "";
      if (!existing.backdropPath) existing.backdropPath = entry.tv.backdropPath || entry.tv.stillPath || "";
      return;
    }
    const session: TvSessionTimelineItem = {
      kind: "tv_session",
      id: key,
      seriesTmdbId: entry.tv.seriesTmdbId,
      seriesTitle: entry.tv.seriesTitle || "Untitled series",
      calendarDay,
      entries: [entry],
      posterPath: entry.tv.posterPath || "",
      backdropPath: entry.tv.backdropPath || entry.tv.stillPath || "",
      episodeSummary: "",
      watchCount: 1,
      sortAt: time,
    };
    sessions.set(key, session);
    items.push({ item: session, firstIndex: index });
  });

  sessions.forEach((session) => {
    session.episodeSummary = describeTvSessionEpisodes(session.entries);
  });

  return items
    .sort((a, b) => b.item.sortAt - a.item.sortAt || a.firstIndex - b.firstIndex)
    .map(({ item }) => item);
};

// ---------------------------------------------------------------------------
// Presentation helpers used by search / filter / sort
// ---------------------------------------------------------------------------

export const timelineItemTitle = (item: TimelineItem): string =>
  item.kind === "movie" ? getEntryTitle(item.entry) : item.seriesTitle;

export const timelineItemPosterPath = (item: TimelineItem): string =>
  item.kind === "movie" ? getEntryPosterPath(item.entry) : item.posterPath;

export const timelineItemEntries = (item: TimelineItem): HistoryEntry[] =>
  item.kind === "movie" ? [item.entry] : item.entries;

/** Lower-cased text a search query is matched against. A session matches if any episode does. */
export const timelineSearchText = (item: TimelineItem): string => {
  if (item.kind === "movie") return getEntryTitle(item.entry).toLowerCase();
  const parts = [item.seriesTitle];
  item.entries.forEach((entry) => {
    if (!entry.tv) return;
    parts.push(formatEpisodeCode(entry.tv));
    if (entry.tv.episodeTitle) parts.push(entry.tv.episodeTitle);
  });
  return parts.join(" ").toLowerCase();
};

export const timelineItemMatchesSearch = (item: TimelineItem, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  return !needle || timelineSearchText(item).includes(needle);
};

export const timelineItemYear = (item: TimelineItem): number | null => {
  const day = item.kind === "movie" ? item.calendarDay : item.calendarDay;
  return day ? Number(day.slice(0, 4)) : null;
};

const entryEffectiveRating = (entry: HistoryEntry): number | null =>
  entry.averageRating ?? entry.currentUserRating ?? null;

/** True when at least one underlying entry carries a current-user or aggregate rating. */
export const timelineItemIsRated = (item: TimelineItem): boolean =>
  timelineItemEntries(item).some((entry) => entryEffectiveRating(entry) != null);

/**
 * Sort-only rating value. Movies use their effective rating. A TV session
 * uses the mean of the effective ratings of its rated entries (unrated
 * entries ignored); a fully unrated session is `null`. This number is never
 * displayed as a session rating.
 */
export const timelineItemRatingSortValue = (item: TimelineItem): number | null => {
  const ratings = timelineItemEntries(item)
    .map(entryEffectiveRating)
    .filter((value): value is number => value != null);
  if (!ratings.length) return null;
  return ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
};

export type TimelineSortMode = "recent" | "rating" | "title";

export const sortTimelineItems = (items: TimelineItem[], mode: TimelineSortMode): TimelineItem[] => {
  const copy = [...items];
  if (mode === "title") return copy.sort((a, b) => timelineItemTitle(a).localeCompare(timelineItemTitle(b)));
  if (mode === "rating") {
    return copy.sort((a, b) => (timelineItemRatingSortValue(b) ?? -1) - (timelineItemRatingSortValue(a) ?? -1) || b.sortAt - a.sortAt);
  }
  return copy.sort((a, b) => b.sortAt - a.sortAt);
};
