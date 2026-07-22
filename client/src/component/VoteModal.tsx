import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import "./VoteModal.css";
import { useModalStore } from "../store/useModalStore";
import { PollMovie, PollRanking, usePollStore } from "../store/usePollStore";
import { useSocket } from "../hooks/useSocket";
import SearchBar from "./SearchBar";
import Modal from "./Modal/Modal";
import { FaCrown, FaMedal, FaStar, FaTrophy } from "react-icons/fa";
import { HiSparkles } from "react-icons/hi2";
import { toast } from "react-toastify";

interface VoteModalProps {
  groupId: string;
  onPollStatusChange?: (status: string) => void;
}

const getMovieId = (movie: PollMovie): string =>
  (movie.tmdbId || movie.movieId || movie.id || "").toString();

const getPosterUrl = (path?: string) => {
  if (!path) return "/default-avatar.png";
  return path.startsWith("http") ? path : `https://image.tmdb.org/t/p/w500${path}`;
};

const getLocalDateTimeInputValue = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getUserIdFromVote = (vote: any) =>
  typeof vote.userId === "object" ? vote.userId._id : vote.userId;

const getScoresFromResult = (poll: any): Record<string, number> => {
  const scores: Record<string, number> = {};
  if (poll.result?.movies?.length) {
    poll.result.movies.forEach((movie: any) => {
      scores[movie.movieTmdbId] = movie.score;
    });
    return scores;
  }

  poll.movies.forEach((movie: PollMovie) => {
    scores[getMovieId(movie)] = 0;
  });

  (poll.votes || []).forEach((vote: any) => {
    (vote.rankings || []).forEach((ranking: PollRanking) => {
      scores[ranking.movieTmdbId] = (scores[ranking.movieTmdbId] || 0) + Number(ranking.rank);
    });
  });

  return scores;
};

