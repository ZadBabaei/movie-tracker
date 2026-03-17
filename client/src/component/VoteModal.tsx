import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import "./VoteModal.css";
import { useModalStore } from "../store/useModalStore";
import { usePollStore } from "../store/usePollStore";
import { useSocket } from "../hooks/useSocket";
import SearchBar from "./SearchBar";
import MovieCard from "./MovieCard";

interface VoteModalProps {
  groupId: string;
  onPollStatusChange?: (status: string) => void;
}

const getScores = (votes: any[]): Record<string, number> => {
  const map: Record<string, number> = {};
  votes.forEach((v) => {
    map[v.movieTmdbId] = (map[v.movieTmdbId] || 0) + 1;
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
    pollName,
    setPollName,
    selectedVoteIds,
    toggleVoteSelection,
    clearVoteIds,
    submitVote,
    pollHistory,
    fetchPollHistory,
    deletePoll,
  } = usePollStore();

  const socket = useSocket(groupId);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [runoffMessage, setRunoffMessage] = useState("");
  const [menuOpenPollId, setMenuOpenPollId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Fetch poll history when there's no active poll
  useEffect(() => {
    if (!loading && !currentPoll) {
      fetchPollHistory(groupId);
    }
  }, [loading, currentPoll, groupId]);

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

    socket.on("poll:runoff", (data: any) => {
      if (data.poll) {
        setCurrentPoll(data.poll);
        setRunoffMessage(`It's a tie! Vote again among the remaining movies (Round ${data.round})`);
        clearVoteIds();
      }
    });

    return () => {
      socket.off("poll:updated");
      socket.off("poll:completed");
      socket.off("poll:runoff");
    };
  }, [socket, currentPoll]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenPollId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isCreator = !!currentPoll && (() => {
    const c = currentPoll.creator;
    if (!c) return false;
    if (typeof c === "string") return c === userId;
    return c._id === userId;
  })();

  const handleSubmitPoll = async () => {
    if (selectedMoviesForVote.length === 0 || !pollName.trim()) return;
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
      const result = await completePoll(currentPoll._id);
      if (result.status === "completed") {
        onPollStatusChange?.("completed");
      } else {
        setRunoffMessage(`It's a tie! Vote again among the remaining movies (Round ${result.round})`);
      }
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

  const handleSubmitVotes = async () => {
    if (!currentPoll || selectedVoteIds.length === 0) return;
    await submitVote(currentPoll._id, selectedVoteIds);
  };

  const getUserSelectedMovies = (): string[] => {
    if (!currentPoll?.votes) return [];
    return currentPoll.votes
      .filter((v: any) => {
        const vUserId = typeof v.userId === "object" ? v.userId._id : v.userId;
        return vUserId === userId;
      })
      .map((v: any) => v.movieTmdbId);
  };

  const handleResetCreate = () => {
    clearVoteSelections();
    setPollName("");
  };

  const handleDeletePoll = async (pollId: string) => {
    await deletePoll(pollId);
    setMenuOpenPollId(null);
  };

  // ── Completed Results View ────────────────────────────────────────────────
  if (!loading && currentPoll?.status === "completed") {
    const scores = getScores(currentPoll.votes || []);
    const ranked = [...currentPoll.movies].sort((a: any, b: any) => {
      const aId = a.movieId || a.id || a.tmdbId || "";
      const bId = b.movieId || b.id || b.tmdbId || "";
      return (scores[bId] || 0) - (scores[aId] || 0);
    });
    const medals = ["🥇", "🥈", "🥉"];
    const winnerMovie = ranked[0];
    const winnerPoster = winnerMovie?.poster_path;

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
            <div className="VoteModal-results-poll-name">{currentPoll.name}</div>
            {winnerPoster && (
              <img
                src={`https://image.tmdb.org/t/p/w300${winnerPoster}`}
                alt={winnerMovie?.title}
                className="VoteModal-winner-poster"
              />
            )}
            <div className="VoteModal-results-winner-title">{winnerMovie?.title}</div>
            <div className="VoteModal-results-subtitle">won the vote!</div>
          </motion.div>

          <div className="VoteModal-results-list">
            {ranked.map((movie: any, index: number) => {
              const movieId = movie.movieId || movie.id || movie.tmdbId || "";
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
                  <span className="VoteModal-result-score">{score} votes</span>
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
    const userPreviousSelections = getUserSelectedMovies();
    const effectiveSelections = selectedVoteIds.length > 0 ? selectedVoteIds : userPreviousSelections;
    const isRunoff = (currentPoll.round || 1) > 1;
    const maxVotes = isRunoff ? 1 : 3;

    // Compute live vote counts per movie
    const liveScores = getScores(currentPoll.votes || []);
    const maxVoteCount = Math.max(...Object.values(liveScores), 0);

    return (
      <div className="VoteModal-overlay">
        <div className="VoteModal-content">
          <button className="VoteModal-close-btn" onClick={closeVoteModal}>×</button>
          <h2 className="VoteModal-title">
            {currentPoll.name}
            {isRunoff && (
              <span className="VoteModal-round-badge">Round {currentPoll.round}</span>
            )}
          </h2>

          {runoffMessage && (
            <div className="VoteModal-runoff-banner">{runoffMessage}</div>
          )}

          {isRunoff && (
            <p className="VoteModal-vote-hint">Pick 1 movie only</p>
          )}

          <div className="VoteModal-movie-grid">
            {currentPoll.movies.map((movie: any) => {
              const movieId = movie.movieId || movie.id || movie.tmdbId;
              const isSelected = effectiveSelections.includes(movieId);
              const voteCount = liveScores[movieId] || 0;
              const isLeading = maxVoteCount > 0 && voteCount === maxVoteCount;

              return (
                <div
                  key={movieId}
                  className={`VoteModal-movie-wrapper ${isSelected ? "VoteModal-movie-selected" : ""} ${isLeading ? "VoteModal-movie-leading" : ""}`}
                  onClick={() => toggleVoteSelection(movieId, maxVotes)}
                  style={{ cursor: "pointer" }}
                >
                  <MovieCard movie={movie} onDelete={() => {}} onInfoClick={() => {}} />

                  {/* Vote count badge */}
                  {voteCount > 0 && (
                    <div className="VoteModal-vote-count-badge">
                      {voteCount} {voteCount === 1 ? "vote" : "votes"}
                    </div>
                  )}

                  {/* Leading indicator */}
                  {isLeading && voteCount > 0 && (
                    <div className="VoteModal-leading-label">Leading</div>
                  )}

                  {/* Selection overlay */}
                  {isSelected && (
                    <div className="VoteModal-selected-overlay">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="VoteModal-button-group" style={{ marginTop: 24 }}>
            <button
              className="VoteModal-submit-btn"
              onClick={handleSubmitVotes}
              disabled={effectiveSelections.length === 0}
            >
              Submit Votes ({effectiveSelections.length}/{maxVotes})
            </button>
            {isCreator && (
              <>
                <button
                  className="VoteModal-submit-btn"
                  onClick={handleCompletePoll}
                  disabled={completing || (currentPoll.votes?.length || 0) === 0}
                >
                  {completing ? "Calculating..." : "Complete Poll"}
                </button>
                <button className="VoteModal-reset-btn" onClick={handleCancelPoll}>
                  Cancel Poll
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── No Poll / Create View ──────────────────────────────────────────────────
  return (
    <div className="VoteModal-overlay">
      <div className="VoteModal-content">
        <button className="VoteModal-close-btn" onClick={closeVoteModal}>×</button>
        <h2 className="VoteModal-title">Create a New Poll</h2>

        {loading ? (
          <div className="VoteModal-loading">
            <div className="VoteModal-spinner" />
            <span>Loading poll...</span>
          </div>
        ) : (
          <>
            <div className="VoteModal-create-section">
              <input
                type="text"
                className="VoteModal-poll-name-input"
                placeholder="Enter poll name..."
                value={pollName}
                onChange={(e) => setPollName(e.target.value)}
              />

              <SearchBar onMovieSelect={handleMovieSelectForVote} />

              {selectedMoviesForVote.length > 0 && (
                <div className="VoteModal-selected-chips">
                  {selectedMoviesForVote.map((movie) => (
                    <div key={movie.id} className="VoteModal-chip">
                      {movie.poster_path && (
                        <img
                          src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                          alt={movie.title}
                          className="VoteModal-chip-poster"
                        />
                      )}
                      <span className="VoteModal-chip-title">{movie.title}</span>
                      <button
                        className="VoteModal-chip-remove"
                        onClick={() => handleMovieSelectForVote(movie)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="VoteModal-selected-count">
                Selected Movies: {selectedMoviesForVote.length}/6
              </div>

              <div className="VoteModal-button-group">
                <button
                  className="VoteModal-publish-btn"
                  onClick={handleSubmitPoll}
                  disabled={selectedMoviesForVote.length === 0 || !pollName.trim()}
                >
                  Publish
                </button>
                <button
                  className="VoteModal-reset-btn"
                  onClick={handleResetCreate}
                  disabled={selectedMoviesForVote.length === 0 && !pollName.trim()}
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* ── Poll History ──────────────────────────────────────────── */}
            {pollHistory.length > 0 && (
              <div className="VoteModal-history-section">
                <h3 className="VoteModal-history-title">Previous Polls</h3>
                <div className="VoteModal-history-list">
                  {pollHistory.map((poll) => (
                    <div key={poll._id} className="VoteModal-history-item">
                      <div className="VoteModal-history-info">
                        <span className="VoteModal-history-name">{poll.name}</span>
                        <span className="VoteModal-history-winner">
                          {poll.status === "cancelled"
                            ? "Cancelled"
                            : poll.winnerTitle
                              ? `Winner: ${poll.winnerTitle}`
                              : "No winner"
                          }
                        </span>
                      </div>
                      <div className="VoteModal-history-menu" ref={menuOpenPollId === poll._id ? menuRef : null}>
                        <button
                          className="VoteModal-history-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenPollId(menuOpenPollId === poll._id ? null : poll._id);
                          }}
                        >
                          ⋯
                        </button>
                        {menuOpenPollId === poll._id && (
                          <div className="VoteModal-history-dropdown">
                            <button onClick={() => handleDeletePoll(poll._id)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default VoteModal;
