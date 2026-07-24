import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  FaClock,
  FaListUl,
  FaPlus,
  FaSearch,
  FaStar,
  FaTh,
  FaTimes,
} from "react-icons/fa";
import "./Watchlist.css";
import SearchBar from "../component/SearchBar";
import MovieCard from "../component/MovieCard";
import MovieDetailModal from "../component/MovieDetailModal";
import VerticalNavbar from "../component/VerticalNavbar";
import SuggestionsCarousel from "../component/SuggestionsCarousel";
import FavoritesCarousel from "../component/FavoritesCarousel";

import GroupSelectModal, { WatchMetadata } from "../component/GroupSelectModal";
import { useWatchlistStore, WatchlistMovie } from "../store/useWatchlistStore";
import { useGroupStore } from "../store/useGroupStore";
import { toast } from "react-toastify";
import apiClient from "../api/apiClient";

type FilterMode = "all" | "top" | "recent";
type SortMode = "date_desc" | "title_asc" | "rating_desc";
type ViewMode = "grid" | "list";

const FILTER_OPTIONS: { id: FilterMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "top", label: "Top Rated" },
  { id: "recent", label: "Recently Added" },
];

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "date_desc", label: "Newest first" },
  { id: "title_asc", label: "Title A–Z" },
  { id: "rating_desc", label: "Highest rated" },
];

const getPosterUrl = (poster?: string, size = "w780") => {
  if (!poster) return "";
  if (poster.startsWith("http")) return poster;
  return `https://image.tmdb.org/t/p/${size}${poster}`;
};

