import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { AxiosError } from "axios";
import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaCloudDownloadAlt,
  FaCompactDisc,
  FaExclamationTriangle,
  FaFilm,
  FaPlus,
  FaStar,
} from "react-icons/fa";
import { toast } from "react-toastify";
import apiClient from "../api/apiClient";
import { addToWatchlist } from "../api/watchlistApi";
import VerticalNavbar from "../component/VerticalNavbar";
import Hero from "../component/Hero";
import "./ComingSoon.css";

type ComingSoonType = "all" | "digital" | "physical" | "streaming";

type ComingSoonMovie = {
  id: number;
  imdbID: string;
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
  type: ComingSoonType;
  watchmodeId?: number;
  tmdbId?: number;
  imdbId?: string;
  sources?: {
    source_id?: number;
    name?: string;
    type?: string;
    region?: string;
    web_url?: string | null;
  }[];
  sourceNames?: string[];
  sourceTypes?: string[];
  webUrl?: string;
};

type ImdbLookupResponse = {
  imdbId: string;
  imdbUrl: string;
};

type ApiErrorResponse = {
  msg?: string;
};

const FILTERS: {
  id: ComingSoonType;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "all", label: "All", icon: <FaFilm /> },
  { id: "digital", label: "Digital", icon: <FaCloudDownloadAlt /> },
  { id: "physical", label: "DVD / Physical", icon: <FaCompactDisc /> },
  { id: "streaming", label: "Streaming", icon: <FaBroadcastTower /> },
];

const REGIONS = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
];

const RELEASE_WINDOW_DAYS = 30;
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

const formatDate = (value: string) => {
  if (!value) return "Date TBA";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Date TBA";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getTypeLabel = (type: ComingSoonType) => {
  if (type === "digital") return "Digital";
  if (type === "physical") return "DVD / Physical";
  if (type === "streaming") return "Streaming";
  return "Available Soon";
};

const getSourceSummary = (movie: ComingSoonMovie) =>
  (movie.sourceNames || []).slice(0, 3).join(", ");

