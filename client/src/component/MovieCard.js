import React, { useState } from "react";
import { FaTrashAlt, FaInfoCircle, FaHeart } from "react-icons/fa";
import "./MovieCard.css";

const MovieCard = ({ movie, onDelete }) => {
     const [favorited, setFavorited] = useState(false);

     const toggleFavorite = () => {
       setFavorited((prev) => !prev);
     };
  return (
    <div className="Group-movie-card">
      <div className="Group-poster-container">
        <img
          src={
            movie.poster_path
              ? `https://image.tmdb.org/t/p/w300${movie.poster_path}`
              : "https://via.placeholder.com/300x450?text=No+Image"
          }
          alt={movie.title}
          className="Group-movie-poster"
        />
        <div className="overlay">
          <FaInfoCircle
            className="icon info-icon"
            onClick={() => alert("Info modal coming soon")}
          />
          <FaHeart
            className={`icon heart-icon ${favorited ? "favorited" : ""}`}
            onClick={toggleFavorite}
          />
          <FaTrashAlt className="icon delete-icon" onClick={() => onDelete(movie)} />
        </div>
      </div>
      <div className="Group-movie-details">
        <h3>{movie.title}</h3>
        <p>Release: {movie.release_date?.substring(0, 4) || "N/A"}</p>
        <p>Rating: {movie.vote_average}/10</p>
      </div>
    </div>
  );
};

export default MovieCard;