const Watchlist: React.FC = () => {
  const {
    movies,
    loading,
    fetchWatchlist,
    addMovie,
    removeMovie,
    markAsWatched,
  } = useWatchlistStore();

  const { groupList, fetchGroups } = useGroupStore();

  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [groupSelectOpen, setGroupSelectOpen] = useState(false);
  const [pendingMovie, setPendingMovie] = useState<WatchlistMovie | null>(null);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const [filterQuery, setFilterQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortMode, setSortMode] = useState<SortMode>("date_desc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [markingWatched, setMarkingWatched] = useState(false);

  const fetchFavorites = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await apiClient.get("/api/watchlist/favorites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFavorites(res.data);
      setFavoriteIds(new Set(res.data.map((m: any) => m._id)));
    } catch (err) {
      console.error("Failed to fetch favorites:", err);
    }
  }, []);

  const handleFavoriteToggle = async (movie: any) => {
    try {
      const token = localStorage.getItem("token");
      const movieId = movie._id;
      const res = await apiClient.post(`/api/watchlist/favorites/${movieId}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.favorited) {
        setFavorites((prev) => [...prev, movie]);
        setFavoriteIds((prev) => new Set(Array.from(prev).concat(movieId)));
      } else {
        setFavorites((prev) => prev.filter((m) => m._id !== movieId));
        setFavoriteIds((prev) => {
          const s = new Set(prev);
          s.delete(movieId);
          return s;
        });
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  useEffect(() => {
    fetchWatchlist();
    fetchGroups();
    fetchFavorites();
  }, [fetchWatchlist, fetchGroups, fetchFavorites]);

  const handleAddMovie = (movie: {
    imdbID: string;
    title: string;
    poster_path?: string;
    vote_average?: number;
  }) => {
    addMovie(movie);
  };

  const handleMarkWatched = (movie: WatchlistMovie) => {
    setPendingMovie(movie);
    setGroupSelectOpen(true);
  };

  const handleGroupSelect = async (groupId: string, metadata?: WatchMetadata) => {
    if (!pendingMovie || markingWatched) return;

    setMarkingWatched(true);
    try {
      await markAsWatched(pendingMovie._id, groupId, metadata);
      toast.success(`${pendingMovie.title} moved to group watch history.`);
      setGroupSelectOpen(false);
      setPendingMovie(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.msg || "Failed to move movie to group watch history.");
    } finally {
      setMarkingWatched(false);
    }
  };

  const formatMovieForCard = (movie: WatchlistMovie) => ({
    ...movie,
    poster_path: movie.poster,
  });

  const stats = useMemo(() => {
    const total = movies.length;
    const topRated = movies.filter((m) => (m.vote_average ?? 0) >= 7).length;
    const avg =
      total > 0
        ? movies.reduce((acc, m) => acc + (m.vote_average ?? 0), 0) / total
        : 0;
    return { total, topRated, avg: Number(avg.toFixed(1)) };
  }, [movies]);

  const headerBackdrop = useMemo(() => {
    const withPoster = movies.filter((m) => m.poster);
    if (withPoster.length === 0) return "";
    const newest = [...withPoster].sort((a, b) => {
      const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bd - ad;
    })[0];
    return getPosterUrl(newest.poster);
  }, [movies]);

  const statsLine = useMemo(() => {
    if (stats.total === 0) return "Awaiting its first title";
    const parts = [
      `${stats.total} ${stats.total === 1 ? "title" : "titles"}`,
      `${stats.topRated} rated 7+`,
    ];
    if (stats.avg > 0) parts.push(`average ${stats.avg}`);
    return parts.join("  ·  ");
  }, [stats]);

  const visibleMovies = useMemo(() => {
    let result = [...movies];

    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      result = result.filter((m) => (m.title || "").toLowerCase().includes(q));
    }

    if (filterMode === "top") {
      result = result.filter((m) => (m.vote_average ?? 0) >= 7);
    } else if (filterMode === "recent") {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      result = result.filter(
        (m) => m.createdAt && new Date(m.createdAt).getTime() >= sevenDaysAgo
      );
    }

    if (sortMode === "title_asc") {
      result.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (sortMode === "rating_desc") {
      result.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
    } else {
      result.sort((a, b) => {
        const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bd - ad;
      });
    }

    return result;
  }, [movies, filterQuery, filterMode, sortMode]);

  const isFiltering =
    filterQuery.trim().length > 0 || filterMode !== "all";

  return (
    <div className="watchlist-page">
      <VerticalNavbar />

      <header className="wl2-header">
        {headerBackdrop && (
          <img
            className="wl2-header-backdrop"
            src={headerBackdrop}
            alt=""
            aria-hidden="true"
          />
        )}
        <div className="wl2-header-scrim" />
        <div className="wl2-header-inner">
          <p className="wl2-eyebrow">Personal collection</p>
          <h1 className="wl2-header-title">My Watchlist</h1>
          <p className="wl2-header-stats">{statsLine}</p>
        </div>
      </header>

      <div className="watchlist-main">
        <section className="wl2-panel">
          <div className="wl2-toolbar">
            <div className="wl2-search">
              <FaSearch className="wl2-search-icon" aria-hidden />
              <input
                type="text"
                placeholder="Search your collection…"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="wl2-search-input"
                aria-label="Filter watchlist"
              />
              {filterQuery && (
                <button
                  type="button"
                  className="wl2-search-clear"
                  onClick={() => setFilterQuery("")}
                  aria-label="Clear filter"
                >
                  <FaTimes />
                </button>
              )}
            </div>

            <div className="wl2-tabs" role="tablist" aria-label="Filter by category">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={filterMode === opt.id}
                  className={`wl2-tab${filterMode === opt.id ? " wl2-tab--active" : ""}`}
                  onClick={() => setFilterMode(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="wl2-toolbar-tail">
              <label className="wl2-sort">
                <span>Sort</span>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  aria-label="Sort watchlist"
                >
                  {SORT_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="wl2-view" role="group" aria-label="Layout">
                <button
                  type="button"
                  className={`wl2-view-btn${viewMode === "grid" ? " wl2-view-btn--active" : ""}`}
                  onClick={() => setViewMode("grid")}
                  aria-pressed={viewMode === "grid"}
                  aria-label="Grid view"
                >
                  <FaTh />
                </button>
                <button
                  type="button"
                  className={`wl2-view-btn${viewMode === "list" ? " wl2-view-btn--active" : ""}`}
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                  aria-label="List view"
                >
                  <FaListUl />
                </button>
              </div>

              <button
                type="button"
                className={`wl2-add-toggle${showQuickAdd ? " wl2-add-toggle--open" : ""}`}
                onClick={() => setShowQuickAdd((prev) => !prev)}
                aria-expanded={showQuickAdd}
              >
                {showQuickAdd ? <FaTimes /> : <FaPlus />}
                <span>{showQuickAdd ? "Close" : "Add a Film"}</span>
              </button>
            </div>
          </div>

          {showQuickAdd && (
            <div className="wl2-quickadd">
              <SearchBar onMovieSelect={handleAddMovie} />
            </div>
          )}

          {isFiltering && stats.total > 0 && (
            <div className="wl2-summary">
              <span>
                Showing <strong>{visibleMovies.length}</strong> of{" "}
                <strong>{stats.total}</strong>
              </span>
              <button
                type="button"
                className="wl2-reset"
                onClick={() => {
                  setFilterQuery("");
                  setFilterMode("all");
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </section>

        <section className="wl2-collection">
          {loading ? (
            <div className="wl2-skeleton-grid" aria-busy="true" aria-live="polite">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="wl2-skeleton-card" />
              ))}
            </div>
          ) : stats.total === 0 ? (
            <div className="wl2-empty">
              <h3>An empty marquee</h3>
              <p>
                Start curating. Search a title and your collection will take
                shape right here.
              </p>
              <button
                type="button"
                className="wl2-empty-cta"
                onClick={() => setShowQuickAdd(true)}
              >
                <FaPlus /> Add your first film
              </button>
            </div>
          ) : visibleMovies.length === 0 ? (
            <div className="wl2-empty">
              <h3>No matches</h3>
              <p>
                Nothing in your collection fits the current filters. Try
                broadening your search.
              </p>
              <button
                type="button"
                className="wl2-empty-cta wl2-empty-cta--ghost"
                onClick={() => {
                  setFilterQuery("");
                  setFilterMode("all");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className={`wl2-grid wl2-grid--${viewMode}`} role="list">
              {visibleMovies.map((movie, idx) => (
                <div
                  className="wl2-cell"
                  role="listitem"
                  key={movie._id}
                  style={{
                    ["--wl2-stagger" as any]: `${Math.min(idx, 12) * 35}ms`,
                  }}
                >
                  <MovieCard
                    movie={formatMovieForCard(movie)}
                    isInWatchlist
                    onDelete={() => removeMovie(movie._id)}
                    onInfoClick={(m: any) => setSelectedMovie(m)}
                    onMarkWatched={() => handleMarkWatched(movie)}
                    isFavorited={favoriteIds.has(movie._id)}
                    onFavoriteToggle={() =>
                      handleFavoriteToggle(formatMovieForCard(movie))
                    }
                  />
                  {viewMode === "list" && (
                    <div className="wl2-row-meta">
                      <h4 className="wl2-row-title" title={movie.title}>
                        {movie.title}
                      </h4>
                      <div className="wl2-row-stats">
                        <span className="wl2-row-stat">
                          <FaStar aria-hidden />{" "}
                          {movie.vote_average?.toFixed?.(1) ?? "—"}
                        </span>
                        {movie.createdAt && (
                          <span className="wl2-row-stat wl2-row-stat--muted">
                            <FaClock aria-hidden />{" "}
                            Added {new Date(movie.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <FavoritesCarousel
          favorites={favorites}
          onRemoveFavorite={(movieId) =>
            handleFavoriteToggle({ _id: movieId })
          }
        />

        <SuggestionsCarousel onAddToWatchlist={handleAddMovie} />
      </div>

      {selectedMovie && (
        <MovieDetailModal
          movie={selectedMovie}
          variant="watchlist"
          onClose={() => setSelectedMovie(null)}
        />
      )}

      <GroupSelectModal
        isOpen={groupSelectOpen}
        onClose={() => {
          setGroupSelectOpen(false);
          setPendingMovie(null);
        }}
        onSelect={handleGroupSelect}
        groups={groupList}
        movieTitle={pendingMovie?.title || ""}
      />
    </div>
  );
};

export default Watchlist;