const getRunoffCounts = (poll: any): Record<string, number> => {
  const counts: Record<string, number> = {};
  poll.movies.forEach((movie: PollMovie) => {
    counts[getMovieId(movie)] = 0;
  });

  (poll.votes || []).forEach((vote: any) => {
    const firstChoice = (vote.rankings || []).find((ranking: PollRanking) => Number(ranking.rank) === 1);
    if (firstChoice) {
      counts[firstChoice.movieTmdbId] = (counts[firstChoice.movieTmdbId] || 0) + 1;
    }
  });

  return counts;
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
    fetchPollResults,
    completePoll,
    cancelPoll,
    pollName,
    setPollName,
    pollDeadline,
    setPollDeadline,
    voteRankings,
    runoffSelectionId,
    setMovieRank,
    setRunoffSelection,
    clearVoteRankings,
    submitVote,
    pollHistory,
    fetchPollHistory,
    deletePoll,
  } = usePollStore();

  const socket = useSocket(groupId);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [runoffMessage, setRunoffMessage] = useState("");
  const [menuOpenPollId, setMenuOpenPollId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const minDeadline = useMemo(() => getLocalDateTimeInputValue(new Date()), []);
  const deadlineDate = pollDeadline.split("T")[0] || "";
  const deadlineTime = pollDeadline.split("T")[1]?.slice(0, 5) || "";
  const minDeadlineDate = minDeadline.slice(0, 10);
  const minDeadlineTime = deadlineDate === minDeadlineDate ? minDeadline.slice(11, 16) : undefined;

  const handleMobileDeadlineDateChange = (date: string) => {
    if (!date) {
      setPollDeadline("");
      return;
    }

    setPollDeadline(`${date}T${deadlineTime || "23:59"}`);
  };

  const handleMobileDeadlineTimeChange = (time: string) => {
    const date = deadlineDate || minDeadlineDate;
    setPollDeadline(time ? `${date}T${time}` : `${date}T23:59`);
  };

  const withCurrentUserVoteState = (poll: any) => ({
    ...poll,
    hasCurrentUserVoted: !!poll?.votedMembers?.some((member: any) => member._id === userId),
  });

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
  }, [fetchCurrentPoll, groupId]);

  useEffect(() => {
    if (!loading && !currentPoll) {
      fetchPollHistory(groupId);
    }
  }, [loading, currentPoll, fetchPollHistory, groupId]);

  useEffect(() => {
    socket.on("poll:updated", (updatedPoll: any) => {
      if (currentPoll && updatedPoll._id === currentPoll._id) {
        setCurrentPoll(withCurrentUserVoteState(updatedPoll));
      }
    });

    socket.on("poll:completed", (data: any) => {
      if (currentPoll && data.pollId === currentPoll._id) {
        fetchPollResults(currentPoll._id);
        onPollStatusChange?.("completed");
      }
    });

    socket.on("poll:runoff", (data: any) => {
      if (data.poll) {
        setCurrentPoll(data.poll);
        setRunoffMessage("Tie detected. Vote again by choosing your #1 movie.");
        clearVoteRankings();
      }
    });

    socket.on("poll:cancelled", (data: any) => {
      if (currentPoll && data.pollId === currentPoll._id) {
        setCurrentPoll(null);
        clearVoteRankings();
        onPollStatusChange?.("none");
      }
    });

    return () => {
      socket.off("poll:updated");
      socket.off("poll:completed");
      socket.off("poll:runoff");
      socket.off("poll:cancelled");
    };
  }, [clearVoteRankings, currentPoll, fetchPollResults, onPollStatusChange, setCurrentPoll, socket, userId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenPollId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    clearVoteRankings();
    if (!currentPoll || !userId || currentPoll.status !== "active") return;

    const userVote = (currentPoll.votes || []).find((vote: any) => getUserIdFromVote(vote) === userId);
    if (!userVote) return;

    if ((currentPoll.round || 1) > 1) {
      const firstChoice = userVote.rankings?.find((ranking: PollRanking) => Number(ranking.rank) === 1);
      if (firstChoice) setRunoffSelection(firstChoice.movieTmdbId);
      return;
    }

    (userVote.rankings || []).forEach((ranking: PollRanking) => {
      setMovieRank(ranking.movieTmdbId, Number(ranking.rank));
    });
  }, [currentPoll?._id, currentPoll?.round, currentPoll?.votes?.length, currentPoll?.status, userId]);

  const isCreator = !!currentPoll && (() => {
    const creator = currentPoll.creator;
    if (!creator) return false;
    if (typeof creator === "string") return creator === userId;
    return creator._id === userId;
  })();

  const isRunoff = (currentPoll?.round || 1) > 1;
  const normalizedPollMovies = useMemo(
    () => (currentPoll?.movies || []).map((movie) => ({ ...movie, normalizedId: getMovieId(movie) })),
    [currentPoll?.movies]
  );

  const normalVoteValidation = useMemo(() => {
    if (!currentPoll || isRunoff) return "";
    const movieIds = normalizedPollMovies.map((movie) => movie.normalizedId);
    const ranks = movieIds.map((movieId) => Number(voteRankings[movieId]));
    if (movieIds.some((movieId) => !movieId) || ranks.some((rank) => !Number.isInteger(rank))) {
      return "Rank every movie before submitting.";
    }
    if (new Set(ranks).size !== ranks.length) {
      return "Each rank can only be used once.";
    }
    if (ranks.some((rank) => rank < 1 || rank > currentPoll.movies.length)) {
      return `Ranks must be between 1 and ${currentPoll.movies.length}.`;
    }
    return "";
  }, [currentPoll, isRunoff, normalizedPollMovies, voteRankings]);

  const displayedValidationMessage = normalVoteValidation || validationMessage;

  useEffect(() => {
    if (!isRunoff && !normalVoteValidation && validationMessage === "Rank every movie before submitting.") {
      setValidationMessage("");
    }
  }, [isRunoff, normalVoteValidation, validationMessage]);

  const buildRankingPayload = (): PollRanking[] => {
    if (!currentPoll) return [];
    if (isRunoff) {
      return runoffSelectionId ? [{ movieTmdbId: runoffSelectionId, rank: 1 }] : [];
    }
    return normalizedPollMovies.map((movie) => ({
      movieTmdbId: movie.normalizedId,
      rank: Number(voteRankings[movie.normalizedId]),
    }));
  };

  const handleSubmitPoll = async () => {
    if (selectedMoviesForVote.length < 2 || !pollName.trim()) return;
    try {
      await createPoll(groupId);
      onPollStatusChange?.("active");
    } catch (err) {
      console.error("Create poll error:", err);
    }
  };

  const handleCompletePoll = async () => {
    if (!currentPoll) return;
    const votedCount = currentPoll.votedMembers?.length ?? currentPoll.votes?.length ?? 0;
    const totalCount = currentPoll.totalMembers ?? votedCount;
    if (votedCount < totalCount) {
      const confirmed = window.confirm(`Only ${votedCount} of ${totalCount} members voted. Complete anyway?`);
      if (!confirmed) return;
    }

    setCompleting(true);
    try {
      const result = await completePoll(currentPoll._id);
      if (result.status === "completed") {
        onPollStatusChange?.("completed");
      } else if (result.status === "cancelled") {
        toast.info("Poll closed with no submitted votes.");
        onPollStatusChange?.("none");
      } else {
        setRunoffMessage("Tie detected. Vote again by choosing your #1 movie.");
      }
    } catch (err) {
      console.error("Complete poll error:", err);
    } finally {
      setCompleting(false);
    }
  };

  const handleCancelPoll = async () => {
    if (!currentPoll) return;
    const confirmed = window.confirm("Are you sure you want to cancel this poll?");
    if (!confirmed) return;

    try {
      await cancelPoll(currentPoll._id);
      toast.success("Poll cancelled.");
      onPollStatusChange?.("none");
    } catch (err: any) {
      toast.error(err?.response?.data?.msg || "Unable to cancel poll.");
    }
  };

  const handleSubmitVotes = async () => {
    if (!currentPoll) return;
    const message = isRunoff
      ? runoffSelectionId ? "" : "Choose one movie for the runoff."
      : normalVoteValidation;
    if (message) {
      setValidationMessage(message);
      return;
    }

    try {
      await submitVote(currentPoll._id, buildRankingPayload());
      setValidationMessage("");
    } catch (err: any) {
      setValidationMessage(err?.response?.data?.msg || "Unable to submit vote.");
    }
  };

  const handleResetCreate = () => {
    clearVoteSelections();
    setPollName("");
    setPollDeadline("");
  };

  const handleDeletePoll = async (pollId: string) => {
    await deletePoll(pollId);
    setMenuOpenPollId(null);
  };

  if (!loading && currentPoll?.status === "completed") {
    const isRunoffResult = currentPoll.result?.mode === "runoff" || currentPoll.result?.mode === "randomTieBreak";
    const scores = isRunoffResult ? getRunoffCounts(currentPoll) : getScoresFromResult(currentPoll);
    const ranked = [...currentPoll.movies].sort((a, b) => {
      const scoreA = scores[getMovieId(a)] || 0;
      const scoreB = scores[getMovieId(b)] || 0;
      return isRunoffResult ? scoreB - scoreA : scoreA - scoreB;
    });
    const winnerMovie = currentPoll.movies.find((movie) => getMovieId(movie) === currentPoll.winningMovieTmdbId) || ranked[0];
    const winnerId = getMovieId(winnerMovie);
    const uniqueVoterCount = new Set((currentPoll.votes || []).map((vote: any) => getUserIdFromVote(vote))).size;
    const randomTieBreak = !!currentPoll.result?.randomTieBreak;

    const votersByMovie: Record<string, string[]> = {};
    (currentPoll.votes || []).forEach((vote: any) => {
      const name = typeof vote.userId === "object" ? vote.userId.name : "";
      (vote.rankings || []).forEach((ranking: PollRanking) => {
        if (!votersByMovie[ranking.movieTmdbId]) votersByMovie[ranking.movieTmdbId] = [];
        if (name) votersByMovie[ranking.movieTmdbId].push(isRunoffResult ? name : `${name}: #${ranking.rank}`);
      });
    });

    const medalIcons = [
      <FaTrophy className="results-medal-icon gold" />,
      <FaMedal className="results-medal-icon silver" />,
      <FaMedal className="results-medal-icon bronze" />,
    ];

    return (
      <Modal bare isOpen onClose={closeVoteModal} ariaLabel="Poll results">
        <div className="VoteModal-content results-cinematic" data-testid="poll-results-modal">
          <button className="VoteModal-close-btn" onClick={closeVoteModal}>x</button>

          <div className="results-particles">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="results-particle" style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${3 + Math.random() * 4}s`,
              }} />
            ))}
          </div>

          <motion.div className="results-header-badge" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <HiSparkles className="results-sparkle-icon" />
            <span>Tonight's movie has been chosen</span>
            <HiSparkles className="results-sparkle-icon" />
          </motion.div>

          <motion.div className="results-poll-title" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {currentPoll.name}
          </motion.div>

          <motion.div className="results-winner-hero" initial={{ opacity: 0, scale: 0.7, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }}>
            <div className="results-winner-glow" />
            <motion.div className="results-crown" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
              <FaCrown />
            </motion.div>
            <motion.div className="results-winner-badge" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}>
              <FaTrophy /> WINNER
            </motion.div>

            {winnerMovie?.poster_path && (
              <div className="results-poster-container">
                <img src={getPosterUrl(winnerMovie.poster_path)} alt={winnerMovie.title} className="results-winner-poster" />
                <div className="results-poster-reflection" />
              </div>
            )}

            <h2 className="results-winner-title">{winnerMovie?.title}</h2>
            <div className="results-winner-subtitle">
              <FaStar className="results-star-icon" />
              <span>{isRunoffResult ? "Runoff Winner" : "Lowest score wins"}</span>
              <FaStar className="results-star-icon" />
            </div>

            {randomTieBreak && (
              <div className="VoteModal-random-note">
                Final tie remained after runoff. Winner selected randomly.
              </div>
            )}

            <div className="results-winner-stats">
              <div className="results-stat">
                <span className="results-stat-value">{scores[winnerId] || 0}</span>
                <span className="results-stat-label">{isRunoffResult ? "#1 votes" : "score"}</span>
              </div>
              <div className="results-stat-divider" />
              <div className="results-stat">
                <span className="results-stat-value">{uniqueVoterCount}</span>
                <span className="results-stat-label">voters</span>
              </div>
            </div>
          </motion.div>

          <div className="results-rankings-header">
            {isRunoffResult ? "Runoff #1 Vote Counts" : "Final Scores - Lowest Score Wins"}
          </div>

          <div className="results-rankings-list">
            {ranked.map((movie, index) => {
              const movieId = getMovieId(movie);
              const score = scores[movieId] || 0;
              const isWinner = movieId === currentPoll.winningMovieTmdbId;
              const topScore = scores[getMovieId(ranked[0])] || 0;
              const percentage = topScore > 0 ? Math.round((score / topScore) * 100) : 0;
              const voters = votersByMovie[movieId] || [];

              return (
                <motion.div key={movieId} className={`results-rank-card ${isWinner ? "results-rank-winner" : ""}`} initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }}>
                  <div className={`results-rank-position rank-${index + 1}`}>
                    {index < 3 ? medalIcons[index] : <span>#{index + 1}</span>}
                  </div>
                  {movie.poster_path && <img src={getPosterUrl(movie.poster_path)} alt={movie.title} className="results-rank-poster" />}
                  <div className="results-rank-info">
                    <div className="results-rank-title-row">
                      <span className="results-rank-name">{movie.title}</span>
                      {isWinner && <span className="results-rank-winner-tag"><FaTrophy /> Winner</span>}
                    </div>
                    <div className="results-rank-bar-container">
                      <div className={`results-rank-bar ${isWinner ? "bar-gold" : ""}`} style={{ width: `${Math.max(percentage, score > 0 ? 8 : 0)}%` }} />
                    </div>
                    {voters.length > 0 && (
                      <div className="results-rank-voters">
                        {voters.map((name, i) => <span key={i} className="results-rank-voter">{name}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="results-rank-score">
                    <span className="results-rank-score-num">{score}</span>
                    <span className="results-rank-score-label">{isRunoffResult ? "votes" : "score"}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="results-close-section">
            <button className="results-close-btn" onClick={closeVoteModal}>Close</button>
          </div>
        </div>
      </Modal>
    );
  }

  if (!loading && currentPoll?.status === "active") {
    const submitDisabled = isRunoff ? !runoffSelectionId : !!normalVoteValidation;
    const hasSubmittedVote = !!currentPoll.hasCurrentUserVoted;
    const votedMembers = currentPoll.votedMembers || [];
    const pendingMembers = currentPoll.pendingMembers || [];
    const waitingCount = pendingMembers.length;

    return (
      <Modal bare isOpen onClose={closeVoteModal} ariaLabel={currentPoll.name || "Poll"}>
        <div className="VoteModal-content">
          <button className="VoteModal-close-btn" onClick={closeVoteModal}>x</button>
          <h2 className="VoteModal-title">
            {currentPoll.name}
            {isRunoff && <span className="VoteModal-round-badge">Round {currentPoll.round}</span>}
          </h2>

          {isRunoff ? (
            <div className="VoteModal-runoff-banner">
              Tie detected. Vote again by choosing your #1 movie.
            </div>
          ) : (
            <p className="VoteModal-vote-hint">
              Rank every movie from 1 to {currentPoll.movies.length}. Lowest total score wins.
            </p>
          )}
          {runoffMessage && <div className="VoteModal-runoff-banner">{runoffMessage}</div>}
          {displayedValidationMessage && (
            <div className="VoteModal-error">{displayedValidationMessage}</div>
          )}

          {hasSubmittedVote ? (
            <div className="VoteModal-waiting-panel">
              <div className="VoteModal-submitted-badge">Vote submitted</div>
              <h3>Waiting for {waitingCount} more {waitingCount === 1 ? "member" : "members"} to vote.</h3>
              <p className="VoteModal-vote-hint">Results will be shown when the poll is completed.</p>
              {currentPoll.expiresAt && (
                <p className="VoteModal-deadline-note">
                  Deadline: {new Date(currentPoll.expiresAt).toLocaleString()}
                </p>
              )}
              <div className="VoteModal-progress-lists">
                <div className="VoteModal-progress-list">
                  <h4>Members who voted</h4>
                  {votedMembers.length === 0 ? (
                    <span className="VoteModal-progress-empty">No votes yet</span>
                  ) : votedMembers.map((member) => (
                    <span key={member._id} className="VoteModal-member-chip">{member.name}</span>
                  ))}
                </div>
                <div className="VoteModal-progress-list">
                  <h4>Members still waiting</h4>
                  {pendingMembers.length === 0 ? (
                    <span className="VoteModal-progress-empty">Everyone has voted</span>
                  ) : pendingMembers.map((member) => (
                    <span key={member._id} className="VoteModal-member-chip VoteModal-member-chip--pending">{member.name}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="VoteModal-movie-grid">
              {normalizedPollMovies.map((movie) => {
                const movieId = movie.normalizedId;
                const selected = runoffSelectionId === movieId;
                return (
                  <div
                    key={movieId}
                    className={`VoteModal-movie-wrapper ${selected ? "VoteModal-movie-selected" : ""}`}
                    onClick={() => isRunoff && setRunoffSelection(movieId)}
                  >
                    <div className="VoteModal-rank-card">
                      <img src={getPosterUrl(movie.poster_path)} alt={movie.title} className="VoteModal-rank-poster" />
                      <h3 className="VoteModal-rank-title">{movie.title}</h3>
                      {isRunoff ? (
                        <button
                          type="button"
                          className={`VoteModal-runoff-choice ${selected ? "selected" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRunoffSelection(movieId);
                          }}
                        >
                          {selected ? "Selected #1" : "Choose #1"}
                        </button>
                      ) : (
                        <label className="VoteModal-rank-select-label">
                          Priority
                          <select
                            className="VoteModal-rank-select"
                            data-testid={`poll-rank-select-${movieId}`}
                            value={Number.isInteger(voteRankings[movieId]) ? voteRankings[movieId] : ""}
                            onChange={(e) => {
                              setValidationMessage("");
                              setMovieRank(movieId, e.target.value ? Number(e.target.value) : "");
                            }}
                          >
                            <option value="">Select rank</option>
                            {currentPoll.movies.map((_, index) => (
                              <option key={index + 1} value={index + 1}>
                                {index + 1}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    {selected && (
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
          )}

          <div className="VoteModal-button-group" style={{ marginTop: 24 }}>
            {!hasSubmittedVote && (
              <button
                className="VoteModal-submit-btn"
                data-testid="poll-submit-vote"
                onClick={handleSubmitVotes}
                disabled={submitDisabled}
              >
                Submit Vote
              </button>
            )}
            {isCreator && (
              <>
                <button className="VoteModal-submit-btn" onClick={handleCompletePoll} disabled={completing}>
                  {completing ? "Calculating..." : "Complete Poll Now"}
                </button>
                <button className="VoteModal-reset-btn" onClick={handleCancelPoll}>Cancel Poll</button>
              </>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal bare isOpen onClose={closeVoteModal} ariaLabel="Create a new poll">
      <div className="VoteModal-content">
        <button className="VoteModal-close-btn" onClick={closeVoteModal}>x</button>
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
              <label className="VoteModal-create-label">
                Optional poll deadline
                <input
                  type="datetime-local"
                  className="VoteModal-poll-name-input VoteModal-deadline-input-desktop"
                  value={pollDeadline}
                  onChange={(e) => setPollDeadline(e.target.value)}
                  min={minDeadline}
                />
                <div className="VoteModal-mobile-deadline-fields">
                  <input
                    type="date"
                    className="VoteModal-poll-name-input VoteModal-mobile-deadline-input"
                    value={deadlineDate}
                    onChange={(e) => handleMobileDeadlineDateChange(e.target.value)}
                    min={minDeadlineDate}
                    aria-label="Poll deadline date"
                  />
                  <input
                    type="time"
                    className="VoteModal-poll-name-input VoteModal-mobile-deadline-input"
                    value={deadlineTime}
                    onChange={(e) => handleMobileDeadlineTimeChange(e.target.value)}
                    min={minDeadlineTime}
                    aria-label="Poll deadline time"
                  />
                </div>
              </label>

              <SearchBar onMovieSelect={handleMovieSelectForVote} />

              {selectedMoviesForVote.length > 0 && (
                <div className="VoteModal-selected-chips">
                  {selectedMoviesForVote.map((movie) => (
                    <div key={getMovieId(movie)} className="VoteModal-chip">
                      {movie.poster_path && <img src={getPosterUrl(movie.poster_path)} alt={movie.title} className="VoteModal-chip-poster" />}
                      <span className="VoteModal-chip-title">{movie.title}</span>
                      <button className="VoteModal-chip-remove" onClick={() => handleMovieSelectForVote(movie)}>x</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="VoteModal-selected-count">Selected Movies: {selectedMoviesForVote.length}/6</div>

              <div className="VoteModal-button-group">
                <button className="VoteModal-publish-btn" onClick={handleSubmitPoll} disabled={selectedMoviesForVote.length < 2 || !pollName.trim()}>
                  Publish
                </button>
                <button className="VoteModal-reset-btn" onClick={handleResetCreate} disabled={selectedMoviesForVote.length === 0 && !pollName.trim()}>
                  Cancel
                </button>
              </div>
            </div>

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
                              ? `Winner: ${poll.winnerTitle}${poll.randomTieBreak ? " (random tie-break)" : ""}`
                              : "No winner"}
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
                          ...
                        </button>
                        {menuOpenPollId === poll._id && (
                          <div className="VoteModal-history-dropdown">
                            <button onClick={() => handleDeletePoll(poll._id)}>Delete</button>
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
    </Modal>
  );
};

export default VoteModal;
