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
  name: string;
  groupId?: string;
  creator?: { _id: string; name: string } | string;
  movies: PollMovie[];
  votes: any[];
  status: "active" | "completed" | "cancelled";
  round: number;
  winningMovieTmdbId?: string;
  createdAt?: string;
}

export interface PollHistoryItem {
  _id: string;
  name: string;
  round: number;
  status: string;
  winningMovieTmdbId?: string;
  winnerTitle?: string;
  winnerPoster?: string;
  createdAt: string;
  creator?: { _id: string; name: string };
}

interface PollState {
  currentPoll: Poll | null;
  selectedMoviesForVote: PollMovie[];
  pollHistory: PollHistoryItem[];
  pollName: string;
  selectedVoteIds: string[];

  setCurrentPoll: (poll: Poll | null) => void;
  handleMovieSelectForVote: (movie: PollMovie) => void;
  clearVoteSelections: () => void;
  setPollName: (name: string) => void;
  toggleVoteSelection: (movieId: string, maxSelections?: number) => void;
  clearVoteIds: () => void;
  createPoll: (groupId: string) => Promise<Poll>;
  fetchCurrentPoll: (groupId: string) => Promise<Poll | null>;
  completePoll: (pollId: string) => Promise<Poll>;
  cancelPoll: (pollId: string) => Promise<void>;
  addMovieToCurrentPoll: (movie: PollMovie) => Promise<void>;
  submitVote: (pollId: string, movieIds: string[]) => Promise<void>;
  fetchPollHistory: (groupId: string) => Promise<void>;
  fetchPollResults: (pollId: string) => Promise<void>;
  deletePoll: (pollId: string) => Promise<void>;
}

export const usePollStore = create<PollState>((set, get) => ({
  currentPoll: null,
  selectedMoviesForVote: [],
  pollHistory: [],
  pollName: "",
  selectedVoteIds: [],

  setCurrentPoll: (poll) => set({ currentPoll: poll }),

  setPollName: (name) => set({ pollName: name }),

  toggleVoteSelection: (movieId, maxSelections = 3) => {
    const { selectedVoteIds } = get();
    if (selectedVoteIds.includes(movieId)) {
      set({ selectedVoteIds: selectedVoteIds.filter((id) => id !== movieId) });
    } else if (selectedVoteIds.length < maxSelections) {
      set({ selectedVoteIds: [...selectedVoteIds, movieId] });
    }
  },

  clearVoteIds: () => set({ selectedVoteIds: [] }),

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

  clearVoteSelections: () => set({ selectedMoviesForVote: [], selectedVoteIds: [] }),

  createPoll: async (groupId: string): Promise<Poll> => {
    const token = localStorage.getItem("token");
    const { selectedMoviesForVote, pollName } = get();
    const res = await axios.post(
      "/api/polls/create",
      { groupId, movies: selectedMoviesForVote, name: pollName },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    set({ currentPoll: res.data, selectedMoviesForVote: [], pollName: "" });
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

  completePoll: async (pollId: string): Promise<Poll> => {
    const token = localStorage.getItem("token");
    const res = await axios.post(
      `/api/polls/${pollId}/complete`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    // Handle runoff: poll stays active with tied movies
    if (res.data.runoff) {
      set({ currentPoll: res.data.poll, selectedVoteIds: [] });
      return res.data.poll;
    }
    // Normal completion
    set({ currentPoll: res.data, selectedMoviesForVote: [], selectedVoteIds: [] });
    return res.data;
  },

  cancelPoll: async (pollId: string): Promise<void> => {
    const token = localStorage.getItem("token");
    await axios.post(
      `/api/polls/${pollId}/cancel`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    set({ currentPoll: null, selectedMoviesForVote: [], selectedVoteIds: [] });
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

  submitVote: async (pollId: string, movieIds: string[]): Promise<void> => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "/api/polls/vote",
        { pollId, movieIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Handle auto-completion (all members voted)
      if (res.data.autoCompleted) {
        if (res.data.runoff) {
          set({ currentPoll: res.data.poll, selectedVoteIds: [] });
        } else {
          set({ currentPoll: res.data.poll, selectedMoviesForVote: [], selectedVoteIds: [] });
        }
      } else {
        set({ currentPoll: res.data });
      }
    } catch (err) {
      console.error("Vote error:", err);
    }
  },

  fetchPollHistory: async (groupId: string): Promise<void> => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`/api/polls/group/${groupId}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      set({ pollHistory: res.data });
    } catch (err) {
      console.error("Error fetching poll history:", err);
      set({ pollHistory: [] });
    }
  },

  fetchPollResults: async (pollId: string): Promise<void> => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`/api/polls/${pollId}/results`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      set({ currentPoll: { ...res.data, status: res.data.status || "completed" } });
    } catch (err) {
      console.error("Error fetching poll results:", err);
    }
  },

  deletePoll: async (pollId: string): Promise<void> => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`/api/polls/${pollId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { pollHistory } = get();
      set({ pollHistory: pollHistory.filter((p) => p._id !== pollId) });
    } catch (err) {
      console.error("Error deleting poll:", err);
    }
  },
}));
