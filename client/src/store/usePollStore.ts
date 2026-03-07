import { create } from "zustand";
import axios from "axios";

export interface PollMovie {
  id?: string;
  movieId?: string;
  title: string;
  poster_path?: string;
  vote_average?: number;
}

export interface Poll {
  _id: string;
  movies: PollMovie[];
  votes: any[];
  status: "active" | "completed" | "cancelled";
  winningMovieTmdbId?: string;
}

interface PollState {
  currentPoll: Poll | null;
  selectedMoviesForVote: PollMovie[];

  setCurrentPoll: (poll: Poll | null) => void;
  handleMovieSelectForVote: (movie: PollMovie) => void;
  clearVoteSelections: () => void;
  createPoll: (groupId: string) => Promise<Poll>;
  fetchCurrentPoll: (groupId: string) => Promise<Poll | null>;
  completePoll: (pollId: string, winningMovie: string) => Promise<void>;
  cancelPoll: (pollId: string) => Promise<void>;
  addMovieToCurrentPoll: (movie: PollMovie) => Promise<void>;
}

export const usePollStore = create<PollState>((set, get) => ({
  currentPoll: null,
  selectedMoviesForVote: [],

  setCurrentPoll: (poll) => set({ currentPoll: poll }),

  handleMovieSelectForVote: (movie) => {
    const { selectedMoviesForVote, currentPoll, addMovieToCurrentPoll } = get();
    const exists = selectedMoviesForVote.find((m) => m.id === movie.id);
    if (exists) {
      set({ selectedMoviesForVote: selectedMoviesForVote.filter((m) => m.id !== movie.id) });
    } else if (selectedMoviesForVote.length < 6) {
      if (currentPoll) addMovieToCurrentPoll(movie);
      set({ selectedMoviesForVote: [...selectedMoviesForVote, movie] });
    }
  },

  clearVoteSelections: () => set({ selectedMoviesForVote: [] }),

  createPoll: async (groupId: string): Promise<Poll> => {
    const token = localStorage.getItem("token");
    const { selectedMoviesForVote } = get();
    const res = await axios.post(
      "/api/polls/create",
      { groupId, movies: selectedMoviesForVote },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    set({ currentPoll: res.data });
    return res.data;
  },

  fetchCurrentPoll: async (groupId: string): Promise<Poll | null> => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`/api/polls/group/${groupId}/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      set({ currentPoll: res.data });
      return res.data;
    } catch {
      set({ currentPoll: null });
      return null;
    }
  },

  completePoll: async (pollId: string, winningMovie: string): Promise<void> => {
    const token = localStorage.getItem("token");
    await axios.post(
      `/api/polls/${pollId}/complete`,
      { winningMovie },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    set({ currentPoll: null, selectedMoviesForVote: [] });
  },

  cancelPoll: async (pollId: string): Promise<void> => {
    const token = localStorage.getItem("token");
    await axios.post(
      `/api/polls/${pollId}/cancel`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    set({ currentPoll: null, selectedMoviesForVote: [] });
  },

  addMovieToCurrentPoll: async (movie: PollMovie): Promise<void> => {
    const { currentPoll } = get();
    if (!currentPoll) return;
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `/api/polls/${currentPoll._id}/add-movie`,
        { movie },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      set({ currentPoll: res.data });
    } catch (err) {
      console.error("Failed to add movie to poll:", err);
    }
  },
}));
