import React, { useEffect, useRef, useState } from "react";
import {
  FaBell,
  FaCheck,
  FaEye,
  FaHeart,
  FaInfoCircle,
  FaPlus,
  FaTrashAlt,
} from "react-icons/fa";
import "./MovieCard.css";

const getMovieTitle = (movie = {}) => movie.title || movie.name || "Untitled movie";

const getPosterUrl = (movie = {}) => {
  const path = movie.poster_path || movie.poster;
  if (!path) return "/default-avatar.png";
  return path.startsWith("http") ? path : `https://image.tmdb.org/t/p/w500${path}`;
};

const getRating = (movie = {}) => {
  const rating = movie.imdbRating ?? movie.vote_average;
  if (rating === undefined || rating === null || rating === "") return "N/A";
  const numericRating = Number(rating);
  return Number.isFinite(numericRating) ? numericRating.toFixed(1).replace(/\.0$/, "") : rating;
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

const MovieCard = ({
  movie = {},
  variant = "full",
  isInWatchlist = false,
  onAdd = null,
  onWatched = null,
  onNotify = null,
  onFavorite = null,
  onClick = null,
  children = null,
  footerContent = null,
  onDelete = null,
  onInfoClick = null,
  onMarkWatched = null,
  isFavorited = false,
  onFavoriteToggle = null,
}) => {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [favorited, setFavorited] = useState(isFavorited);
  const [imdbUrl, setImdbUrl] = useState("");
  const cardRef = useRef(null);

  useEffect(() => {
    setFavorited(isFavorited);
  }, [isFavorited]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        setOverlayOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, []);

  useEffect(() => {
    const existingImdbUrl = getImdbUrlFromMovie(movie);
    const tmdbMovieId = getTmdbMovieId(movie);
    const apiKey = import.meta.env.VITE_TMDB_API_KEY;

    setImdbUrl("");
    if (existingImdbUrl) {
      setImdbUrl(existingImdbUrl);
      return undefined;
    }
    if (!tmdbMovieId || !apiKey) return undefined;

    const controller = new AbortController();

    fetch(
      `https://api.themoviedb.org/3/movie/${encodeURIComponent(tmdbMovieId)}/external_ids?api_key=${apiKey}`,
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
  }, [movie]);

  const title = getMovieTitle(movie);
  const overview = movie.overview || "No overview available.";
  const rating = getRating(movie);
  const posterUrl = getPosterUrl(movie);
  const watchedHandler = onWatched || onMarkWatched;
  const favoriteHandler = onFavorite || onFavoriteToggle;

  const handleCardClick = () => {
    setOverlayOpen((open) => !open);
    if (onClick) onClick(movie);
  };

  const handleAction = (event, action) => {
    event.stopPropagation();
    if (action) action(movie);
  };

  const handleFavorite = (event) => {
    event.stopPropagation();
    setFavorited((current) => !current);
    if (favoriteHandler) favoriteHandler(movie);
  };

  const imdbMeta = (
    <>
      <span className="MovieCard-imdb imdb-icon">IMDb</span>
      <span className="MovieCard-rating rating">{rating}</span>
    </>
  );

  const renderImdbMeta = (className = "MovieCard-meta Group-movie-details") => {
    if (!imdbUrl) {
      return <div className={className}>{imdbMeta}</div>;
    }

    return (
      <a
        className={`${className} MovieCard-metaLink`}
        href={imdbUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        aria-label={`Open ${title} on IMDb`}
      >
        {imdbMeta}
      </a>
    );
  };

  if (variant === "posterOnly") {
    return (
      <div className="MovieCard MovieCard--posterOnly" onClick={handleCardClick}>
        <img src={posterUrl} alt={title} className="MovieCard-poster" />
      </div>
    );
  }

  if (variant === "voting") {
    return (
      <div className="MovieCard MovieCard--voting">
        <div className="MovieCard-posterWrap">
          <img src={posterUrl} alt={title} className="MovieCard-poster" />
        </div>
        <div className="MovieCard-votingMeta">
          {renderImdbMeta("MovieCard-votingMetaLink")}
        </div>
        {footerContent || children}
      </div>
    );
  }

  return (
    <article
      ref={cardRef}
      className={`MovieCard Group-movie-card ${overlayOpen ? "MovieCard--active" : ""}`}
      onClick={handleCardClick}
      data-testid="movie-card"
      data-movie-title={title}
    >
      <div className="MovieCard-posterWrap Group-poster-container">
        <img
          src={posterUrl}
          alt={title}
          className="MovieCard-poster Group-movie-poster"
          onError={(event) => {
            event.currentTarget.src = "/default-avatar.png";
          }}
        />

        {(isInWatchlist || onMarkWatched) && (
          <span className="MovieCard-watchlistBadge">
            <FaCheck /> Watchlist
          </span>
        )}

        <div className="MovieCard-overlay overlay">
          <div className="MovieCard-overlayContent">
            <p className="MovieCard-overview">{overview}</p>
            <div className="MovieCard-actions">
              {onAdd && (
                <button className="MovieCard-action" title="Add" onClick={(e) => handleAction(e, onAdd)}>
                  <FaPlus />
                </button>
              )}
              {watchedHandler && (
                <button
                  className="MovieCard-action"
                  title="Watched"
                  data-testid="movie-action-watched"
                  onClick={(e) => handleAction(e, watchedHandler)}
                >
                  <FaEye />
                </button>
              )}
              {onNotify && (
                <button className="MovieCard-action" title="Notify" onClick={(e) => handleAction(e, onNotify)}>
                  <FaBell />
                </button>
              )}
              {favoriteHandler && (
                <button
                  className={`MovieCard-action ${favorited ? "MovieCard-action--active" : ""}`}
                  title="Favorite"
                  onClick={handleFavorite}
                >
                  <FaHeart />
                </button>
              )}
              {onInfoClick && (
                <button
                  className="MovieCard-action"
                  title="Details"
                  data-testid="movie-action-details"
                  onClick={(e) => handleAction(e, onInfoClick)}
                >
                  <FaInfoCircle />
                </button>
              )}
              {onDelete && (
                <button className="MovieCard-action MovieCard-action--danger" title="Remove" onClick={(e) => handleAction(e, onDelete)}>
                  <FaTrashAlt />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="MovieCard-body">
        <h3 className="MovieCard-title movie-title">{title}</h3>
        {renderImdbMeta()}
        {footerContent || children}
      </div>
    </article>
  );
};

export default MovieCard;
