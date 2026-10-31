import { create } from "zustand";
import * as api from "../api/historyApi";
import type { HistoryTypeFilter } from "../api/historyApi";
import { completeTrailingDay } from "../utils/historyPagination";
import {
  getSessionGeneration,
  isSessionGenerationCurrent,
  registerUserScopedReset,
} from "../auth/sessionScope";

export interface HistoryMember {
  _id: string;
  name: string;
  avatar?: string;
}

export interface HistoryMovie {
  _id: string;
  title: string;
  imdbID: string;
  poster?: string;
  vote_average: number;
}

export interface HistoryTvEpisode {
  seriesTmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeTmdbId: number | null;
  seriesTitle: string;
  episodeTitle: string;
  posterPath: string;
  backdropPath: string;
  stillPath: string;
  airDate: string | null;
}

export type HistoryMediaType = "movie" | "tv_episode";

// The server always sends `mediaType`; exactly one of `movie` / `tv` is set.
// Use the helpers in utils/historyEntry.ts rather than reaching into either.
export interface HistoryEntry {
  _id: string;
  mediaType: HistoryMediaType;
  scope: "personal" | "group";
  group: { _id: string; name: string; slug?: string } | null;
  createdBy: HistoryMember;
  movie: HistoryMovie | null;
  tv: HistoryTvEpisode | null;
  participants: HistoryMember[];
  watchedAt: string;
  watchedLocation: string;
  watchedNotes: string;
  averageRating: number | null;
  ratingCount: number;
  currentUserRating: number | null;
  ratings: Array<HistoryMember & { rating: number }>;
  createdAt?: string;
  updatedAt?: string;
}

interface HistoryBucket {
  items: HistoryEntry[];
  total: number;
  nextCursor: string | null;
  monthPagination?: { page: number; totalPages: number; start: string | null; end: string | null };
  /** Store `version` the request for this bucket started at; older means stale. */
  version?: number;
}

/**
 * Key shared by `loading`, `errors` and `typed`. The unfiltered ("all") view
 * keeps the plain scope key (`"personal"` / a group id) and lives in
 * `personal` / `byGroup`; filtered views are cached in `typed` as
 * `<scope>:<type>`, so one filter can never show or overwrite another's page.
 * Everything is cleared with the rest of the store on sign-out.
 */
export const historyBucketKey = (scopeKey: string, type: HistoryTypeFilter = "all") =>
  type === "all" ? scopeKey : `${scopeKey}:${type}`;

interface WatchHistoryState {
  personal: HistoryBucket;
  byGroup: Record<string, HistoryBucket>;
  typed: Record<string, HistoryBucket>;
  /**
   * Bumped by every write that can change which entries a view contains, their
   * order, months or totals (add, edit, delete, Stremio sync, group events).
   * Rating does not bump it: it only changes an entry in place.
   */
  version: number;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  invalidate: () => void;
  isBucketFresh: (key: string, monthPage?: number) => boolean;
  fetchPersonal: (append?: boolean, monthPage?: number, type?: HistoryTypeFilter) => Promise<void>;
  fetchGroup: (groupId: string, append?: boolean, monthPage?: number, type?: HistoryTypeFilter) => Promise<void>;
  replaceEntry: (entry: HistoryEntry) => void;
  updateEntry: (entryId: string, payload: { watchedAt: string; watchedLocation: string; watchedNotes: string }) => Promise<HistoryEntry>;
  deleteEntry: (entryId: string) => Promise<void>;
  rateEntry: (entryId: string, rating: number) => Promise<HistoryEntry>;
}

const emptyBucket = (): HistoryBucket => ({ items: [], total: 0, nextCursor: null });

const mapBuckets = (buckets: Record<string, HistoryBucket>, fn: (bucket: HistoryBucket) => HistoryBucket) =>
  Object.fromEntries(Object.entries(buckets).map(([key, bucket]) => [key, fn(bucket)]));

