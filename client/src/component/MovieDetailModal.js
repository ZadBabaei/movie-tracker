import React, { useEffect, useState } from "react";
import { FaTimes, FaStar } from "react-icons/fa";
import CommentSection from "./CommentSection";
import "./MovieDetailModal.css";

const TMDB_KEY = process.env.REACT_APP_TMDB_API_KEY;

const getPosterUrl = (path) => {
  if (!path) return "/default-avatar.png";
  return path.startsWith("http") ? path : `https://image.tmdb.org/t/p/w500${path}`;
};

const extractTmdbId = (imdbID) => {
  if (!imdbID) return null;
  if (imdbID.startsWith("tmdb-")) return imdbID.replace("tmdb-", "");
  return imdbID;
};

const MovieDetailModal = ({ movie, onClose }) => {
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);

  const poster = movie.poster_path || movie.poster;
  const tmdbId = extractTmdbId(movie.imdbID);

  useEffect(() => {
    if (!tmdbId) {
      setLoadingDetails(false);
      return;
    }

    const fetchDetails = async () => {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits`
        );
        const data = await res.json();
        setDetails(data);
      } catch (err) {
        console.error("Failed to fetch TMDB details:", err);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchDetails();
  }, [tmdbId]);

  const director = details?.credits?.crew?.find((c) => c.job === "Director")?.name;
  const cast = details?.credits?.cast?.slice(0, 4).map((a) => a.name) || [];
  const year = details?.release_date ? new Date(details.release_date).getFullYear() : null;
  const overview = details?.overview;
  const genres = details?.genres?.map((g) => g.name) || [];
  const runtime = details?.runtime;

  const mongoId = movie._id;

  return (
    <div className="mdm-overlay" onClick={onClose}>
      <div className="mdm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="mdm-close-btn" onClick={onClose}>
          <FaTimes />
        </button>

        <div className="mdm-top">
          <img
            className="mdm-poster"
            src={getPosterUrl(poster)}
            alt={movie.title}
            onError={(e) => { e.target.src = "/default-avatar.png"; }}
          />

          <div className="mdm-info">
            <h2 className="mdm-title">
              {movie.title}
              {year && <span className="mdm-year"> ({year})</span>}
            </h2>

            <div className="mdm-rating">
              <FaStar className="mdm-star" />
              <span>{movie.vote_average ? `${Number(movie.vote_average).toFixed(1)} / 10` : "N/A"}</span>
            </div>

            {genres.length > 0 && (
              <div className="mdm-genres">
                {genres.map((g) => (
                  <span key={g} className="mdm-genre-tag">{g}</span>
                ))}
              </div>
            )}

            {runtime > 0 && (
              <p className="mdm-meta">
                <span className="mdm-label">Runtime:</span> {Math.floor(runtime / 60)}h {runtime % 60}m
              </p>
            )}

            {!loadingDetails && director && (
              <p className="mdm-meta">
                <span className="mdm-label">Director:</span> {director}
              </p>
            )}

            {!loadingDetails && cast.length > 0 && (
              <p className="mdm-meta">
                <span className="mdm-label">Cast:</span> {cast.join(", ")}
              </p>
            )}

            {!loadingDetails && overview && (
              <p className="mdm-overview">{overview}</p>
            )}

            {loadingDetails && (
              <p className="mdm-loading">Loading details...</p>
            )}
          </div>
        </div>

        {/* Watch metadata bar (shown on group pages) */}
        {(movie.watchedDate || movie.watchedWhere || movie.watchedWith?.length > 0) && (
          <div className="mdm-watch-meta">
            {movie.watchedDate && (
              <span className="mdm-watch-meta-item">
                📅 {new Date(movie.watchedDate).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric"
                })}
              </span>
            )}
            {movie.watchedWhere && (
              <span className="mdm-watch-meta-item">📍 {movie.watchedWhere}</span>
            )}
            {movie.watchedWith?.length > 0 && (
              <span className="mdm-watch-meta-item">
                👥 {movie.watchedWith.map((m) => m.name).join(", ")}
              </span>
            )}
          </div>
        )}

        {mongoId && (
          <div className="mdm-comments">
            <CommentSection movieId={mongoId} />
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieDetailModal;