const ComingSoon: React.FC = () => {
  const [movies, setMovies] = useState<ComingSoonMovie[]>([]);
  const [selectedType, setSelectedType] = useState<ComingSoonType>("all");
  const [region, setRegion] = useState("CA");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingIds, setAddingIds] = useState<Set<number>>(new Set());

  const selectedFilter = useMemo(
    () => FILTERS.find((filter) => filter.id === selectedType) || FILTERS[0],
    [selectedType]
  );
  const visibleMovies = useMemo(
    () =>
      movies
        .filter((movie) => isWithinReleaseWindow(movie.release_date, RELEASE_WINDOW_DAYS))
        .sort((a, b) => {
          const dateCompare = a.release_date.localeCompare(b.release_date);
          if (dateCompare !== 0) return dateCompare;
          return Number(b.vote_average || 0) - Number(a.vote_average || 0);
        }),
    [movies]
  );

  const fetchComingSoon = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiClient.get<ComingSoonMovie[]>("/api/coming-soon", {
        params: {
          region,
          days: RELEASE_WINDOW_DAYS,
          type: selectedType,
        },
      });
      setMovies(response.data);
    } catch (err: any) {
      const message =
        err?.response?.data?.msg || "Unable to load coming soon movies.";
      setError(message);
      setMovies([]);
    } finally {
      setLoading(false);
    }
  }, [region, selectedType]);

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
      const error = err as AxiosError<ApiErrorResponse>;
      const message =
        error.response?.data?.msg || "Unable to open IMDb page for this movie.";
      toast.error(message);
    }
  };

  const handleCardKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    movie: ComingSoonMovie
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenImdb(movie);
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

  return (
    <div className="coming-soon-page">
      <VerticalNavbar />

      <Hero
        backgroundImage="https://image.tmdb.org/t/p/original/5YZbUmjbMa3ClvSW1Wj3D6XGolb.jpg"
        variant="group"
        heroText="Coming Soon"
        heroTextSub="Movies arriving on streaming, rent, buy, and digital platforms."
      />

      <main className="coming-soon-main">
        <section className="cs-control-panel">
          <header className="cs-control-header">
            <div>
              <span className="cs-eyebrow">Release discovery</span>
              <h2>Plan the next additions to your watchlist</h2>
              <p>
                Browse Canada provider availability for streaming, rental, buy,
                and digital movie releases.
              </p>
            </div>

            <label className="cs-region-select">
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
          </header>

          <div className="cs-filter-row" role="tablist" aria-label="Coming soon filters">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={selectedType === filter.id}
                className={`cs-filter-chip${
                  selectedType === filter.id ? " cs-filter-chip--active" : ""
                }`}
                onClick={() => setSelectedType(filter.id)}
              >
                <span>{filter.icon}</span>
                {filter.label}
              </button>
            ))}
          </div>
        </section>

        <section className="cs-results-heading" aria-live="polite">
          <div className="cs-results-icon">{selectedFilter.icon}</div>
          <div>
            <span>{selectedFilter.label}</span>
            <strong>
              {loading
                ? "Loading titles"
                : `${visibleMovies.length} ${visibleMovies.length === 1 ? "movie" : "movies"}`}
            </strong>
          </div>
        </section>

        {loading ? (
          <section className="cs-grid" aria-busy="true">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="cs-skeleton-card" />
            ))}
          </section>
        ) : error ? (
          <section className="cs-state-card cs-state-card--error">
            <FaExclamationTriangle />
            <h3>Coming soon data is unavailable</h3>
            <p>{error}</p>
            <button type="button" onClick={fetchComingSoon}>
              Try again
            </button>
          </section>
        ) : visibleMovies.length === 0 ? (
          <section className="cs-state-card">
            <FaCalendarAlt />
            <h3>No matching releases found</h3>
            <p>
              No releases found in the next {RELEASE_WINDOW_DAYS} days for this
              region and filter.
            </p>
          </section>
        ) : (
          <section className="cs-grid">
            {visibleMovies.map((movie, index) => (
              <article
                key={`${movie.watchmodeId || movie.id}-${movie.type}`}
                className="cs-movie-card"
                role="button"
                tabIndex={0}
                aria-label={`Open ${movie.title} on IMDb`}
                onClick={() => handleOpenImdb(movie)}
                onKeyDown={(event) => handleCardKeyDown(event, movie)}
                style={{
                  "--cs-stagger": `${Math.min(index, 14) * 35}ms`,
                } as React.CSSProperties & Record<"--cs-stagger", string>}
              >
                <div className="cs-poster-wrap">
                  <img
                    src={getPosterUrl(movie.poster_path)}
                    alt={movie.title}
                    className="cs-poster"
                    onError={(event) => {
                      event.currentTarget.src = "/default-avatar.png";
                    }}
                  />
                  <span className="cs-type-badge">{getTypeLabel(movie.type)}</span>
                  {movie.vote_average > 0 && (
                    <span className="cs-rating-badge">
                      <FaStar /> {movie.vote_average.toFixed(1)}
                    </span>
                  )}
                </div>

                <div className="cs-card-body">
                  <div className="cs-date">
                    <FaCalendarAlt />
                    {formatDate(movie.release_date)}
                  </div>
                  <h3 title={movie.title}>{movie.title}</h3>
                  <p>{movie.overview || "No overview is available yet."}</p>
                  {getSourceSummary(movie) && (
                    <div className="cs-source-row" title={movie.sourceNames?.join(", ")}>
                      {getSourceSummary(movie)}
                    </div>
                  )}
                  <button
                    type="button"
                    className="cs-add-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleAddToWatchlist(movie);
                    }}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                    }}
                    disabled={addingIds.has(movie.id)}
                  >
                    <FaPlus />
                    {addingIds.has(movie.id) ? "Adding..." : "Add to Watchlist"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
};

export default ComingSoon;
