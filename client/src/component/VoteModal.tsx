import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import "./VoteModal.css";
import { useModalStore } from "../store/useModalStore";
import { usePollStore } from "../store/usePollStore";
import { useSocket } from "../hooks/useSocket";
import SearchBar from "./SearchBar";
import MovieCard from "./MovieCard";
import Badge from "./Badge";
import axios from "axios";

interface VoteModalProps {
  groupId: string;
  onPollStatusChange?: (status: string) => void;
}

const RANK_POINTS: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1 };

const getScores = (votes: any[]): Record<string, number> => {
  const map: Record<string, number> = {};
  votes.forEach((v) => {
    map[v.movieTmdbId] = (map[v.movieTmdbId] || 0) + (RANK_POINTS[v.rank] || 0);
  });
  return map;
};

const VoteModal: React.FC<VoteModalProps> = ({ groupId, onPollStatusChange }) => {
  const { closeVoteModal } = useModalStore();
  const {
    currentPoll,
    setCurrentPoll,
    selectedMoviesForVote,
    handleMovieSelectForVote,
    clearVoteSelections,
    createPoll,
    fetchCurrentPoll,
    completePoll,
    cancelPoll,
  } = usePollStore();

  const socket = useSocket(groupId);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem("userId");
    if (id) setUserId(id);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchCurrentPoll(groupId);
      setLoading(false);
    };
    load();
  }, [groupId]);

  useEffect(() => {
    socket.on("poll:updated", (updatedPoll: any) => {
      if (currentPoll && updatedPoll._id === currentPoll._id) {
        setCurrentPoll(updatedPoll);
      }
    });

    socket.on("poll:completed", (data: any) => {
      if (currentPoll && data.pollId === currentPoll._id) {
        setCurrentPoll({ ...currentPoll, status: "completed", winningMovieTmdbId: data.winningMovieTmdbId });
        onPollStatusChange?.("completed");
      }
    });

    return () => {
      socket.off("poll:updated");
      socket.off("poll:completed");
    };
  }, [socket, currentPoll]);

  const isCreator = !!currentPoll && (() => {
    const c = currentPoll.creator;
    if (!c) return false;
    if (typeof c === "string") return c === userId;
    return c._id === userId;
  })();

  const handleVote = async (movieId: string, rank: number) => {
    if (!currentPoll) return;
    try {
      const res = await axios.post(
        "/api/polls/vote",
        { pollId: currentPoll._id, movieId, rank },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      setCurrentPoll(res.data);
    } catch (err) {
      console.error("Vote error:", err);
    }
  };

  const getUserVoteRank = (movieId: string): number | null => {
    const vote = currentPoll?.votes?.find((v: any) => {
      const vUserId = typeof v.userId === "object" ? v.userId._id : v.userId;
      return vUserId === userId && v.movieTmdbId === movieId;
    });
    return vote?.rank || null;
  };

  const handleSubmitPoll = async () => {
    if (selectedMoviesForVote.length === 0) return;
    try {
      await createPoll(groupId);
      onPollStatusChange?.("active");
    } catch (err) {
      console.error("Create poll error:", err);
    }
  };

  const handleCompletePoll = async () => {
    if (!currentPoll) return;
    setCompleting(true);
    try {
      await completePoll(currentPoll._id);
      onPollStatusChange?.("completed");
    } catch (err) {
      console.error("Complete poll error:", err);
    } finally {
      setCompleting(false);
    }
  };

  const handleCancelPoll = async () => {
    if (!currentPoll) return;
    try {
      await cancelPoll(currentPoll._id);
      onPollStatusChange?.("none");
    } catch (err) {
      console.error("Cancel poll error:", err);
    }
  };

  // ── Completed Results View ────────────────────────────────────────────────
  if (!loading && currentPoll?.status === "completed") {
    const scores = getScores(currentPoll.votes || []);
    const ranked = [...currentPoll.movies].sort((a: any, b: any) => {
      const aId = a.movieId || a.id || "";
      const bId = b.movieId || b.id || "";
      return (scores[bId] || 0) - (scores[aId] || 0);
    });
    const medals = ["🥇", "🥈", "🥉"];

    return (
      <div className="VoteModal-overlay">
        <div className="VoteModal-content">
          <button className="VoteModal-close-btn" onClick={closeVoteModal}>×</button>

          <motion.div
            className="VoteModal-results-banner"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
          >
            <div className="VoteModal-results-trophy">🏆</div>
            <div className="VoteModal-results-winner-title">{ranked[0]?.title}</div>
            <div className="VoteModal-results-subtitle">won the vote!</div>
          </motion.div>

          <div className="VoteModal-results-list">
            {ranked.map((movie: any, index: number) => {
              const movieId = movie.movieId || movie.id || "";
              const score = scores[movieId] || 0;
              const isWinner = movieId === currentPoll.winningMovieTmdbId;
              const maxScore = Math.max(...Object.values(scores), 1);
              return (
                <motion.div
                  key={movieId}
                  className={`VoteModal-result-row ${isWinner ? "winner-row" : ""}`}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <span className="VoteModal-result-medal">{medals[index] || `#${index + 1}`}</span>
                  <div className="VoteModal-result-info">
                    <span className="VoteModal-result-name">{movie.title}</span>
                    <div className="VoteModal-result-bar-wrap">
                      <motion.div
                        className={`VoteModal-result-bar ${isWinner ? "winner-bar" : ""}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${(score / maxScore) * 100}%` }}
                        transition={{ delay: index * 0.1 + 0.3, duration: 0.6 }}
                      />
                    </div>
                  </div>
                  <span className="VoteModal-result-score">{score} pts</span>
                </motion.div>
              );
            })}
          </div>

          <div className="VoteModal-button-group">
            <button className="VoteModal-submit-btn" onClick={closeVoteModal}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active Poll View ──────────────────────────────────────────────────────
  if (!loading && currentPoll?.status === "active") {
    return (
      <div className="VoteModal-overlay">
        <div className="VoteModal-content">
          <button className="VoteModal-close-btn" onClick={closeVoteModal}>×</button>
          <h2 className="VoteModal-title">Vote for a Movie</h2>

          <div className="VoteModal-movie-grid">
            {currentPoll.movies.map((movie: any) => {
              const movieId = movie.movieId || movie.id;
              const selected = getUserVoteRank(movieId);
              const isWinner = movieId === currentPoll.winningMovieTmdbId;
              return (
                <div key={movieId} className="VoteModal-movie-wrapper">
                  <MovieCard movie={movie} onDelete={() => {}} onInfoClick={() => {}} />
                  {isWinner && <Badge type="winner" />}
                  <div className="VoteModal-rank-buttons">
                    {[1, 2, 3, 4].map((rank) => (
                      <button
                        key={rank}
                        className={`VoteModal-rank-btn ${
                          rank === 1 ? "first-rank" : rank === 2 ? "second-rank" : rank === 3 ? "third-rank" : "fourth-rank"
                        } ${selected === rank ? "active" : ""}`}
                        onClick={() => handleVote(movieId, rank)}
                      >
                        {rank}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {isCreator && (
            <div className="VoteModal-button-group" style={{ marginTop: 24 }}>
              <button className="VoteModal-submit-btn" onClick={handleCompletePoll} disabled={completing}>
                {completing ? "Calculating..." : "Complete Poll"}
              </button>
              <button className="VoteModal-reset-btn" onClick={handleCancelPoll}>
                Cancel Poll
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── No Poll / Loading View ────────────────────────────────────────────────
  return (
    <div className="VoteModal-overlay">
      <div className="VoteModal-content">
        <button className="VoteModal-close-btn" onClick={closeVoteModal}>×</button>
        <h2 className="VoteModal-title">Movie Voting</h2>

        {loading ? (
          <div className="VoteModal-loading">
            <div className="VoteModal-spinner" />
            <span>Loading poll...</span>
          </div>
        ) : (
          <div className="VoteModal-search">
            <SearchBar onMovieSelect={handleMovieSelectForVote} />
            <div className="VoteModal-selected-count">
              Selected Movies: {selectedMoviesForVote.length}/6
            </div>
            <div className="VoteModal-button-group">
              <button
                className="VoteModal-submit-btn"
                onClick={handleSubmitPoll}
                disabled={selectedMoviesForVote.length === 0}
              >
                Submit Poll
              </button>
              <button
                className="VoteModal-reset-btn"
                onClick={clearVoteSelections}
                disabled={selectedMoviesForVote.length === 0}
              >
                Reset Selection
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoteModal;
