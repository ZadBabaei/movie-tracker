import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { AxiosError } from "axios";
import { FaImdb, FaPlus, FaStar } from "react-icons/fa";
import { toast } from "react-toastify";
import apiClient from "../api/apiClient";
import { addToWatchlist } from "../api/watchlistApi";
import VerticalNavbar from "../component/VerticalNavbar";
import "./ComingSoon.css";

type ComingSoonMovie = {
  id: number;
  imdbID: string;
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
  type: string;
  watchmodeId?: number;
  tmdbId?: number;
  imdbId?: string;
  sourceNames?: string[];
  webUrl?: string;
  revenue?: number;
  popularity?: number;
  runtime?: number;
  genres?: string[];
};

type ImdbLookupResponse = {
  imdbId: string;
  imdbUrl: string;
};

type ApiErrorResponse = {
  msg?: string;
};

const REGIONS = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
];

const RELEASE_WINDOW_DAYS = 45;
const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

const addDaysKey = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
};

const isWithinReleaseWindow = (releaseDate: string | undefined, days: number) => {
  if (!releaseDate || !RELEASE_DATE_PATTERN.test(releaseDate)) return false;
  const parsedDate = new Date(`${releaseDate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || toDateKey(parsedDate) !== releaseDate) {
    return false;
  }

  const todayKey = toDateKey();
  const maxDateKey = addDaysKey(days);
  return releaseDate >= todayKey && releaseDate <= maxDateKey;
};

const getPosterUrl = (path: string) => {
  if (!path) return "/default-avatar.png";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) return `https://image.tmdb.org/t/p/w500${path}`;
  return "/default-avatar.png";
};

const getBackdropUrl = (movie: ComingSoonMovie) => {
  const path = movie.backdrop_path || movie.poster_path;
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) return `https://image.tmdb.org/t/p/original${path}`;
  return "";
};

const formatLongDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

const formatShortDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "TBA";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const daysUntil = (value: string) => {
  if (!value) return null;
  const target = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(`${toDateKey()}T00:00:00.000Z`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

const countdownLabel = (value: string) => {
  const days = daysUntil(value);
  if (days === null) return "";
  if (days <= 0) return "Streaming today";
  if (days === 1) return "Arrives tomorrow";
  return `Arrives in ${days} days`;
};

const formatRevenue = (revenue?: number) => {
  if (!revenue || revenue < 1_000_000) return "";
  if (revenue >= 1_000_000_000) return `$${(revenue / 1_000_000_000).toFixed(1)}B`;
  return `$${Math.round(revenue / 1_000_000)}M`;
};

const blockbusterLabel = (movie: ComingSoonMovie) => {
  const revenue = movie.revenue || 0;
  if (revenue >= 400_000_000) return "Global Blockbuster";
  if (revenue >= 100_000_000) return "Box Office Hit";
  if ((movie.popularity || 0) >= 80) return "Trending Now";
  return "";
};

const formatRuntime = (runtime?: number) => {
  if (!runtime) return "";
  const hours = Math.floor(runtime / 60);
  const minutes = runtime % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
};

const boxOfficeScore = (movie: ComingSoonMovie) =>
  (movie.revenue || 0) * 1000 + (movie.popularity || 0);

const ComingSoon: React.FC = () => {
  const [movies, setMovies] = useState<ComingSoonMovie[]>([]);
  const [region, setRegion] = useState("CA");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingIds, setAddingIds] = useState<Set<number>>(new Set());

  const selectedRegionLabel = useMemo(
    () => REGIONS.find((option) => option.value === region)?.label || region,
    [region]
  );

  const visibleMovies = useMemo(
    () =>
      movies
        .filter((movie) => isWithinReleaseWindow(movie.release_date, RELEASE_WINDOW_DAYS))
        .sort((a, b) => {
          const dateCompare = a.release_date.localeCompare(b.release_date);
          if (dateCompare !== 0) return dateCompare;
          return boxOfficeScore(b) - boxOfficeScore(a);
        }),
    [movies]
  );

  const featured = useMemo(() => {
    if (visibleMovies.length === 0) return null;
    return visibleMovies.reduce((best, movie) =>
      boxOfficeScore(movie) > boxOfficeScore(best) ? movie : best
    );
  }, [visibleMovies]);

  const calendar = useMemo(() => {
    const groups = new Map<string, ComingSoonMovie[]>();
    visibleMovies.forEach((movie) => {
      const group = groups.get(movie.release_date) || [];
      group.push(movie);
      groups.set(movie.release_date, group);
    });
    return Array.from(groups.entries());
  }, [visibleMovies]);

  const fetchComingSoon = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiClient.get<ComingSoonMovie[]>("/api/coming-soon", {
        params: {
          region,
          days: RELEASE_WINDOW_DAYS,
          type: "streaming",
        },
      });
      setMovies(response.data);
    } catch (err: any) {
      const message =
        err?.response?.data?.msg || "Unable to load upcoming streaming releases.";
      setError(message);
      setMovies([]);
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => {
    fetchComingSoon();
  }, [fetchComingSoon]);

  const handleOpenImdb = async (movie: ComingSoonMovie) => {
    const knownImdbId = movie.imdbId || (movie.imdbID?.startsWith("tt") ? movie.imdbID : "");
    if (knownImdbId) {
      window.open(`https://www.imdb.com/title/${knownImdbId}/`, "_blank", "noopener,noreferrer");
      return;
    }

    const tmdbId = movie.tmdbId || (!movie.watchmodeId ? movie.id : undefined);
    if (!tmdbId) {
      toast.error("IMDb page is not available for this movie yet.");
      return;
    }

    const imdbWindow = window.open("", "_blank");
    if (!imdbWindow) {
      toast.error("Please allow pop-ups to open IMDb pages.");
      return;
    }
    imdbWindow.opener = null;

    try {
      const response = await apiClient.get<ImdbLookupResponse>(
        `/api/coming-soon/${tmdbId}/imdb`
      );

      if (!response.data.imdbUrl) {
        imdbWindow.close();
        toast.error("IMDb page is not available for this movie yet.");
        return;
      }

      imdbWindow.location.href = response.data.imdbUrl;
    } catch (err: unknown) {
      imdbWindow.close();
      const requestError = err as AxiosError<ApiErrorResponse>;
      const message =
        requestError.response?.data?.msg || "Unable to open IMDb page for this movie.";
      toast.error(message);
    }
  };

  const handleAddToWatchlist = async (movie: ComingSoonMovie) => {
    if (addingIds.has(movie.id)) return;

    setAddingIds((current) => new Set(current).add(movie.id));
    try {
      await addToWatchlist({
        imdbID: movie.imdbID || `tmdb-${movie.id}`,
        title: movie.title,
        poster_path: movie.poster_path,
        vote_average: movie.vote_average || 0,
      });
      toast.success(`${movie.title} added to your watchlist.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.msg || "Failed to add movie to watchlist.");
    } finally {
      setAddingIds((current) => {
        const next = new Set(current);
        next.delete(movie.id);
        return next;
      });
    }
  };

  const renderMeta = (movie: ComingSoonMovie) => {
    const parts: string[] = [];
    const runtime = formatRuntime(movie.runtime);
    if (runtime) parts.push(runtime);
    if (movie.genres && movie.genres.length > 0) parts.push(movie.genres.join(" · "));
    return parts.join("  ·  ");
  };

  const featuredBackdrop = featured ? getBackdropUrl(featured) : "";
  const featuredRevenue = featured ? formatRevenue(featured.revenue) : "";
  const featuredBadge = featured ? blockbusterLabel(featured) : "";

  return (
    <div className="cs2-page">
      <VerticalNavbar />

      {loading ? (
        <header className="cs2-headliner cs2-headliner--loading" aria-busy="true">
          <div className="cs2-headliner-inner">
            <div className="cs2-skeleton-line cs2-skeleton-line--eyebrow" />
            <div className="cs2-skeleton-line cs2-skeleton-line--title" />
            <div className="cs2-skeleton-line cs2-skeleton-line--meta" />
            <div className="cs2-skeleton-line cs2-skeleton-line--body" />
          </div>
        </header>
      ) : featured ? (
        <header className="cs2-headliner">
          {featuredBackdrop && (
            <img
              className="cs2-headliner-backdrop"
              src={featuredBackdrop}
              alt=""
              aria-hidden="true"
            />
          )}
          <div className="cs2-headliner-scrim" />

          <div className="cs2-headliner-inner">
            <p className="cs2-eyebrow">The Headliner · Coming to streaming</p>
            <h1 className="cs2-headliner-title">{featured.title}</h1>

            <div className="cs2-headliner-meta">
              <span className="cs2-countdown">{countdownLabel(featured.release_date)}</span>
              <span className="cs2-meta-divider" aria-hidden="true" />
              <span>{formatLongDate(featured.release_date)}</span>
              {featured.vote_average > 0 && (
                <>
                  <span className="cs2-meta-divider" aria-hidden="true" />
                  <span className="cs2-star-rating">
                    <FaStar aria-hidden="true" /> {featured.vote_average.toFixed(1)}
                  </span>
                </>
              )}
              {renderMeta(featured) && (
                <>
                  <span className="cs2-meta-divider" aria-hidden="true" />
                  <span>{renderMeta(featured)}</span>
                </>
              )}
            </div>

            {(featuredBadge || featuredRevenue) && (
              <p className="cs2-laurel">
                {featuredBadge}
                {featuredBadge && featuredRevenue ? " — " : ""}
                {featuredRevenue && `${featuredRevenue} worldwide box office`}
              </p>
            )}

            {featured.overview && (
              <p className="cs2-headliner-overview">{featured.overview}</p>
            )}

            {featured.sourceNames && featured.sourceNames.length > 0 && (
              <div className="cs2-platforms">
                {featured.sourceNames.slice(0, 4).map((name) => (
                  <span key={name} className="cs2-platform-chip">
                    {name}
                  </span>
                ))}
              </div>
            )}

            <div className="cs2-headliner-actions">
              <button
                type="button"
                className="cs2-button cs2-button--gold"
                onClick={() => handleAddToWatchlist(featured)}
                disabled={addingIds.has(featured.id)}
              >
                <FaPlus aria-hidden="true" />
                {addingIds.has(featured.id) ? "Adding…" : "Add to Watchlist"}
              </button>
              <button
                type="button"
                className="cs2-button cs2-button--ghost"
                onClick={() => handleOpenImdb(featured)}
              >
                <FaImdb aria-hidden="true" />
                View on IMDb
              </button>
            </div>
          </div>
        </header>
      ) : (
        <header className="cs2-headliner cs2-headliner--empty">
          <div className="cs2-headliner-inner">
            <p className="cs2-eyebrow">Coming to streaming</p>
            <h1 className="cs2-headliner-title">The next premieres</h1>
            <p className="cs2-headliner-overview">
              Box office favourites and new films arriving on streaming platforms in{" "}
              {selectedRegionLabel}.
            </p>
          </div>
        </header>
      )}

      <main className="cs2-main">
        <div className="cs2-toolbar">
          <div>
            <p className="cs2-eyebrow">Release calendar</p>
            <h2 className="cs2-toolbar-title">
              {loading
                ? "Curating the schedule…"
                : `${visibleMovies.length} ${
                    visibleMovies.length === 1 ? "premiere" : "premieres"
                  } over the next ${RELEASE_WINDOW_DAYS} days`}
            </h2>
          </div>

          <label className="cs2-region">
            <span>Region</span>
            <select
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              aria-label="Select release region"
            >
              {REGIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="cs2-calendar" aria-busy="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="cs2-skeleton-row" />
            ))}
          </div>
        ) : error ? (
          <div className="cs2-state">
            <h3>The schedule is unavailable</h3>
            <p>{error}</p>
            <button
              type="button"
              className="cs2-button cs2-button--gold"
              onClick={fetchComingSoon}
            >
              Try again
            </button>
          </div>
        ) : visibleMovies.length === 0 ? (
          <div className="cs2-state">
            <h3>An intermission</h3>
            <p>
              No streaming premieres are scheduled in the next {RELEASE_WINDOW_DAYS} days
              for {selectedRegionLabel}. Try another region, or check back soon.
            </p>
          </div>
        ) : (
          <div className="cs2-calendar">
            {calendar.map(([date, films]) => (
              <section key={date} className="cs2-day">
                <div className="cs2-day-heading">
                  <span className="cs2-day-date">{formatShortDate(date)}</span>
                  <span className="cs2-day-full">{formatLongDate(date)}</span>
                  <span className="cs2-day-rule" aria-hidden="true" />
                </div>

                <div className="cs2-day-films">
                  {films.map((movie) => {
                    const badge = blockbusterLabel(movie);
                    const revenue = formatRevenue(movie.revenue);
                    const meta = renderMeta(movie);
                    return (
                      <article
                        key={`${movie.watchmodeId || movie.id}`}
                        className="cs2-film"
                        role="button"
                        tabIndex={0}
                        aria-label={`Open ${movie.title} on IMDb`}
                        onClick={() => handleOpenImdb(movie)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleOpenImdb(movie);
                          }
                        }}
                      >
                        <div className="cs2-film-poster">
                          <img
                            src={getPosterUrl(movie.poster_path)}
                            alt={movie.title}
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.src = "/default-avatar.png";
                            }}
                          />
                        </div>

                        <div className="cs2-film-body">
                          {badge && (
                            <p className="cs2-film-badge">
                              {badge}
                              {revenue ? ` · ${revenue}` : ""}
                            </p>
                          )}
                          <h3 className="cs2-film-title" title={movie.title}>
                            {movie.title}
                          </h3>
                          <p className="cs2-film-meta">
                            {movie.vote_average > 0 && (
                              <span className="cs2-star-rating">
                                <FaStar aria-hidden="true" />{" "}
                                {movie.vote_average.toFixed(1)}
                              </span>
                            )}
                            {movie.vote_average > 0 && meta ? "  ·  " : ""}
                            {meta}
                          </p>
                          {movie.overview && (
                            <p className="cs2-film-overview">{movie.overview}</p>
                          )}

                          <div className="cs2-film-footer">
                            {movie.sourceNames && movie.sourceNames.length > 0 && (
                              <span
                                className="cs2-film-platforms"
                                title={movie.sourceNames.join(", ")}
                              >
                                {movie.sourceNames.slice(0, 3).join(" · ")}
                              </span>
                            )}
                            <button
                              type="button"
                              className="cs2-button cs2-button--small"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleAddToWatchlist(movie);
                              }}
                              onKeyDown={(event) => event.stopPropagation()}
                              disabled={addingIds.has(movie.id)}
                            >
                              <FaPlus aria-hidden="true" />
                              {addingIds.has(movie.id) ? "Adding…" : "Watchlist"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ComingSoon;
