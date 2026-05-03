import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  FaFilm,
  FaSearch,
  FaTh,
  FaListUl,
  FaStar,
  FaClock,
  FaFire,
  FaPlus,
  FaTimes,
  FaSlidersH,
} from "react-icons/fa";
import axios from "axios";
import "./Watchlist.css";
import Hero from "../component/Hero";
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

type FilterMode = "all" | "top" | "recent";
type SortMode = "date_desc" | "title_asc" | "rating_desc";
type ViewMode = "grid" | "list";

const FILTER_OPTIONS: { id: FilterMode; label: string; icon: React.ReactNode }[] = [
  { id: "all", label: "All", icon: <FaFilm /> },
  { id: "top", label: "Top Rated", icon: <FaStar /> },
  { id: "recent", label: "Recently Added", icon: <FaFire /> },
];

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "date_desc", label: "Newest first" },
  { id: "title_asc", label: "Title A–Z" },
  { id: "rating_desc", label: "Highest rated" },
];

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
      const res = await axios.get("/api/watchlist/favorites", {
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
      const res = await axios.post(`/api/watchlist/favorites/${movieId}`, {}, {
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

      <Hero
        backgroundImage="https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg"
        variant="group"
        heroText="My Watchlist"
        heroTextSub="A curated vault of the films waiting for you"
      />

      <div className="watchlist-main">
        <section className="wl-stats-row">
          <div className="wl-stat-card">
            <div className="wl-stat-icon wl-stat-icon--primary">
              <FaFilm />
            </div>
            <div className="wl-stat-meta">
              <span className="wl-stat-value">{stats.total}</span>
              <span className="wl-stat-label">In your vault</span>
            </div>
          </div>
          <div className="wl-stat-card">
            <div className="wl-stat-icon wl-stat-icon--gold">
              <FaStar />
            </div>
            <div className="wl-stat-meta">
              <span className="wl-stat-value">{stats.topRated}</span>
              <span className="wl-stat-label">Top rated (7+)</span>
            </div>
          </div>
          <div className="wl-stat-card">
            <div className="wl-stat-icon wl-stat-icon--accent">
              <FaFire />
            </div>
            <div className="wl-stat-meta">
              <span className="wl-stat-value">
                {stats.avg > 0 ? stats.avg : "—"}
              </span>
              <span className="wl-stat-label">Avg score</span>
            </div>
          </div>
        </section>

        <FavoritesCarousel
          favorites={favorites}
          onRemoveFavorite={(movieId) =>
            handleFavoriteToggle({ _id: movieId })
          }
        />

        <SuggestionsCarousel onAddToWatchlist={handleAddMovie} />

        <section className="wl-control-panel">
          <header className="wl-control-header">
            <div className="wl-control-title-block">
              <span className="wl-control-eyebrow">Your watchlist</span>
              <h2 className="wl-control-title">
                {stats.total === 0
                  ? "Build your collection"
                  : `${stats.total} ${stats.total === 1 ? "title" : "titles"} ready to roll`}
              </h2>
            </div>
            <button
              type="button"
              className={`wl-quickadd-toggle${showQuickAdd ? " wl-quickadd-toggle--open" : ""}`}
              onClick={() => setShowQuickAdd((prev) => !prev)}
              aria-expanded={showQuickAdd}
            >
              {showQuickAdd ? <FaTimes /> : <FaPlus />}
              <span>{showQuickAdd ? "Close" : "Add a movie"}</span>
            </button>
          </header>

          {showQuickAdd && (
            <div className="wl-quickadd-slot">
              <SearchBar onMovieSelect={handleAddMovie} />
            </div>
          )}

          <div className="wl-toolbar">
            <div className="wl-search">
              <FaSearch className="wl-search-icon" aria-hidden />
              <input
                type="text"
                placeholder="Filter your watchlist…"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="wl-search-input"
                aria-label="Filter watchlist"
              />
              {filterQuery && (
                <button
                  type="button"
                  className="wl-search-clear"
                  onClick={() => setFilterQuery("")}
                  aria-label="Clear filter"
                >
                  <FaTimes />
                </button>
              )}
            </div>

            <div className="wl-chip-group" role="tablist" aria-label="Filter by category">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={filterMode === opt.id}
                  className={`wl-chip${filterMode === opt.id ? " wl-chip--active" : ""}`}
                  onClick={() => setFilterMode(opt.id)}
                >
                  <span className="wl-chip-icon">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            <div className="wl-toolbar-tail">
              <label className="wl-sort">
                <FaSlidersH aria-hidden className="wl-sort-icon" />
                <span className="wl-sort-label">Sort</span>
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

              <div className="wl-view-toggle" role="group" aria-label="Layout">
                <button
                  type="button"
                  className={`wl-view-btn${viewMode === "grid" ? " wl-view-btn--active" : ""}`}
                  onClick={() => setViewMode("grid")}
                  aria-pressed={viewMode === "grid"}
                  aria-label="Grid view"
                >
                  <FaTh />
                </button>
                <button
                  type="button"
                  className={`wl-view-btn${viewMode === "list" ? " wl-view-btn--active" : ""}`}
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                  aria-label="List view"
                >
                  <FaListUl />
                </button>
              </div>
            </div>
          </div>

          {isFiltering && stats.total > 0 && (
            <div className="wl-result-summary">
              <span>
                Showing <strong>{visibleMovies.length}</strong> of{" "}
                <strong>{stats.total}</strong>
              </span>
              <button
                type="button"
                className="wl-reset-btn"
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

        <section className="wl-collection">
          {loading ? (
            <div className="wl-skeleton-grid" aria-busy="true" aria-live="polite">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="wl-skeleton-card" />
              ))}
            </div>
          ) : stats.total === 0 ? (
            <div className="wl-empty wl-empty--first">
              <div className="wl-empty-art" aria-hidden>
                <FaFilm />
              </div>
              <h3 className="wl-empty-title">Your vault is empty</h3>
              <p className="wl-empty-copy">
                Start curating. Search a title above or pick from the trending
                carousel and your watchlist will live right here.
              </p>
              <button
                type="button"
                className="wl-empty-cta"
                onClick={() => setShowQuickAdd(true)}
              >
                <FaPlus /> Add your first movie
              </button>
            </div>
          ) : visibleMovies.length === 0 ? (
            <div className="wl-empty wl-empty--filtered">
              <div className="wl-empty-art wl-empty-art--muted" aria-hidden>
                <FaSearch />
              </div>
              <h3 className="wl-empty-title">No matches</h3>
              <p className="wl-empty-copy">
                Nothing in your watchlist fits the current filters. Try
                broadening your search.
              </p>
              <button
                type="button"
                className="wl-empty-cta wl-empty-cta--ghost"
                onClick={() => {
                  setFilterQuery("");
                  setFilterMode("all");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div
              className={`wl-grid wl-grid--${viewMode} wl-grid--fade`}
              role="list"
            >
              {visibleMovies.map((movie, idx) => (
                <div
                  className="wl-grid-cell"
                  role="listitem"
                  key={movie._id}
                  style={{
                    ["--wl-stagger" as any]: `${Math.min(idx, 12) * 40}ms`,
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
                    <div className="wl-list-meta">
                      <h4 className="wl-list-title" title={movie.title}>
                        {movie.title}
                      </h4>
                      <div className="wl-list-stats">
                        <span className="wl-list-stat">
                          <FaStar /> {movie.vote_average?.toFixed?.(1) ?? "—"}
                        </span>
                        {movie.createdAt && (
                          <span className="wl-list-stat wl-list-stat--muted">
                            <FaClock />{" "}
                            {new Date(movie.createdAt).toLocaleDateString()}
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
      </div>

      {selectedMovie && (
        <MovieDetailModal
          movie={selectedMovie}
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
