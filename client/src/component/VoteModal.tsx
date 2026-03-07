import React, { useEffect, useState } from "react";
import "./VoteModal.css";
import { useModalStore } from "../store/useModalStore";
import { usePollStore } from "../store/usePollStore";
import SearchBar from "./SearchBar";
import MovieCard from "./MovieCard";
import Badge from "./Badge";
import axios from "axios";

interface VoteModalProps {
  groupId: string;
  onPollStatusChange?: (status: string) => void;
}

const VoteModal: React.FC<VoteModalProps> = ({ groupId }) => {
  const { closeVoteModal } = useModalStore();
  const {
    currentPoll,
    selectedMoviesForVote,
    handleMovieSelectForVote,
    clearVoteSelections,
    createPoll,
    fetchCurrentPoll,
  } = usePollStore();

  const [userId, setUserId] = useState("");
  const [isCreator, setIsCreator] = useState(true);

  useEffect(() => {
    const id = localStorage.getItem("userId");
    if (id) setUserId(id);
  }, []);

  const handleVote = async (movieId: string, number: number) => {
    if (!currentPoll) return;

    try {
      await axios.post(
        "/api/polls/vote",
        { pollId: currentPoll._id, movieId, rank: number },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      await fetchCurrentPoll(groupId);
    } catch (err) {
      console.error("Vote error:", err);
    }
  };

  const getUserVoteRank = (movieId: string): number | null => {
    const vote = currentPoll?.votes?.find(
      (v: any) => v.userId._id === userId && v.movieTmdbId === movieId
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

  const movies = currentPoll ? currentPoll.movies : selectedMoviesForVote;

  return (
    <div className="VoteModal-overlay">
      <div className="VoteModal-content">
        <button className="VoteModal-close-btn" onClick={closeVoteModal}>×</button>
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
          {movies.map((movie: any) => {
            const movieId = movie.movieId || movie.id;
            const selected = getUserVoteRank(movieId);
            const isWinner = movieId === currentPoll?.winningMovieTmdbId;

            return (
              <div key={movieId} className="VoteModal-movie-wrapper">
                <MovieCard
                  movie={movie}
                  onDelete={isCreator ? handleMovieSelectForVote : undefined}
                />
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

        {isCreator && currentPoll && (
          <button className="VoteModal-reset-btn VoteModal-poll-reset" onClick={clearVoteSelections}>
            Reset Poll
          </button>
        )}
      </div>
    </div>
  );
};

export default VoteModal;
