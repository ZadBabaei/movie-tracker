import React, { useState, useEffect, useCallback } from "react";
import "./VoteModal.css";
import MovieCard from "./MovieCard";
import SearchBar from "./SearchBar";
import { useModal } from "../context/ModalContext";
import axios from "axios";
import Badge from "./Badge";

const VoteModal = ({ groupId, onPollStatusChange }) => {
  const {
    closeVoteModal,
    selectedMoviesForVote,
    handleMovieSelectForVote,
    currentPoll,
    createPoll,
    fetchCurrentPoll,
    completePoll,
    cancelPoll,
    clearVoteSelections,
  } = useModal();

  const [votes, setVotes] = useState({});
  const [winningMovie, setWinningMovie] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [pollInitialized, setPollInitialized] = useState(false);
  const [isCreatingNewPoll, setIsCreatingNewPoll] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const initializePoll = useCallback(async () => {
    if (pollInitialized) return;

    try {
      setIsInitializing(true);
      let poll = await fetchCurrentPoll(groupId);

      if (poll) {
        // Convert poll votes to local format
        const voteMap = {};
        poll.votes.forEach((vote) => {
          const movieId = vote.movieId;
          if (!voteMap[movieId]) voteMap[movieId] = [];
          voteMap[movieId].push({
            userId: vote.userId._id || vote.userId,
            rank: vote.rank,
          });
        });
        setVotes(voteMap);

        // Check if current user is the creator
        const userId = localStorage.getItem("userId");
        setIsCreator(poll.creator._id === userId || poll.creator === userId);
      } else if (selectedMoviesForVote.length > 0) {
        // Only create new poll if we have movies and no active poll exists
        poll = await createPoll(groupId);
        setIsCreator(true); // Creator of new poll
      }

      setPollInitialized(true);
    } catch (error) {
      console.error("Failed to initialize poll:", error);
    } finally {
      setIsInitializing(false);
    }
  }, [
    groupId,
    fetchCurrentPoll,
    createPoll,
    selectedMoviesForVote,
    pollInitialized,
  ]);

  // Initialize poll on mount
  useEffect(() => {
    initializePoll();
  }, [initializePoll]);

  // Handle movie selection changes
  useEffect(() => {
    if (pollInitialized && !currentPoll && selectedMoviesForVote.length > 0) {
      // If we have movies but no poll, create one
      createPoll(groupId).catch(console.error);
    }
  }, [
    pollInitialized,
    currentPoll,
    selectedMoviesForVote,
    createPoll,
    groupId,
  ]);

  const calculateWinner = (votes) => {
    const movieScores = {};
    const rankCounts = {};

    Object.entries(votes).forEach(([movieId, movieVotes]) => {
      movieScores[movieId] = movieVotes.reduce(
        (sum, vote) => sum + vote.rank,
        0
      );
      rankCounts[movieId] = Array(4).fill(0);
      movieVotes.forEach((vote) => {
        rankCounts[movieId][vote.rank - 1]++;
      });
    });

    let winningScore = Infinity;
    let winningMovies = [];

    Object.entries(movieScores).forEach(([movieId, score]) => {
      if (score < winningScore) {
        winningScore = score;
        winningMovies = [movieId];
      } else if (score === winningScore) {
        winningMovies.push(movieId);
      }
    });

    if (winningMovies.length > 1) {
      for (let rank = 0; rank < 4; rank++) {
        const maxCount = Math.max(
          ...winningMovies.map((id) => rankCounts[id][rank])
        );
        winningMovies = winningMovies.filter(
          (id) => rankCounts[id][rank] === maxCount
        );
        if (winningMovies.length === 1) break;
      }
    }

    return winningMovies[0];
  };

  const handleVote = async (movieId, rank) => {
    if (!currentPoll) return;

    try {
      setIsLoading(true);
      setError(null);
      const token = localStorage.getItem("token");
      await axios.post(
        "/api/polls/vote",
        {
          pollId: currentPoll._id,
          movieId,
          rank,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Update local votes state
      const userId = localStorage.getItem("userId");
      setVotes((prev) => ({
        ...prev,
        [movieId]: [
          ...(prev[movieId] || []).filter((v) => v.userId !== userId),
          { userId, rank },
        ],
      }));
    } catch (error) {
      setError(error.response?.data?.msg || "Failed to submit vote");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinishVoting = async () => {
    if (!currentPoll || !winningMovie) return;

    try {
      setIsLoading(true);
      setError(null);
      await completePoll(currentPoll._id, winningMovie);
      if (onPollStatusChange) {
        onPollStatusChange("completed");
      }
      closeVoteModal();
    } catch (error) {
      if (error.response?.status === 403) {
        setError("Only the poll creator can complete the poll");
      } else {
        setError(error.response?.data?.msg || "Failed to complete poll");
      }
      setIsLoading(false);
    }
  };

  const handleCancelPoll = async () => {
    if (!currentPoll) return;

    try {
      setIsLoading(true);
      setError(null);
      await cancelPoll(currentPoll._id);
      if (onPollStatusChange) {
        onPollStatusChange("cancelled");
      }
      closeVoteModal();
    } catch (error) {
      if (error.response?.status === 403) {
        setError("Only the poll creator can cancel the poll");
      } else {
        setError(error.response?.data?.msg || "Failed to cancel poll");
      }
      setIsLoading(false);
    }
  };

  const handleCreateNewPoll = () => {
    setIsCreatingNewPoll(true);
    clearVoteSelections();
    setError(null);
    if (onPollStatusChange) {
      onPollStatusChange("none");
    }
    setPollInitialized(false);
    setIsInitializing(false);
  };

  const getUserVoteRank = (movieId) => {
    const userId = localStorage.getItem("userId");
    const movieVotes = votes[movieId] || [];
    const userVote = movieVotes.find((v) => v.userId === userId);
    return userVote ? userVote.rank : null;
  };

  // Update winning movie whenever votes change
  useEffect(() => {
    if (Object.keys(votes).length > 0) {
      const winner = calculateWinner(votes);
      setWinningMovie(winner);
    }
  }, [votes]);

  if (isInitializing) {
    return (
      <div className="VoteModal-overlay">
        <div className="VoteModal-content">
          <div className="VoteModal-loading">
            <div className="VoteModal-spinner" />
            <div>Initializing poll...</div>
          </div>
        </div>
      </div>
    );
  }

  const movies = currentPoll ? currentPoll.movies : selectedMoviesForVote;

  return (
    <div className="VoteModal-overlay">
      <div className="VoteModal-content">
        <button className="VoteModal-close-btn" onClick={closeVoteModal}>
          ×
        </button>
        <h2 className="VoteModal-title">Movie Voting</h2>

        {error && <div className="VoteModal-error">{error}</div>}

        {!currentPoll || isCreatingNewPoll ? (
          <div className="VoteModal-search">
            <SearchBar onMovieSelect={handleMovieSelectForVote} />
            <div className="VoteModal-selected-count">
              Selected Movies: {selectedMoviesForVote.length}/6
            </div>
          </div>
        ) : null}

        <div className="VoteModal-movie-grid">
          {movies.map((movie) => {
            const voteRank = getUserVoteRank(movie.movieId || movie.id);
            const isWinner = (movie.movieId || movie.id) === winningMovie;

            return (
              <div
                key={movie.movieId || movie.id}
                className="VoteModal-movie-wrapper"
              >
                <div className="VoteModal-card-shell">
                  <MovieCard
                    movie={{
                      ...movie,
                      id: movie.movieId || movie.id,
                      poster_path: movie.poster_path,
                    }}
                  />
                  {isWinner && <Badge type="winner" />}
                  <div className="VoteModal-rank-buttons">
                    {[1, 2, 3, 4].map((rank) => (
                      <button
                        key={rank}
                        className={`VoteModal-rank-btn ${
                          voteRank === rank ? "active" : ""
                        }`}
                        onClick={() =>
                          handleVote(movie.movieId || movie.id, rank)
                        }
                        disabled={!currentPoll}
                      >
                        {rank}
                      </button>
                    ))}
                  </div>
                  <div className="VoteModal-voters">
                    {(votes[movie.movieId || movie.id] || []).map(
                      (vote, idx) => (
                        <div key={idx} className="VoteModal-voter-badge">
                          {vote.userId.substring(0, 2)} ({vote.rank})
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="VoteModal-bottom">
          {isLoading && (
            <div className="VoteModal-loading-overlay">
              <div className="VoteModal-spinner" />
            </div>
          )}

          {currentPoll && !isCreatingNewPoll && isCreator && (
            <div className="VoteModal-actions">
              <button
                className="VoteModal-vote-btn"
                onClick={handleFinishVoting}
                disabled={!winningMovie || isLoading}
              >
                {isLoading ? "Processing..." : "Finish Voting"}
              </button>
              <button
                className="VoteModal-vote-btn cancel"
                onClick={handleCancelPoll}
                disabled={isLoading}
              >
                {isLoading ? "Processing..." : "Cancel Poll"}
              </button>
            </div>
          )}

          {!currentPoll && !isCreatingNewPoll && (
            <button
              className="VoteModal-vote-btn create-new"
              onClick={handleCreateNewPoll}
              disabled={isLoading}
            >
              Create New Poll
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoteModal;
