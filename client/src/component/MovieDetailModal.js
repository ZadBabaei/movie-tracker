import React, { useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";
import apiClient from "../api/apiClient";
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

const formatGroupRating = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${numericValue.toFixed(1)} / 10` : "N/A";
};

const getInitials = (name = "") =>
  name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

const MovieDetailModal = ({ movie, groupId = null, onRatingSaved = null, onClose }) => {
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [imdbUrl, setImdbUrl] = useState("");
  const [showRatingPanel, setShowRatingPanel] = useState(false);
  const [selectedRating, setSelectedRating] = useState(movie.currentUserRating || 8);
  const [averageRating, setAverageRating] = useState(movie.averageRating ?? null);
  const [ratingCount, setRatingCount] = useState(movie.ratingCount || 0);
  const [currentUserRating, setCurrentUserRating] = useState(movie.currentUserRating ?? null);
  const [memberRatings, setMemberRatings] = useState(movie.ratings || []);
  const [showAllRatings, setShowAllRatings] = useState(false);
  const [savingRating, setSavingRating] = useState(false);
  const [ratingError, setRatingError] = useState("");

  const poster = movie.poster_path || movie.poster;
  const tmdbId = getTmdbMovieId(movie);
  const watchedDate = formatWatchedDate(movie.watchedAt || movie.watchedDate || movie.createdAt);
  const watchedLocation = movie.watchedLocation || movie.watchedWhere;
  const watchedWith = formatWatchedWith(movie.watchedWith);
  const watchedNotes = movie.watchedNotes;
  const hasWatchMetadata = watchedDate || watchedLocation || watchedWith || watchedNotes;
  const canRateHistoryItem = Boolean(groupId && movie.historyItemId);

  useEffect(() => {
    setAverageRating(movie.averageRating ?? null);
    setRatingCount(movie.ratingCount || 0);
    setCurrentUserRating(movie.currentUserRating ?? null);
    setMemberRatings(movie.ratings || []);
    setSelectedRating(movie.currentUserRating || 8);
    setShowRatingPanel(false);
    setShowAllRatings(false);
    setRatingError("");
  }, [movie]);

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
  const groupRating = ratingCount > 0 ? formatGroupRating(averageRating) : "N/A";
  const visibleMemberRatings = showAllRatings ? memberRatings : memberRatings.slice(0, 4);
  const hasHiddenRatings = memberRatings.length > 4;
  const rateButtonText = currentUserRating ? "Update my rating" : "Rate this movie";

  const handleSubmitRating = async () => {
    if (!canRateHistoryItem) return;

    const ratingValue = Number(selectedRating);
    if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 10) {
      setRatingError("Select a rating from 1 to 10.");
      return;
    }

    setSavingRating(true);
    setRatingError("");
    try {
      const token = localStorage.getItem("token");
      const res = await apiClient.post(
        `/api/groups/${groupId}/history/${movie.historyItemId}/rating`,
        { rating: ratingValue },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAverageRating(res.data.averageRating ?? null);
      setRatingCount(res.data.ratingCount || 0);
      setCurrentUserRating(res.data.currentUserRating ?? ratingValue);
      setSelectedRating(res.data.currentUserRating ?? ratingValue);
      setMemberRatings(res.data.ratings || memberRatings);
      setShowRatingPanel(false);
      onRatingSaved?.(movie.historyItemId, {
        averageRating: res.data.averageRating ?? null,
        ratingCount: res.data.ratingCount || 0,
        currentUserRating: res.data.currentUserRating ?? ratingValue,
        ratings: res.data.ratings || memberRatings,
      });
    } catch (err) {
      setRatingError(err.response?.data?.msg || "Failed to save rating.");
    } finally {
      setSavingRating(false);
    }
  };

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

            {canRateHistoryItem && (
              <div className="mdm-group-rating-row">
                <div className="mdm-rating mdm-group-rating">
                  <span className="mdm-group-badge">Group</span>
                  <span className="mdm-rating-text">{groupRating}</span>
                  {ratingCount > 0 && (
                    <span className="mdm-rating-count">
                      {ratingCount} {ratingCount === 1 ? "rating" : "ratings"}
                    </span>
                  )}
                </div>
              </div>
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

        {canRateHistoryItem && (
          <section className="mdm-group-ratings-section">
            <div className="mdm-group-ratings-header">
              <h3>Group Ratings</h3>
            </div>

            <div className="mdm-group-ratings-content">
              <div className="mdm-member-ratings">
                {memberRatings.length > 0 ? (
                  <>
                    <div className="mdm-member-rating-list">
                      {visibleMemberRatings.map((entry) => (
                        <div className="mdm-member-rating" key={entry.userId}>
                          <span className="mdm-member-rating-avatar">
                            {entry.avatar ? (
                              <img src={entry.avatar} alt={entry.name} />
                            ) : (
                              getInitials(entry.name)
                            )}
                          </span>
                          <span className="mdm-member-rating-name">{entry.name}</span>
                          <strong>{entry.rating} / 10</strong>
                        </div>
                      ))}
                    </div>

                    {hasHiddenRatings && (
                      <button
                        type="button"
                        className="mdm-ratings-toggle"
                        onClick={() => setShowAllRatings((open) => !open)}
                      >
                        {showAllRatings ? "Show less" : "Show all ratings"}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="mdm-no-ratings">No group ratings yet. Be the first.</p>
                )}
              </div>

              <button
                type="button"
                className="mdm-rate-btn"
                onClick={() => {
                  setSelectedRating(currentUserRating || selectedRating || 8);
                  setShowRatingPanel((open) => !open);
                  setRatingError("");
                }}
              >
                {rateButtonText}
              </button>
            </div>

            {showRatingPanel && (
              <div className="mdm-rating-panel">
                <div className="mdm-rating-panel-header">
                  <span>Your rating</span>
                  {currentUserRating && (
                    <strong>{currentUserRating} / 10</strong>
                  )}
                </div>

                <div className="mdm-rating-options" role="radiogroup" aria-label="Movie rating">
                  {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`mdm-rating-option ${
                        Number(selectedRating) === value ? "mdm-rating-option--selected" : ""
                      }`}
                      onClick={() => {
                        setSelectedRating(value);
                        setRatingError("");
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>

                {ratingError && <p className="mdm-rating-error">{ratingError}</p>}

                <div className="mdm-rating-actions">
                  <button
                    type="button"
                    className="mdm-rating-cancel"
                    onClick={() => {
                      setShowRatingPanel(false);
                      setRatingError("");
                    }}
                    disabled={savingRating}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="mdm-rating-submit"
                    onClick={handleSubmitRating}
                    disabled={savingRating}
                  >
                    {savingRating ? "Saving..." : currentUserRating ? "Update rating" : "Submit rating"}
                  </button>
                </div>
              </div>
            )}
          </section>
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
