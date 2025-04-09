import React from "react";
import "../pages/GroupChat.css";
import MovieCard from "../component/MovieCard";
import SearchBar from "../component/SearchBar";
import { useModal } from "../context/ModalContext";

const SidebarSuggestPanel = ({ onMovieSelect }) => {
  const { suggestedMovies, openVoteModal } = useModal();

  return (
    <div className="SidebarPanel-container">
      {/* Sticky header search */}
      <div className="SidebarPanel-search">
        <SearchBar onMovieSelect={onMovieSelect} />
      </div>

      {/* Live suggested movies list */}
      <div className="SidebarPanel-suggested">
        <h3>Suggested Movies</h3>

        {suggestedMovies.length === 0 && (
          <p className="SidebarPanel-empty">No suggestions yet.</p>
        )}

        <div className="SidebarPanel-movie-list">
          {suggestedMovies.map(({ movie, suggestedBy }, index) => (
            <div
              key={movie.id + "-sidebar"}
              className="SidebarPanel-movie-item"
            >
              <div className="SidebarPanel-card">
                <img
                  src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`}
                  alt={movie.title}
                />
                <div className="SidebarPanel-card-info">
                  <p className="SidebarPanel-title">{movie.title}</p>
                  <div className="SidebarPanel-badge">
                    Suggested by: {suggestedBy.initials}
                  </div>
                  <div className="SidebarPanel-actions">
                    <button className="SidebarPanel-btn remove">❌</button>
                    <button className="SidebarPanel-btn replace">📝</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky vote button */}
      {suggestedMovies.length > 1 && (
        <div className="SidebarPanel-vote-box">
          <button className="SidebarPanel-vote-btn" onClick={openVoteModal}>
            ✅ Let's Vote
          </button>
        </div>
      )}
    </div>
  );
};

export default SidebarSuggestPanel;
