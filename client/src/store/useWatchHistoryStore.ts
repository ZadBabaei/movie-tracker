import { create } from "zustand";
import * as api from "../api/historyApi";
import { completeTrailingDay } from "../utils/historyPagination";

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
}

interface WatchHistoryState {
  personal: HistoryBucket;
  byGroup: Record<string, HistoryBucket>;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  fetchPersonal: () => Promise<void>;
  fetchGroup: (groupId: string) => Promise<void>;
  replaceEntry: (entry: HistoryEntry) => void;
  updateEntry: (entryId: string, payload: { watchedAt: string; watchedLocation: string; watchedNotes: string }) => Promise<HistoryEntry>;
  deleteEntry: (entryId: string) => Promise<void>;
  rateEntry: (entryId: string, rating: number) => Promise<HistoryEntry>;
}

const emptyBucket = (): HistoryBucket => ({ items: [], total: 0, nextCursor: null });

export const useWatchHistoryStore = create<WatchHistoryState>((set, get) => ({
  personal: emptyBucket(),
  byGroup: {},
  loading: {},
  errors: {},

  fetchPersonal: async () => {
    set((state) => ({ loading: { ...state.loading, personal: true }, errors: { ...state.errors, personal: null } }));
    try {
      const data = await api.fetchPersonalHistory({ limit: 100 });
      // Pull in the rest of the trailing day so a TV session is never split
      // at the page boundary (see utils/historyPagination.ts).
      const page = await completeTrailingDay(
        { items: data.items || [], nextCursor: data.nextCursor || null },
        async (cursor, limit) => {
          const more = await api.fetchPersonalHistory({ cursor, limit });
          return { items: more.items || [], nextCursor: more.nextCursor || null };
        }
      );
      set((state) => ({
        personal: { items: page.items, total: data.stats?.total || 0, nextCursor: page.nextCursor },
        loading: { ...state.loading, personal: false },
      }));
    } catch (error: any) {
      set((state) => ({
        loading: { ...state.loading, personal: false },
        errors: { ...state.errors, personal: error?.response?.data?.msg || "Unable to load your watch history." },
      }));
    }
  },

  fetchGroup: async (groupId) => {
    set((state) => ({ loading: { ...state.loading, [groupId]: true }, errors: { ...state.errors, [groupId]: null } }));
    try {
      const data = await api.fetchGroupHistory(groupId, { limit: 100 });
      const page = await completeTrailingDay(
        { items: data.items || [], nextCursor: data.nextCursor || null },
        async (cursor, limit) => {
          const more = await api.fetchGroupHistory(groupId, { cursor, limit });
          return { items: more.items || [], nextCursor: more.nextCursor || null };
        }
      );
      set((state) => ({
        byGroup: {
          ...state.byGroup,
          [groupId]: { items: page.items, total: data.stats?.total || 0, nextCursor: page.nextCursor },
        },
        loading: { ...state.loading, [groupId]: false },
      }));
    } catch (error: any) {
      set((state) => ({
        loading: { ...state.loading, [groupId]: false },
        errors: { ...state.errors, [groupId]: error?.response?.data?.msg || "Unable to load this group's history." },
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
      return { personal: replace(state.personal), byGroup };
    });
  },

  updateEntry: async (entryId, payload) => {
    const entry = await api.updateHistoryEntry(entryId, payload);
    get().replaceEntry(entry);
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
        byGroup: Object.fromEntries(Object.entries(state.byGroup).map(([key, bucket]) => [key, remove(bucket)])),
      };
    });
  },

  rateEntry: async (entryId, rating) => {
    const entry = await api.rateHistoryEntry(entryId, rating);
    get().replaceEntry(entry);
    return entry;
  },
}));
