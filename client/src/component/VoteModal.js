import React from "react";
import "./VoteModal.css";
import MovieCard from "../component/MovieCard";
import { useModal } from "../context/ModalContext";

const VoteModal = () => {
  const { suggestedMovies, votes, castVote, closeVoteModal } = useModal();

  const currentUser = {
    name: "Zad Babaei",
    initials: "ZB",
    profilePic: null,
    userId: "user-zad",
  };

  const handleVote = (movieId) => {
    castVote(movieId, currentUser);
  };

  return (
    <div className="VoteModal-overlay">
      <div className="VoteModal-content">
        <button className="VoteModal-close-btn" onClick={closeVoteModal}>
          ✖
        </button>

        <h2 className="VoteModal-title">Vote for Tonight's Movie</h2>

        <div className="VoteModal-movie-grid">
          {suggestedMovies.map(({ movie, suggestedBy }, index) => {
            const movieVotes = votes[movie.id] || [];
            const hasVoted = movieVotes.some(
              (v) => v.userId === currentUser.userId
            );

            return (
              <div
                key={movie.id + "-vote-" + index}
                className="VoteModal-movie-wrapper"
              >
                <div className="VoteModal-card-shell">
                  <div className="VoteModal-badge">
                    {suggestedBy.profilePic ? (
                      <img
                        src={suggestedBy.profilePic}
                        alt={suggestedBy.name}
                      />
                    ) : (
                      <span>{suggestedBy.initials}</span>
                    )}
                  </div>

                  <MovieCard
                    movie={movie}
                    onDelete={() => {}}
                    onInfoClick={() => {}}
                  />

                  <div className="VoteModal-bottom">
                    <button
                      className="VoteModal-vote-btn"
                      onClick={() => handleVote(movie.id)}
                      disabled={hasVoted}
                    >
                      {hasVoted ? "Voted ✅" : "Vote 🎬"}
                    </button>

                    <div className="VoteModal-voter-list">
                      {movieVotes.map((v, i) => (
                        <div
                          key={v.userId + "-voter-" + i}
                          className="VoteModal-voter"
                        >
                          {v.profilePic ? (
                            <img src={v.profilePic} alt={v.name} />
                          ) : (
                            <span>{v.initials}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VoteModal;