export const useWatchHistoryStore = create<WatchHistoryState>((set, get) => ({
  personal: emptyBucket(),
  byGroup: {},
  typed: {},
  version: 0,
  loading: {},
  errors: {},

  invalidate: () => set((state) => ({ version: state.version + 1 })),

  isBucketFresh: (key, monthPage) => {
    const state = get();
    const scopeKey = key.split(":")[0];
    const bucket = key.includes(":") ? state.typed[key] : scopeKey === "personal" ? state.personal : state.byGroup[scopeKey];
    if (!bucket || bucket.version !== state.version || state.errors[key]) return false;
    return monthPage === undefined || bucket.monthPagination?.page === monthPage;
  },

  fetchPersonal: async (append = false, monthPage, type = "all") => {
    const key = historyBucketKey("personal", type);
    const previous = (type === "all" ? get().personal : get().typed[key]) || emptyBucket();
    if (append && (!previous.nextCursor || get().loading[key])) return;
    const sessionGeneration = getSessionGeneration();
    // A write landing while this request is in flight leaves the bucket stale.
    const version = get().version;
    const typeParam = type === "all" ? {} : { type };
    set((state) => ({ loading: { ...state.loading, [key]: true }, errors: { ...state.errors, [key]: null } }));
    try {
      const data = await api.fetchPersonalHistory({ limit: 100, ...typeParam, ...(monthPage ? { monthPage } : {}), ...(append ? { cursor: previous.nextCursor! } : {}) });
      // Pull in the rest of the trailing day so a TV session is never split
      // at the page boundary (see utils/historyPagination.ts).
      const page = await completeTrailingDay(
        { items: data.items || [], nextCursor: data.nextCursor || null },
        async (cursor, limit) => {
          const more = await api.fetchPersonalHistory({ cursor, limit, ...typeParam });
          return { items: more.items || [], nextCursor: more.nextCursor || null };
        }
      );
      if (!isSessionGenerationCurrent(sessionGeneration)) return;
      set((state) => {
        const current = (type === "all" ? state.personal : state.typed[key]) || emptyBucket();
        const next: HistoryBucket = { items: append ? [...current.items, ...page.items.filter((item) => !current.items.some((existing) => existing._id === item._id))] : page.items, total: append ? previous.total : data.stats?.total || 0, nextCursor: page.nextCursor, ...(data.monthPagination ? { monthPagination: data.monthPagination } : {}), version: append ? current.version : version };
        return {
          ...(type === "all" ? { personal: next } : { typed: { ...state.typed, [key]: next } }),
          loading: { ...state.loading, [key]: false },
        };
      });
    } catch (error: any) {
      if (!isSessionGenerationCurrent(sessionGeneration)) return;
      set((state) => ({
        loading: { ...state.loading, [key]: false },
        errors: { ...state.errors, [key]: error?.response?.data?.msg || "Unable to load your watch history." },
      }));
    }
  },

  fetchGroup: async (groupId, append = false, monthPage, type = "all") => {
    const key = historyBucketKey(groupId, type);
    const previous = (type === "all" ? get().byGroup[groupId] : get().typed[key]) || emptyBucket();
    if (append && (!previous.nextCursor || get().loading[key])) return;
    const sessionGeneration = getSessionGeneration();
    const version = get().version;
    const typeParam = type === "all" ? {} : { type };
    set((state) => ({ loading: { ...state.loading, [key]: true }, errors: { ...state.errors, [key]: null } }));
    try {
      const data = await api.fetchGroupHistory(groupId, { limit: 100, ...typeParam, ...(monthPage ? { monthPage } : {}), ...(append ? { cursor: previous.nextCursor! } : {}) });
      const page = await completeTrailingDay(
        { items: data.items || [], nextCursor: data.nextCursor || null },
        async (cursor, limit) => {
          const more = await api.fetchGroupHistory(groupId, { cursor, limit, ...typeParam });
          return { items: more.items || [], nextCursor: more.nextCursor || null };
        }
      );
      if (!isSessionGenerationCurrent(sessionGeneration)) return;
      set((state) => {
        const current = (type === "all" ? state.byGroup[groupId] : state.typed[key]) || emptyBucket();
        const next: HistoryBucket = { items: append ? [...current.items, ...page.items.filter((item) => !current.items.some((existing) => existing._id === item._id))] : page.items, total: append ? previous.total : data.stats?.total || 0, nextCursor: page.nextCursor, ...(data.monthPagination ? { monthPagination: data.monthPagination } : {}), version: append ? current.version : version };
        return {
          ...(type === "all" ? { byGroup: { ...state.byGroup, [groupId]: next } } : { typed: { ...state.typed, [key]: next } }),
          loading: { ...state.loading, [key]: false },
        };
      });
    } catch (error: any) {
      if (!isSessionGenerationCurrent(sessionGeneration)) return;
      set((state) => ({
        loading: { ...state.loading, [key]: false },
        errors: { ...state.errors, [key]: error?.response?.data?.msg || "Unable to load this group's history." },
      }));
    }
  },

  replaceEntry: (entry) => {
    set((state) => {
      const replace = (bucket: HistoryBucket): HistoryBucket => ({
        ...bucket,
        items: bucket.items.map((item) => (item._id === entry._id ? entry : item)),
      });
      const byGroup = { ...state.byGroup };
      if (entry.group?._id && byGroup[entry.group._id]) byGroup[entry.group._id] = replace(byGroup[entry.group._id]);
      return { personal: replace(state.personal), byGroup, typed: mapBuckets(state.typed, replace) };
    });
  },

  // Edits and deletes patch every cached view in place so the screen updates
  // at once, then invalidate: a new date can move the entry to another month
  // or position, and a delete changes totals and month pages of views that
  // never held the entry on their loaded page.
  updateEntry: async (entryId, payload) => {
    const entry = await api.updateHistoryEntry(entryId, payload);
    get().replaceEntry(entry);
    get().invalidate();
    return entry;
  },

  deleteEntry: async (entryId) => {
    await api.deleteHistoryEntry(entryId);
    set((state) => {
      const remove = (bucket: HistoryBucket): HistoryBucket => {
        const items = bucket.items.filter((entry) => entry._id !== entryId);
        return { ...bucket, items, total: Math.max(0, bucket.total - (items.length === bucket.items.length ? 0 : 1)) };
      };
      return {
        personal: remove(state.personal),
        byGroup: mapBuckets(state.byGroup, remove),
        typed: mapBuckets(state.typed, remove),
        version: state.version + 1,
      };
    });
  },

  rateEntry: async (entryId, rating) => {
    const entry = await api.rateHistoryEntry(entryId, rating);
    get().replaceEntry(entry);
    return entry;
  },
}));

registerUserScopedReset(() => useWatchHistoryStore.setState({
  personal: emptyBucket(),
  byGroup: {},
  typed: {},
  loading: {},
  errors: {},
}));
