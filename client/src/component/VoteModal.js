import React, { useEffect, useState, useCallback } from "react";
import "./VoteModal.css";
import { useModal } from "../context/ModalContext";
import SearchBar from "./SearchBar";
import MovieCard from "./MovieCard";
import Badge from "./Badge";
import axios from "axios";

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
  const [activeVotes, setActiveVotes] = useState({}); 

  useEffect(() => {
    const id = localStorage.getItem("userId");
    if (id) setUserId(id);
  }, []);

  const handleVote = async (movieId, number) => {

    console.log("Button clicked:", number);
    console.log("For movie:", movieId);

    if (!currentPoll) {
      console.log("No current poll available");
      return;
    }

    try {
      await axios.post(
        "/api/polls/vote",
        {
          pollId: currentPoll._id,
          movieId,
          rank: number,
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );


      await fetchCurrentPoll(groupId);
    } catch (err) {
      console.error("Selection error:", err);
    }
  };
const getUserVoteRank = (movieId) => {
  const vote = currentPoll?.votes?.find(
    (v) => v.userId._id === userId && v.movieTmdbId === movieId
  );
  return vote?.rank || null;
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
            const selected = getUserVoteRank(movieId);

            const isWinner = movieId === winnerId;

            return (
              <div key={movieId} className="VoteModal-movie-wrapper">
                <MovieCard
                  movie={movie}
                  onDelete={isCreator ? handleMovieSelectForVote : undefined}
                />
                {isWinner && <Badge type="winner" />}
                <div className="VoteModal-rank-buttons">
                  <button
                    className={`VoteModal-rank-btn first-rank ${
                      selected === 1 ? "active" : ""
                    }`}
                    onClick={() => handleVote(movieId, 1)}
                  >
                    1
                  </button>
                  <button
                    className={`VoteModal-rank-btn second-rank ${
                      selected === 2 ? "active" : ""
                    }`}
                    onClick={() => handleVote(movieId, 2)}
                  >
                    2
                  </button>
                  <button
                    className={`VoteModal-rank-btn third-rank ${
                      selected === 3 ? "active" : ""
                    }`}
                    onClick={() => handleVote(movieId, 3)}
                  >
                    3
                  </button>
                  <button
                    className={`VoteModal-rank-btn fourth-rank ${
                      selected === 4 ? "active" : ""
                    }`}
                    onClick={() => handleVote(movieId, 4)}
                  >
                    4
                  </button>
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
