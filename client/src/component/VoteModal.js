import React, { useState } from "react";
import "./VoteModal.css";
import MovieCard from "../component/MovieCard";
import { useModal } from "../context/ModalContext";

const VoteModal = () => {
  const { suggestedMovies, closeVoteModal } = useModal();

  const [selectedMovies, setSelectedMovies] = useState([]);

  const handleClick = (movie) => {
    setSelectedMovies((prevList) => {
      const exists = prevList.find((m) => m.id === movie.id);
      if (exists) return prevList; // prevent re-adding

      if (prevList.length >= 4) return prevList; // max 4

      return [...prevList, movie];
    });
  };

  return (
    <div className="VoteModal-overlay">
      <div className="VoteModal-content">
        <button className="VoteModal-close-btn" onClick={closeVoteModal}>
          ✖
        </button>

        <h2 className="VoteModal-title">Click Movies to Add to Your List</h2>

        <div
          style={{
            textAlign: "center",
            marginBottom: "1rem",
            color: "white",
          }}
        >
          Selected: {selectedMovies.length} / 4
        </div>

        <div className="VoteModal-movie-grid">
          {suggestedMovies.map(({ movie, suggestedBy }) => {
            const index = selectedMovies.findIndex((m) => m.id === movie.id);
            const rank = index !== -1 ? index + 1 : null;

            return (
              <div
                key={movie.id}
                className="VoteModal-movie-wrapper"
                onClick={() => handleClick(movie)}
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

                  {rank && <div className="VoteModal-rank-overlay">{rank}</div>}
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
