import React, { useEffect, useState, useCallback } from "react";
import "./VoteModal.css";
import { useModal } from "../context/ModalContext";
import SearchBar from "./SearchBar";
import MovieCard from "./MovieCard";
import Badge from "./Badge";

const VoteModal = ({ groupId }) => {
  const {
    currentPoll,
    closeVoteModal,
    handleMovieSelectForVote,
    selectedMoviesForVote,
    clearVoteSelections,
    createPoll,
    fetchCurrentPoll,
  } = useModal();

  const [userId, setUserId] = useState("");
  const [isCreator, setIsCreator] = useState(true);
  const [votes, setVotes] = useState({});
  const [winnerId, setWinnerId] = useState(null);
  const [activeVotes, setActiveVotes] = useState({}); // Track active votes for UI only

  useEffect(() => {
    const id = localStorage.getItem("userId");
    if (id) setUserId(id);
  }, []);

  const handleVote = (movieId, rank) => {
    setActiveVotes((prev) => {
      const newVotes = { ...prev };

      // If clicking the same number again, just remove it
      if (newVotes[movieId] === rank) {
        delete newVotes[movieId];
      } else {
        // Set the new rank for this movie
        newVotes[movieId] = rank;
      }

      return newVotes;
    });
  };

  const handleSubmitPoll = async () => {
    if (selectedMoviesForVote.length === 0) return;
    try {
      await createPoll(groupId);
    } catch (err) {
      console.error("Create poll error:", err);
    }
  };

  const calculateWinner = useCallback(() => {
    const scores = {};
    Object.entries(votes).forEach(([movieId, movieVotes]) => {
      scores[movieId] = movieVotes.reduce((sum, v) => sum + v.rank, 0);
    });
    const sorted = Object.entries(scores).sort((a, b) => a[1] - b[1]);
    setWinnerId(sorted[0]?.[0]);
  }, [votes]);

  useEffect(() => {
    calculateWinner();
  }, [calculateWinner]);

  const movies = currentPoll ? currentPoll.movies : selectedMoviesForVote;

  return (
    <div className="VoteModal-overlay">
      <div className="VoteModal-content">
        <button className="VoteModal-close-btn" onClick={closeVoteModal}>
          ×
        </button>
        <h2 className="VoteModal-title">Movie Voting</h2>

        {!currentPoll && (
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
                disabled={!isCreator || selectedMoviesForVote.length === 0}
              >
                Reset Selection
              </button>
            </div>
          </div>
        )}

        <div className="VoteModal-movie-grid">
          {movies.map((movie) => {
            const movieId = movie.movieId || movie.id;
            const rank = activeVotes[movieId];
            const isWinner = movieId === winnerId;

            return (
              <div key={movieId} className="VoteModal-movie-wrapper">
                <MovieCard
                  movie={movie}
                  onDelete={isCreator ? handleMovieSelectForVote : undefined}
                />
                {isWinner && <Badge type="winner" />}
                <div className="VoteModal-rank-buttons">
                  {[1, 2, 3, 4].map((r) => (
                    <button
                      key={r}
                      className={`VoteModal-rank-btn ${
                        rank === r ? "active" : ""
                      }`}
                      onClick={() => handleVote(movieId, r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {isCreator && currentPoll && (
          <button
            className="VoteModal-reset-btn VoteModal-poll-reset"
            onClick={clearVoteSelections}
          >
            Reset Poll
          </button>
        )}
      </div>
    </div>
  );
};

export default VoteModal;
