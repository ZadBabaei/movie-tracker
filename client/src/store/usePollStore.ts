import { create } from "zustand";
import axios from "axios";

export interface PollMovie {
  id?: string;
  movieId?: string;
  tmdbId?: string;
  title: string;
  poster_path?: string;
  vote_average?: number;
  score?: number;
}

export interface PollRanking {
  movieTmdbId: string;
  rank: number;
}

export interface PollVote {
  userId: { _id: string; name: string } | string;
  rankings: PollRanking[];
}

export interface PollMemberProgress {
  _id: string;
  name: string;
  avatar?: string;
}

export interface PollResult {
  mode?: "ranked" | "runoff" | "randomTieBreak";
  lowestScoreWins?: boolean;
  randomTieBreak?: boolean;
  movies?: {
    movieTmdbId: string;
    title?: string;
    score: number;
  }[];
}

export interface Poll {
  _id: string;
  name: string;
  groupId?: string;
  creator?: { _id: string; name: string } | string;
  movies: PollMovie[];
  votes: PollVote[];
  status: "active" | "completed" | "cancelled";
  round: number;
  winningMovieTmdbId?: string;
  result?: PollResult;
  createdAt?: string;
  expiresAt?: string;
  totalMembers?: number;
  votedMembers?: PollMemberProgress[];
  pendingMembers?: PollMemberProgress[];
  hasCurrentUserVoted?: boolean;
}

export interface PollHistoryItem {
  _id: string;
  name: string;
  round: number;
  status: string;
  winningMovieTmdbId?: string;
  winnerTitle?: string;
  winnerPoster?: string;
  randomTieBreak?: boolean;
  createdAt: string;
  creator?: { _id: string; name: string };
}

interface PollState {
  currentPoll: Poll | null;
  selectedMoviesForVote: PollMovie[];
  pollHistory: PollHistoryItem[];
  pollName: string;
  pollDeadline: string;
  voteRankings: Record<string, number>;
  runoffSelectionId: string;

  setCurrentPoll: (poll: Poll | null) => void;
  handleMovieSelectForVote: (movie: PollMovie) => void;
  clearVoteSelections: () => void;
  setPollName: (name: string) => void;
  setPollDeadline: (deadline: string) => void;
  setMovieRank: (movieId: string, rank: number | "") => void;
  setRunoffSelection: (movieId: string) => void;
  clearVoteRankings: () => void;
  createPoll: (groupId: string) => Promise<Poll>;
  fetchCurrentPoll: (groupId: string) => Promise<Poll | null>;
  completePoll: (pollId: string) => Promise<Poll>;
  cancelPoll: (pollId: string) => Promise<void>;
  addMovieToCurrentPoll: (movie: PollMovie) => Promise<void>;
  submitVote: (pollId: string, rankings: PollRanking[]) => Promise<void>;
  fetchPollHistory: (groupId: string) => Promise<void>;
  fetchPollResults: (pollId: string) => Promise<void>;
  deletePoll: (pollId: string) => Promise<void>;
}

export const usePollStore = create<PollState>((set, get) => ({
  currentPoll: null,
  selectedMoviesForVote: [],
  pollHistory: [],
  pollName: "",
  pollDeadline: "",
  voteRankings: {},
  runoffSelectionId: "",

  setCurrentPoll: (poll) => set({ currentPoll: poll }),

  setPollName: (name) => set({ pollName: name }),

  setPollDeadline: (deadline) => set({ pollDeadline: deadline }),

  setMovieRank: (movieId, rank) => {
    const { voteRankings } = get();
    if (rank === "") {
      const nextRankings = { ...voteRankings };
      delete nextRankings[movieId];
      set({ voteRankings: nextRankings });
      return;
    }

    set({ voteRankings: { ...voteRankings, [movieId]: Number(rank) } });
  },

  setRunoffSelection: (movieId) => set({ runoffSelectionId: movieId }),

  clearVoteRankings: () => set({ voteRankings: {}, runoffSelectionId: "" }),

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

  clearVoteSelections: () => set({ selectedMoviesForVote: [], voteRankings: {}, runoffSelectionId: "" }),

  createPoll: async (groupId: string): Promise<Poll> => {
    const token = localStorage.getItem("token");
    const { selectedMoviesForVote, pollName, pollDeadline } = get();
    const res = await axios.post(
      "/api/polls/create",
      {
        groupId,
        movies: selectedMoviesForVote,
        name: pollName,
        deadline: pollDeadline ? new Date(pollDeadline).toISOString() : undefined,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    set({ currentPoll: res.data, selectedMoviesForVote: [], pollName: "", pollDeadline: "" });
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
      set({ currentPoll: res.data.poll, voteRankings: {}, runoffSelectionId: "" });
      return res.data.poll;
    }
    // Normal completion
    set({ currentPoll: res.data, selectedMoviesForVote: [], voteRankings: {}, runoffSelectionId: "" });
    return res.data;
  },

  cancelPoll: async (pollId: string): Promise<void> => {
    const token = localStorage.getItem("token");
    await axios.post(
      `/api/polls/${pollId}/cancel`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    set({ currentPoll: null, selectedMoviesForVote: [], voteRankings: {}, runoffSelectionId: "" });
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

  submitVote: async (pollId: string, rankings: PollRanking[]): Promise<void> => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "/api/polls/vote",
        { pollId, rankings },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Handle auto-completion (all members voted)
      if (res.data.autoCompleted) {
        if (res.data.runoff) {
          set({ currentPoll: res.data.poll, voteRankings: {}, runoffSelectionId: "" });
        } else {
          set({ currentPoll: res.data.poll, selectedMoviesForVote: [], voteRankings: {}, runoffSelectionId: "" });
        }
      } else {
        set({ currentPoll: res.data, voteRankings: {}, runoffSelectionId: "" });
      }
    } catch (err) {
      console.error("Vote error:", err);
      throw err;
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
