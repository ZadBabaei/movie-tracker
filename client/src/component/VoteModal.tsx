import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import "./VoteModal.css";
import { useModalStore } from "../store/useModalStore";
import { usePollStore } from "../store/usePollStore";
import { useSocket } from "../hooks/useSocket";
import SearchBar from "./SearchBar";
import MovieCard from "./MovieCard";
import { FaTrophy, FaCrown, FaStar, FaMedal } from "react-icons/fa";
import { HiSparkles } from "react-icons/hi2";

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
    const winnerMovie: any = ranked[0];
    const winnerPoster = winnerMovie?.poster_path;
    const winnerId = winnerMovie?.movieId || winnerMovie?.id || winnerMovie?.tmdbId || "";
    const totalVotes = (currentPoll.votes || []).length;

    // Get voters per movie
    const votersByMovie: Record<string, string[]> = {};
    (currentPoll.votes || []).forEach((v: any) => {
      const mid = v.movieTmdbId;
      const name = typeof v.userId === "object" ? v.userId.name : "";
      if (!votersByMovie[mid]) votersByMovie[mid] = [];
      if (name) votersByMovie[mid].push(name);
    });

    const medalIcons = [
      <FaTrophy className="results-medal-icon gold" />,
      <FaMedal className="results-medal-icon silver" />,
      <FaMedal className="results-medal-icon bronze" />,
    ];

    return (
      <div className="VoteModal-overlay">
        <div className="VoteModal-content results-cinematic">
          <button className="VoteModal-close-btn" onClick={closeVoteModal}>×</button>

          {/* Floating particles */}
          <div className="results-particles">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="results-particle" style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${3 + Math.random() * 4}s`,
              }} />
            ))}
          </div>

          {/* Header badge */}
          <motion.div
            className="results-header-badge"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <HiSparkles className="results-sparkle-icon" />
            <span>Tonight's movie has been chosen</span>
            <HiSparkles className="results-sparkle-icon" />
          </motion.div>

          {/* Poll name */}
          <motion.div
            className="results-poll-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {currentPoll.name}
          </motion.div>

          {/* Winner Hero Card */}
          <motion.div
            className="results-winner-hero"
            initial={{ opacity: 0, scale: 0.7, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 150, damping: 18, delay: 0.4 }}
          >
            <div className="results-winner-glow" />

            {/* Crown icon */}
            <motion.div
              className="results-crown"
              initial={{ opacity: 0, y: -20, rotate: -15 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
            >
              <FaCrown />
            </motion.div>

            {/* Winner badge */}
            <motion.div
              className="results-winner-badge"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.9, type: "spring" }}
            >
              <FaTrophy /> WINNER
            </motion.div>

            {/* Poster */}
            {winnerPoster && (
              <motion.div
                className="results-poster-container"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, duration: 0.6 }}
              >
                <img
                  src={`https://image.tmdb.org/t/p/w400${winnerPoster}`}
                  alt={winnerMovie?.title}
                  className="results-winner-poster"
                />
                <div className="results-poster-reflection" />
              </motion.div>
            )}

            {/* Winner info */}
            <motion.h2
              className="results-winner-title"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              {winnerMovie?.title}
            </motion.h2>

            <motion.div
              className="results-winner-subtitle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              <FaStar className="results-star-icon" />
              <span>Movie Night Winner</span>
              <FaStar className="results-star-icon" />
            </motion.div>

            {/* Stats row */}
            <motion.div
              className="results-winner-stats"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
            >
              <div className="results-stat">
                <span className="results-stat-value">{scores[winnerId] || 0}</span>
                <span className="results-stat-label">votes</span>
              </div>
              <div className="results-stat-divider" />
              <div className="results-stat">
                <span className="results-stat-value">
                  {totalVotes > 0 ? Math.round(((scores[winnerId] || 0) / totalVotes) * 100) : 0}%
                </span>
                <span className="results-stat-label">of votes</span>
              </div>
            </motion.div>

            {/* Voters who picked the winner */}
            {votersByMovie[winnerId] && votersByMovie[winnerId].length > 0 && (
              <motion.div
                className="results-winner-voters"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.0 }}
              >
                {votersByMovie[winnerId].map((name, i) => (
                  <span key={i} className="results-voter-chip">
                    {name}
                  </span>
                ))}
              </motion.div>
            )}
          </motion.div>

          {/* Ranked Results */}
          <motion.div
            className="results-rankings-header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0 }}
          >
            Final Rankings
          </motion.div>

          <div className="results-rankings-list">
            {ranked.map((movie: any, index: number) => {
              const movieId = movie.movieId || movie.id || movie.tmdbId || "";
              const score = scores[movieId] || 0;
              const isWinner = movieId === currentPoll.winningMovieTmdbId;
              const percentage = totalVotes > 0 ? Math.round((score / totalVotes) * 100) : 0;
              const voters = votersByMovie[movieId] || [];

              return (
                <motion.div
                  key={movieId}
                  className={`results-rank-card ${isWinner ? "results-rank-winner" : ""}`}
                  initial={{ opacity: 0, x: -40, y: 10 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ delay: 1.1 + index * 0.12, type: "spring", stiffness: 120 }}
                >
                  {/* Rank number */}
                  <div className={`results-rank-position rank-${index + 1}`}>
                    {index < 3 ? medalIcons[index] : <span>#{index + 1}</span>}
                  </div>

                  {/* Poster thumbnail */}
                  {movie.poster_path && (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                      alt={movie.title}
                      className="results-rank-poster"
                    />
                  )}

                  {/* Info */}
                  <div className="results-rank-info">
                    <div className="results-rank-title-row">
                      <span className="results-rank-name">{movie.title}</span>
                      {isWinner && (
                        <span className="results-rank-winner-tag">
                          <FaTrophy /> Winner
                        </span>
                      )}
                    </div>
                    <div className="results-rank-bar-container">
                      <motion.div
                        className={`results-rank-bar ${isWinner ? "bar-gold" : ""}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ delay: 1.2 + index * 0.12, duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                    {/* Voters */}
                    {voters.length > 0 && (
                      <div className="results-rank-voters">
                        {voters.map((name, i) => (
                          <span key={i} className="results-rank-voter">{name}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Score */}
                  <div className="results-rank-score">
                    <span className="results-rank-score-num">{score}</span>
                    <span className="results-rank-score-label">{score === 1 ? "vote" : "votes"}</span>
                    <span className="results-rank-percentage">{percentage}%</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Close button */}
          <motion.div
            className="results-close-section"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
          >
            <button className="results-close-btn" onClick={closeVoteModal}>
              Close
            </button>
          </motion.div>
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
