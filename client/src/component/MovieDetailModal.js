import React, { useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";
import CommentSection from "./CommentSection";
import "./MovieDetailModal.css";

const TMDB_KEY = process.env.REACT_APP_TMDB_API_KEY;

const getPosterUrl = (path) => {
  if (!path) return "/default-avatar.png";
  return path.startsWith("http") ? path : `https://image.tmdb.org/t/p/w500${path}`;
};

const getTmdbMovieId = (movie = {}) => {
  const explicitId = movie.tmdbId || movie.movieTmdbId || movie.tmdbMovieId;
  if (explicitId) return explicitId.toString();

  const imdbId = movie.imdbID || movie.imdb_id;
  if (typeof imdbId === "string" && imdbId.startsWith("tt")) {
    return "";
  }
  if (typeof imdbId === "string" && imdbId.startsWith("tmdb-")) {
    return imdbId.replace("tmdb-", "");
  }

  const id = movie.movieId || movie.id;
  if (typeof id === "string" && id.startsWith("tt")) {
    return "";
  }
  return id ? id.toString() : "";
};

const getImdbUrlFromMovie = (movie = {}) => {
  const imdbId = movie.imdb_id || movie.imdbID || movie.id;
  return typeof imdbId === "string" && imdbId.startsWith("tt")
    ? `https://www.imdb.com/title/${imdbId}/`
    : "";
};

const getDisplayRating = (movie = {}, details = {}) => {
  const rating =
    movie.imdbRating ??
    movie.imdb_rating ??
    details?.imdbRating ??
    movie.vote_average ??
    details?.vote_average;

  if (rating === undefined || rating === null || rating === "") return "N/A";

  const numericRating = Number(rating);
  const formattedRating = Number.isFinite(numericRating)
    ? numericRating.toFixed(1)
    : String(rating).trim();

  return formattedRating ? `${formattedRating} / 10` : "N/A";
};

const formatWatchedDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatWatchedWith = (watchedWith) => {
  if (!watchedWith) return "";
  if (typeof watchedWith === "string") return watchedWith;
  if (!Array.isArray(watchedWith)) return "";
  return watchedWith
    .map((member) => member?.name || member)
    .filter(Boolean)
    .join(", ");
};

const MovieDetailModal = ({ movie, onClose }) => {
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [imdbUrl, setImdbUrl] = useState("");

  const poster = movie.poster_path || movie.poster;
  const tmdbId = getTmdbMovieId(movie);
  const watchedDate = formatWatchedDate(movie.watchedAt || movie.watchedDate || movie.createdAt);
  const watchedLocation = movie.watchedLocation || movie.watchedWhere;
  const watchedWith = formatWatchedWith(movie.watchedWith);
  const watchedNotes = movie.watchedNotes;
  const hasWatchMetadata = watchedDate || watchedLocation || watchedWith || watchedNotes;

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

  useEffect(() => {
    const existingImdbUrl = getImdbUrlFromMovie(movie);

    setImdbUrl("");
    if (existingImdbUrl) {
      setImdbUrl(existingImdbUrl);
      return undefined;
    }
    if (!tmdbId || !TMDB_KEY) return undefined;

    const controller = new AbortController();

    fetch(
      `https://api.themoviedb.org/3/movie/${encodeURIComponent(tmdbId)}/external_ids?api_key=${TMDB_KEY}`,
      { signal: controller.signal }
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.imdb_id) {
          setImdbUrl(`https://www.imdb.com/title/${data.imdb_id}/`);
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") setImdbUrl("");
      });

    return () => controller.abort();
  }, [movie, tmdbId]);

  const director = details?.credits?.crew?.find((c) => c.job === "Director")?.name;
  const cast = details?.credits?.cast?.slice(0, 4).map((a) => a.name) || [];
  const year = details?.release_date ? new Date(details.release_date).getFullYear() : null;
  const overview = details?.overview;
  const genres = details?.genres?.map((g) => g.name) || [];
  const runtime = details?.runtime;
  const rating = getDisplayRating(movie, details);

  const mongoId = movie._id;
  const imdbRatingContent = (
    <>
      <span className="mdm-imdb-badge">IMDb</span>
      <span className="mdm-rating-text">{rating}</span>
    </>
  );

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

            {imdbUrl ? (
              <a
                className="mdm-rating mdm-rating-link"
                href={imdbUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Open ${movie.title} on IMDb`}
              >
                {imdbRatingContent}
              </a>
            ) : (
              <div className="mdm-rating">{imdbRatingContent}</div>
            )}

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
        {hasWatchMetadata && (
          <div className="mdm-watch-meta">
            {watchedDate && (
              <span className="mdm-watch-meta-item">
                <span className="mdm-label">Watched on:</span> {watchedDate}
              </span>
            )}
            {watchedLocation && (
              <span className="mdm-watch-meta-item">
                <span className="mdm-label">Location:</span> {watchedLocation}
              </span>
            )}
            {watchedWith && (
              <span className="mdm-watch-meta-item">
                <span className="mdm-label">Watched with:</span> {watchedWith}
              </span>
            )}
            {watchedNotes && (
              <span className="mdm-watch-meta-item mdm-watch-meta-item--wide">
                <span className="mdm-label">Notes:</span> {watchedNotes}
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
