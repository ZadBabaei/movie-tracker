import "./MovieModal.css";

const MovieModal = ({ movie, onClose }) => {
  if (!movie) return null;

  return (
    <div className="movie-modal-overlay" onClick={onClose}>
      <div className="movie-modal-content" onClick={(e) => e.stopPropagation()}>
        <img
          src={
            movie.poster_path?.startsWith("http")
              ? movie.poster_path
              : `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          }
          alt={movie.title}
        />
        <div className="movie-info">
          <h2>{movie.title}</h2>
          <p>Rating: ⭐ {movie.vote_average}/10</p>
          <p>Description: This is a placeholder for a movie overview.</p>
        </div>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default MovieModal;
