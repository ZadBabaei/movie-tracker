import React, { useCallback, useEffect, useMemo, useState } from "react";
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

const getPosterUrl = (path: string) =>
  path ? `https://image.tmdb.org/t/p/w500${path}` : "/default-avatar.png";

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
  return "Coming Soon";
};

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

  const fetchComingSoon = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiClient.get<ComingSoonMovie[]>("/api/coming-soon", {
        params: {
          region,
          days: 30,
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

  const handleAddToWatchlist = async (movie: ComingSoonMovie) => {
    if (addingIds.has(movie.id)) return;

    setAddingIds((current) => new Set(current).add(movie.id));
    try {
      await addToWatchlist({
        imdbID: `tmdb-${movie.id}`,
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
        heroTextSub="Movies arriving in the next 30 days."
      />

      <main className="coming-soon-main">
        <section className="cs-control-panel">
          <header className="cs-control-header">
            <div>
              <span className="cs-eyebrow">Release discovery</span>
              <h2>Plan the next additions to your watchlist</h2>
              <p>
                Browse upcoming theatrical, digital, physical, and
                provider-related releases by region.
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
                : `${movies.length} ${movies.length === 1 ? "movie" : "movies"}`}
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
        ) : movies.length === 0 ? (
          <section className="cs-state-card">
            <FaCalendarAlt />
            <h3>No matching releases found</h3>
            <p>
              TMDb did not return any {selectedFilter.label.toLowerCase()} titles
              for {region} in the next 30 days. Try another filter or region.
            </p>
          </section>
        ) : (
          <section className="cs-grid" role="list">
            {movies.map((movie, index) => (
              <article
                key={movie.id}
                className="cs-movie-card"
                role="listitem"
                style={{
                  ["--cs-stagger" as any]: `${Math.min(index, 14) * 35}ms`,
                }}
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
                  <button
                    type="button"
                    className="cs-add-button"
                    onClick={() => handleAddToWatchlist(movie)}
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
