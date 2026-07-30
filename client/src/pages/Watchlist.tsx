import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  FaClock,
  FaListUl,
  FaPlus,
  FaSearch,
  FaStar,
  FaTh,
  FaTimes,
} from "react-icons/fa";
import { useSearchParams } from "react-router-dom";
import "./Watchlist.css";
import SearchBar from "../component/SearchBar";
import MovieCard from "../component/MovieCard";
import MovieDetailModal from "../component/MovieDetailModal";
import VerticalNavbar from "../component/VerticalNavbar";
import SuggestionsCarousel from "../component/SuggestionsCarousel";
import FavoritesCarousel from "../component/FavoritesCarousel";

import GroupSelectModal, { WatchMetadata } from "../component/GroupSelectModal";
import {
  useWatchlistStore,
  WatchlistMovie,
  selectVisibleMovies,
} from "../store/useWatchlistStore";
import { useGroupStore } from "../store/useGroupStore";
import { useSocket } from "../hooks/useSocket";
import { toast } from "react-toastify";
import apiClient from "../api/apiClient";
import { getAvatarUrl, handleAvatarError } from "../utils/avatar";

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
    loading,
    groupLoading,
    byGroup,
    activeTab,
    fetchWatchlist,
    addMovie,
    removeMovie,
    markAsWatched,
    setActiveTab,
    fetchGroupWatchlist,
    addMovieToGroup,
    removeMovieFromGroup,
  } = useWatchlistStore();
  const activeList = useWatchlistStore(selectVisibleMovies);

  const { groupList, fetchGroups } = useGroupStore();
  const [searchParams] = useSearchParams();

  const isPersonalTab = activeTab === "personal";
  const activeGroup = useMemo(
    () => groupList.find((g) => g._id === activeTab),
    [groupList, activeTab]
  );

  const socket = useSocket(isPersonalTab ? "" : activeTab);

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

  const deepLinkAppliedRef = useRef(false);

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

  // Resolve the initial tab: honor a ?group=<slug> deep link once groups are
  // loaded, otherwise fall back to "personal" if the persisted tab's group no
  // longer exists (left the group, etc.).
  useEffect(() => {
    if (groupList.length === 0) return;

    if (!deepLinkAppliedRef.current) {
      const groupParam = searchParams.get("group");
      if (groupParam) {
        const match = groupList.find((g) => g.slug === groupParam);
        deepLinkAppliedRef.current = true;
        if (match && activeTab !== match._id) {
          setActiveTab(match._id);
          return;
        }
      } else {
        deepLinkAppliedRef.current = true;
      }
    }

    if (!isPersonalTab) {
      const stillMember = groupList.some((g) => g._id === activeTab);
      if (!stillMember) setActiveTab("personal");
    }
  }, [groupList, searchParams, activeTab, isPersonalTab, setActiveTab]);

  // Fetch a group's shared watchlist the first time its tab becomes active.
  useEffect(() => {
    if (isPersonalTab) return;
    if (!byGroup[activeTab]) {
      fetchGroupWatchlist(activeTab);
    }
  }, [isPersonalTab, activeTab, byGroup, fetchGroupWatchlist]);

  // Live updates: refetch the active group's watchlist whenever anyone changes it.
  useEffect(() => {
    if (isPersonalTab) return;
    const handleUpdate = () => fetchGroupWatchlist(activeTab);
    socket.on("group:watchlist_updated", handleUpdate);
    return () => {
      socket.off("group:watchlist_updated", handleUpdate);
    };
  }, [isPersonalTab, activeTab, socket, fetchGroupWatchlist]);

  const handleAddMovie = (movie: {
    imdbID: string;
    title: string;
    poster_path?: string;
    vote_average?: number;
  }) => {
    if (isPersonalTab) {
      addMovie(movie);
    } else {
      addMovieToGroup(activeTab, movie);
    }
  };

  const handleMarkWatched = async (movie: WatchlistMovie) => {
    if (isPersonalTab) {
      setPendingMovie(movie);
      setGroupSelectOpen(true);
      return;
    }

    if (markingWatched) return;
    setMarkingWatched(true);
    try {
      await markAsWatched(
        movie._id,
        activeTab,
        {
          watchedDate: new Date().toISOString().split("T")[0],
          watchedWhere: "",
        },
        "group"
      );
      toast.success(`${movie.title} moved to group watch history.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.msg || "Failed to move movie to group watch history.");
    } finally {
      setMarkingWatched(false);
    }
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

  const handleRemoveMovie = (movie: WatchlistMovie) => {
    if (isPersonalTab) {
      removeMovie(movie._id);
      return;
    }

    const groupName = activeGroup?.name || "this group";
    if (!window.confirm(`Remove ${movie.title} from ${groupName}'s watchlist for everyone?`)) {
      return;
    }
    removeMovieFromGroup(activeTab, movie._id);
  };

  const formatMovieForCard = (movie: WatchlistMovie) => ({
    ...movie,
    poster_path: movie.poster,
  });

  const renderAddedByFooter = (movie: WatchlistMovie) => {
    if (!movie.addedBy) return null;
    return (
      <div className="wl2-added-by">
        <img
          src={getAvatarUrl(movie.addedBy)}
          alt={movie.addedBy.name}
          className="wl2-added-by-avatar"
          onError={(event) => handleAvatarError(event, movie.addedBy)}
        />
        <span>Added by {movie.addedBy.name}</span>
      </div>
    );
  };

  const stats = useMemo(() => {
    const total = activeList.length;
    const topRated = activeList.filter((m) => (m.vote_average ?? 0) >= 7).length;
    const avg =
      total > 0
        ? activeList.reduce((acc, m) => acc + (m.vote_average ?? 0), 0) / total
        : 0;
    return { total, topRated, avg: Number(avg.toFixed(1)) };
  }, [activeList]);

  const headerBackdrop = useMemo(() => {
    const withPoster = activeList.filter((m) => m.poster);
    if (withPoster.length === 0) return "";
    const newest = [...withPoster].sort((a, b) => {
      const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bd - ad;
    })[0];
    return getPosterUrl(newest.poster);
  }, [activeList]);

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
    let result = [...activeList];

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
  }, [activeList, filterQuery, filterMode, sortMode]);

  const isFiltering =
    filterQuery.trim().length > 0 || filterMode !== "all";

  const isActiveListLoading = isPersonalTab
    ? loading
    : !!groupLoading[activeTab] && !byGroup[activeTab];

  const tabs = useMemo(
    () => [
      { id: "personal", label: "Personal" },
      ...groupList.map((g) => ({ id: g._id, label: g.name })),
    ],
    [groupList]
  );

  const eyebrowText = isPersonalTab ? "Personal collection" : "Shared watchlist";
  const titleText = isPersonalTab ? "My Watchlist" : activeGroup?.name || "Group Watchlist";

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
          <p className="wl2-eyebrow">{eyebrowText}</p>
          <h1 className="wl2-header-title">{titleText}</h1>
          <p className="wl2-header-stats">{statsLine}</p>
        </div>
      </header>

      <div className="watchlist-main">
        {tabs.length > 1 && (
          <div className="wl2-grouptab-strip" role="tablist" aria-label="Whose watchlist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`wl2-grouptab${activeTab === tab.id ? " wl2-grouptab--active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

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
          {isActiveListLoading ? (
            <div className="wl2-skeleton-grid" aria-busy="true" aria-live="polite">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="wl2-skeleton-card" />
              ))}
            </div>
          ) : stats.total === 0 ? (
            <div className="wl2-empty">
              <h3>{isPersonalTab ? "An empty marquee" : "Nothing queued up"}</h3>
              <p>
                {isPersonalTab
                  ? "Start curating. Search a title and your collection will take shape right here."
                  : `Nobody has added anything to ${activeGroup?.name || "this group"}'s watchlist yet.`}
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
                    onDelete={() => handleRemoveMovie(movie)}
                    onInfoClick={(m: any) => setSelectedMovie(m)}
                    onMarkWatched={() => handleMarkWatched(movie)}
                    isFavorited={favoriteIds.has(movie._id)}
                    onFavoriteToggle={() =>
                      handleFavoriteToggle(formatMovieForCard(movie))
                    }
                    footerContent={!isPersonalTab ? renderAddedByFooter(movie) : null}
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
