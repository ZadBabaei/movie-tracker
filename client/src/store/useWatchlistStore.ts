import { create } from "zustand";
import * as api from "../api/watchlistApi";

export interface WatchlistMovie {
  _id: string;
  title: string;
  imdbID: string;
  poster?: string;
  vote_average: number;
}

interface WatchlistState {
  movies: WatchlistMovie[];
  loading: boolean;
  error: string | null;

  fetchWatchlist: () => Promise<void>;
  addMovie: (movie: {
    imdbID: string;
    title: string;
    poster_path?: string;
    vote_average?: number;
  }) => Promise<void>;
  removeMovie: (movieId: string) => Promise<void>;
  markAsWatched: (movieId: string, groupId: string) => Promise<void>;
}

export const useWatchlistStore = create<WatchlistState>((set) => ({
  movies: [],
  loading: false,
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

  markAsWatched: async (movieId, groupId) => {
    try {
      await api.markAsWatched(movieId, groupId);
      set((state) => ({
        movies: state.movies.filter((m) => m._id !== movieId),
      }));
    } catch (err) {
      console.error("Failed to mark as watched:", err);
    }
  },
}));
