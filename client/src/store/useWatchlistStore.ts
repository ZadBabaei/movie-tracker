import { create } from "zustand";
import * as api from "../api/watchlistApi";

const ACTIVE_TAB_STORAGE_KEY = "watchlist:activeTab";

export interface WatchlistMovie {
  _id: string;
  title: string;
  imdbID: string;
  poster?: string;
  vote_average: number;
  createdAt?: string;
  addedBy?: { _id: string; name: string; avatar?: string };
  addedAt?: string;
}

interface WatchlistState {
  movies: WatchlistMovie[];
  byGroup: Record<string, WatchlistMovie[]>;
  activeTab: string;
  loading: boolean;
  groupLoading: Record<string, boolean>;
  error: string | null;

  fetchWatchlist: () => Promise<void>;
  addMovie: (movie: {
    imdbID: string;
    title: string;
    poster_path?: string;
    vote_average?: number;
  }) => Promise<void>;
  removeMovie: (movieId: string) => Promise<void>;
  markAsWatched: (movieId: string, groupId: string, metadata?: {
    watchedDate?: string;
    watchedWhere?: string;
    watchedWith?: string[];
  }, source?: "personal" | "group") => Promise<void>;

  setActiveTab: (tab: string) => void;
  fetchGroupWatchlist: (groupId: string) => Promise<void>;
  addMovieToGroup: (groupId: string, movie: {
    imdbID: string;
    title: string;
    poster_path?: string;
    vote_average?: number;
  }) => Promise<void>;
  removeMovieFromGroup: (groupId: string, movieId: string) => Promise<void>;
}

const readPersistedActiveTab = (): string => {
  try {
    return localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || "personal";
  } catch {
    return "personal";
  }
};

const persistActiveTab = (tab: string) => {
  try {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tab);
  } catch {
    // ignore storage errors (e.g. private browsing)
  }
};

const normalizeGroupMovie = (movie: WatchlistMovie): WatchlistMovie => ({
  ...movie,
  createdAt: movie.createdAt ?? movie.addedAt,
});

export const useWatchlistStore = create<WatchlistState>((set) => ({
  movies: [],
  byGroup: {},
  activeTab: readPersistedActiveTab(),
  loading: false,
  groupLoading: {},
  error: null,

  fetchWatchlist: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.fetchWatchlist();
      set({ movies: data, loading: false });
    } catch (err) {
      console.error("Failed to fetch watchlist:", err);
      set({ error: "Failed to fetch watchlist", loading: false });
    }
  },

  addMovie: async (movie) => {
    try {
      const data = await api.addToWatchlist(movie);
      set((state) => {
        const exists = state.movies.some((m) => m._id === data.movie._id);
        if (exists) return state;
        return { movies: [...state.movies, data.movie] };
      });
    } catch (err) {
      console.error("Failed to add to watchlist:", err);
    }
  },

  removeMovie: async (movieId) => {
    try {
      await api.removeFromWatchlist(movieId);
      set((state) => ({
        movies: state.movies.filter((m) => m._id !== movieId),
      }));
    } catch (err) {
      console.error("Failed to remove from watchlist:", err);
    }
  },

  markAsWatched: async (movieId, groupId, metadata?, source?) => {
    try {
      await api.markAsWatched(movieId, groupId, metadata, source);
      if (source === "group") {
        set((state) => ({
          byGroup: {
            ...state.byGroup,
            [groupId]: (state.byGroup[groupId] || []).filter((m) => m._id !== movieId),
          },
        }));
      } else {
        set((state) => ({
          movies: state.movies.filter((m) => m._id !== movieId),
        }));
      }
    } catch (err) {
      console.error("Failed to mark as watched:", err);
      throw err;
    }
  },

  setActiveTab: (tab) => {
    persistActiveTab(tab);
    set({ activeTab: tab });
  },

  fetchGroupWatchlist: async (groupId) => {
    set((state) => ({ groupLoading: { ...state.groupLoading, [groupId]: true } }));
    try {
      const data = await api.fetchGroupWatchlist(groupId);
      set((state) => ({
        byGroup: { ...state.byGroup, [groupId]: (data as WatchlistMovie[]).map(normalizeGroupMovie) },
        groupLoading: { ...state.groupLoading, [groupId]: false },
      }));
    } catch (err) {
      console.error("Failed to fetch group watchlist:", err);
      set((state) => ({ groupLoading: { ...state.groupLoading, [groupId]: false } }));
    }
  },

  addMovieToGroup: async (groupId, movie) => {
    try {
      const data = await api.addToGroupWatchlist(groupId, movie);
      set((state) => {
        const existing = state.byGroup[groupId] || [];
        const exists = existing.some((m) => m._id === data.movie._id);
        if (exists) return state;
        return {
          byGroup: {
            ...state.byGroup,
            [groupId]: [...existing, normalizeGroupMovie(data.movie)],
          },
        };
      });
    } catch (err) {
      console.error("Failed to add to group watchlist:", err);
    }
  },

  removeMovieFromGroup: async (groupId, movieId) => {
    try {
      await api.removeFromGroupWatchlist(groupId, movieId);
      set((state) => ({
        byGroup: {
          ...state.byGroup,
          [groupId]: (state.byGroup[groupId] || []).filter((m) => m._id !== movieId),
        },
      }));
    } catch (err) {
      console.error("Failed to remove from group watchlist:", err);
    }
  },
}));

export const selectVisibleMovies = (state: WatchlistState): WatchlistMovie[] =>
  state.activeTab === "personal" ? state.movies : (state.byGroup[state.activeTab] ?? []);
