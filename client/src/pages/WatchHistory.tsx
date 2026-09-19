import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaClock, FaMapMarkerAlt, FaPlus, FaSearch, FaStar, FaTimes, FaTrashAlt, FaUsers } from "react-icons/fa";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import Modal from "../component/Modal/Modal";
import GroupSelectModal, { WatchMetadata } from "../component/GroupSelectModal";
import SearchBar from "../component/SearchBar";
import VerticalNavbar from "../component/VerticalNavbar";
import { createHistoryEntry, DirectHistoryMovie } from "../api/historyApi";
import { useSocket } from "../hooks/useSocket";
import { useGroupStore } from "../store/useGroupStore";
import { HistoryEntry, useWatchHistoryStore } from "../store/useWatchHistoryStore";
import { getAvatarUrl, handleAvatarError } from "../utils/avatar";
import "./WatchHistory.css";

type PeriodFilter = "all" | "year" | "rated";
type SortMode = "recent" | "rating" | "title";
const ACTIVE_TAB_KEY = "history:activeTab";

const posterUrl = (poster?: string) => {
  if (!poster) return "/default-avatar.png";
  return poster.startsWith("http") ? poster : `https://image.tmdb.org/t/p/w500${poster}`;
};

const formatDate = (value: string) => new Date(value).toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const toDateInput = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const WatchHistory: React.FC = () => {
  const { groupList, fetchGroups } = useGroupStore();
  const {
    personal,
    byGroup,
    loading,
    errors,
    fetchPersonal,
    fetchGroup,
    updateEntry,
    deleteEntry,
    rateEntry,
  } = useWatchHistoryStore();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTabState] = useState(() => localStorage.getItem(ACTIVE_TAB_KEY) || "personal");
  const [search, setSearch] = useState("");
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [pendingMovie, setPendingMovie] = useState<DirectHistoryMovie | null>(null);
  const [addingHistory, setAddingHistory] = useState(false);
  const deepLinkApplied = useRef(false);
  const activeGroup = groupList.find((group) => group._id === activeTab);
  const isPersonal = activeTab === "personal";
  const socket = useSocket(isPersonal ? "" : activeTab);

  const setActiveTab = useCallback((tab: string) => {
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
    setActiveTabState(tab);
    setSearch("");
    setPeriodFilter("all");
  }, []);

  useEffect(() => {
    void fetchGroups().finally(() => setGroupsLoaded(true));
  }, [fetchGroups]);

  useEffect(() => {
    if (!groupsLoaded) return;
    if (!deepLinkApplied.current) {
      deepLinkApplied.current = true;
      const slug = searchParams.get("group");
      const match = slug ? groupList.find((group) => group.slug === slug) : null;
      if (match) {
        setActiveTab(match._id);
        return;
      }
    }
    if (!isPersonal && !groupList.some((group) => group._id === activeTab)) setActiveTab("personal");
  }, [activeTab, groupList, groupsLoaded, isPersonal, searchParams, setActiveTab]);

  useEffect(() => {
    if (isPersonal) fetchPersonal();
    else fetchGroup(activeTab);
  }, [activeTab, fetchGroup, fetchPersonal, isPersonal]);

  useEffect(() => {
    if (isPersonal) return;
    const refresh = () => fetchGroup(activeTab);
    socket.on("group:history_updated", refresh);
    socket.on("group:history_deleted", refresh);
    socket.on("group:history_rating_updated", refresh);
    return () => {
      socket.off("group:history_updated", refresh);
      socket.off("group:history_deleted", refresh);
      socket.off("group:history_rating_updated", refresh);
    };
  }, [activeTab, fetchGroup, isPersonal, socket]);

  const bucket = isPersonal ? personal : (byGroup[activeTab] || { items: [], total: 0, nextCursor: null });
  const activeLoading = !!loading[activeTab];
  const activeError = errors[activeTab];

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    let items = bucket.items.filter((entry) => {
      if (query && !entry.movie.title.toLowerCase().includes(query)) return false;
      if (periodFilter === "year" && new Date(entry.watchedAt).getUTCFullYear() !== new Date().getFullYear()) return false;
      if (periodFilter === "rated" && entry.currentUserRating == null && entry.averageRating == null) return false;
      return true;
    });
    if (sortMode === "title") items = [...items].sort((a, b) => a.movie.title.localeCompare(b.movie.title));
    else if (sortMode === "rating") items = [...items].sort((a, b) => (b.averageRating ?? b.currentUserRating ?? -1) - (a.averageRating ?? a.currentUserRating ?? -1));
    else items = [...items].sort((a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime());
    return items;
  }, [bucket.items, periodFilter, search, sortMode]);

  const periods = useMemo(() => {
    const grouped = new Map<string, { month: string; year: string; items: HistoryEntry[] }>();
    visibleItems.forEach((entry) => {
      const date = new Date(entry.watchedAt);
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
      const existing = grouped.get(key) || {
        month: date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }),
        year: String(date.getUTCFullYear()),
        items: [],
      };
      existing.items.push(entry);
      grouped.set(key, existing);
    });
    return [...grouped.values()];
  }, [visibleItems]);

  const latest = bucket.items[0];
  const heroBackdrop = latest?.movie.poster ? posterUrl(latest.movie.poster) : "";

  const openDetails = (entry: HistoryEntry) => {
    setSelected(entry);
    setEditing(false);
    setConfirmDelete(false);
    setEditDate(toDateInput(entry.watchedAt));
    setEditLocation(entry.watchedLocation || "");
    setEditNotes(entry.watchedNotes || "");
  };

  const saveEdit = async () => {
    if (!selected || !editDate) return;
    setSaving(true);
    try {
      const updated = await updateEntry(selected._id, {
        watchedAt: editDate,
        watchedLocation: editLocation,
        watchedNotes: editNotes,
      });
      setSelected(updated);
      setEditing(false);
      toast.success("Watch details updated.");
    } catch (error: any) {
      toast.error(error?.response?.data?.msg || "Unable to update watch details.");
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await deleteEntry(selected._id);
      setSelected(null);
      toast.success("History entry deleted.");
    } catch (error: any) {
      toast.error(error?.response?.data?.msg || "Unable to delete this history entry.");
    } finally {
      setDeleting(false);
    }
  };

  const saveRating = async (value: number) => {
    if (!selected) return;
    try {
      const updated = await rateEntry(selected._id, value);
      setSelected(updated);
      toast.success("Rating saved.");
    } catch (error: any) {
      toast.error(error?.response?.data?.msg || "Unable to save your rating.");
    }
  };

  const toggleQuickAdd = () => {
    setShowQuickAdd((current) => {
      if (current) setPendingMovie(null);
      return !current;
    });
  };

  const selectMovieForHistory = (movie: DirectHistoryMovie) => {
    setPendingMovie(movie);
    setShowQuickAdd(false);
  };

  const saveDirectHistory = async (groupId: string, metadata?: WatchMetadata) => {
    if (!pendingMovie || addingHistory) return;
    const scope = groupId === "personal" ? "personal" : "group";
    setAddingHistory(true);
    try {
      await createHistoryEntry({
        movie: pendingMovie,
        scope,
        ...(scope === "group" ? { groupId, participants: metadata?.watchedWith || [] } : {}),
        watchedAt: metadata?.watchedDate || new Date().toISOString().slice(0, 10),
        watchedLocation: metadata?.watchedWhere?.trim() || "",
        watchedNotes: metadata?.watchedNotes?.trim() || "",
      });

      if (scope === "personal") {
        setActiveTab("personal");
        await fetchPersonal();
      } else {
        setActiveTab(groupId);
        await Promise.all([fetchGroup(groupId), fetchPersonal()]);
      }
      toast.success(`${pendingMovie.title} added to ${scope === "personal" ? "your" : "group"} watch history.`);
      setPendingMovie(null);
      setShowQuickAdd(false);
    } catch (error: any) {
      toast.error(error?.response?.data?.msg || "Unable to add this movie to watch history.");
    } finally {
      setAddingHistory(false);
    }
  };

  return (
    <div className="history-page">
      <VerticalNavbar />
      <header className="history-hero">
        {heroBackdrop && <img className="history-hero-image" src={heroBackdrop} alt="" aria-hidden="true" />}
        <div className="history-hero-scrim" />
        <div className="history-hero-inner">
          <p className="history-kicker">{isPersonal ? "Your film diary" : "Shared screenings"}</p>
          <h1>{isPersonal ? "Watch History" : activeGroup?.name || "Group History"}</h1>
          <p className="history-hero-copy">
            {isPersonal
              ? "Every movie night, remembered. Revisit what you watched, where you watched it, and who shared the screen with you."
              : `The complete screening record for ${activeGroup?.name || "your group"}.`}
          </p>
          <p className="history-hero-stats">
            <strong>{bucket.total}</strong> {bucket.total === 1 ? "film" : "films"} watched
            {latest ? <> <span aria-hidden="true">·</span> Last watched <strong>{new Date(latest.watchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong></> : null}
          </p>
        </div>
      </header>

      <main className="history-main">
        <div className="history-scope-tabs" role="tablist" aria-label="Whose watch history">
          <button type="button" role="tab" aria-selected={isPersonal} className={isPersonal ? "active" : ""} onClick={() => setActiveTab("personal")}>Personal</button>
          {groupList.map((group) => (
            <button key={group._id} type="button" role="tab" aria-selected={activeTab === group._id} className={activeTab === group._id ? "active" : ""} onClick={() => setActiveTab(group._id)}>{group.name}</button>
          ))}
        </div>

        <section className="history-toolbar" aria-label="Watch history filters">
          <label className="history-search">
            <FaSearch aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search watch history…" aria-label="Search watch history" />
          </label>
          <div className="history-filter-tabs" role="group" aria-label="Filter history">
            {([['all', 'All time'], ['year', 'This year'], ['rated', 'Rated']] as Array<[PeriodFilter, string]>).map(([value, label]) => (
              <button key={value} type="button" className={periodFilter === value ? "active" : ""} aria-pressed={periodFilter === value} onClick={() => setPeriodFilter(value)}>{label}</button>
            ))}
          </div>
          <label className="history-sort">Sort
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="recent">Most recent</option>
              <option value="rating">Highest rated</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>
          <button
            type="button"
            className={`history-add-toggle${showQuickAdd ? " history-add-toggle--open" : ""}`}
            onClick={toggleQuickAdd}
            aria-expanded={showQuickAdd}
          >
            {showQuickAdd ? <FaTimes aria-hidden="true" /> : <FaPlus aria-hidden="true" />}
            <span>{showQuickAdd ? "Close" : "Add to History"}</span>
          </button>
        </section>

        {showQuickAdd && (
          <div className="history-quickadd">
            <SearchBar onMovieSelect={selectMovieForHistory} />
          </div>
        )}

        {activeLoading ? (
          <div className="history-skeleton" role="status" aria-label="Loading watch history">{Array.from({ length: 6 }).map((_, index) => <div key={index} />)}</div>
        ) : activeError ? (
          <section className="history-state"><h2>History unavailable</h2><p>{activeError}</p><button type="button" onClick={() => isPersonal ? fetchPersonal() : fetchGroup(activeTab)}>Try again</button></section>
        ) : visibleItems.length === 0 ? (
          <section className="history-state"><h2>{bucket.items.length ? "No matching screenings" : "Your next movie night starts here"}</h2><p>{bucket.items.length ? "Try another title or clear the active filter." : isPersonal ? "Add a movie you've watched, or mark one watched from your Watchlist." : "Add a watched movie directly, or mark one watched from this group's Watchlist."}</p>{bucket.items.length ? <button type="button" onClick={() => { setSearch(""); setPeriodFilter("all"); }}>Clear filters</button> : null}</section>
        ) : (
          <div className="history-timeline">
            {periods.map((period) => (
              <section className="history-period" key={`${period.month}-${period.year}`}>
                <header className="history-period-label"><h2>{period.month}</h2><span>{period.year}</span></header>
                <div className="history-period-list">
                  {period.items.map((entry) => (
                    <button type="button" className="history-card" data-testid="history-row" key={entry._id} onClick={() => openDetails(entry)} aria-label={`View details for ${entry.movie.title}`}>
                      <span className="history-card-poster-wrap">
                        <img className="history-card-poster" src={posterUrl(entry.movie.poster)} alt={`${entry.movie.title} poster`} onError={(event) => { (event.currentTarget as HTMLImageElement).src = "/default-avatar.png"; }} />
                        {(entry.averageRating != null || entry.currentUserRating != null) && (
                          <span className="history-card-rating"><FaStar aria-hidden="true" /> {entry.averageRating ?? entry.currentUserRating}</span>
                        )}
                      </span>
                      <span className="history-card-body">
                        <strong className="history-card-title">{entry.movie.title}</strong>
                        <span className="history-card-meta">
                          <span>{formatDate(entry.watchedAt)}</span>
                          <span>{entry.watchedLocation || (entry.scope === "group" ? entry.group?.name : "Personal watch")}</span>
                        </span>
                        {(!isPersonal || entry.participants.length > 1) && entry.participants.length > 0 ? (
                          <span className="history-card-people" aria-label={`Watched with ${entry.participants.map((member) => member.name).join(", ")}`}>
                            <span className="history-card-avatars" aria-hidden="true">
                              {entry.participants.slice(0, 4).map((member) => (
                                <img key={member._id} src={getAvatarUrl(member)} alt="" title={member.name} onError={(event) => handleAvatarError(event, member)} />
                              ))}
                              {entry.participants.length > 4 && <span className="history-card-avatar-more">+{entry.participants.length - 4}</span>}
                            </span>
                            <span className="history-card-people-label">{entry.participants.length === 1 ? entry.participants[0].name : `${entry.participants.length} watched`}</span>
                          </span>
                        ) : (
                          <span className="history-card-solo">Personal screening</span>
                        )}
                        <span className="history-card-action">Details</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} size="lg" ariaLabel="Watch history details" className="history-details-modal">
        {selected ? (
          <div className="history-details">
            <img className="history-details-poster" src={posterUrl(selected.movie.poster)} alt={`${selected.movie.title} poster`} />
            <div className="history-details-body">
              <p className="history-details-context">{selected.scope === "group" ? selected.group?.name : "Personal history"}</p>
              <h2>{selected.movie.title}</h2>
              {!editing ? (
                <>
                  <div className="history-detail-facts">
                    <p><FaClock aria-hidden="true" /><span><small>Watched</small>{formatDate(selected.watchedAt)}</span></p>
                    <p><FaMapMarkerAlt aria-hidden="true" /><span><small>Location</small>{selected.watchedLocation || "Not recorded"}</span></p>
                    <p><FaUsers aria-hidden="true" /><span><small>Watched with</small>{selected.participants.map((member) => member.name).join(", ") || "Just you"}</span></p>
                  </div>
                  {selected.watchedNotes && <blockquote>{selected.watchedNotes}</blockquote>}
                  <label className="history-rating-control">Your rating
                    <select value={selected.currentUserRating ?? ""} onChange={(event) => event.target.value && saveRating(Number(event.target.value))}>
                      <option value="">Not rated</option>
                      {Array.from({ length: 10 }, (_, index) => 10 - index).map((rating) => <option value={rating} key={rating}>{rating}/10</option>)}
                    </select>
                  </label>
                  <div className="history-detail-actions">
                    <button type="button" onClick={() => setEditing(true)}>Edit details</button>
                    <button type="button" className="danger" onClick={() => setConfirmDelete(true)}><FaTrashAlt /> Delete</button>
                  </div>
                  {confirmDelete && <div className="history-delete-confirm"><p>Delete this watch entry? This cannot be undone.</p><div><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button><button type="button" className="danger" disabled={deleting} onClick={removeEntry}>{deleting ? "Deleting…" : "Delete entry"}</button></div></div>}
                </>
              ) : (
                <div className="history-edit-form">
                  <label>Watched date<input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label>
                  <label>Location<input type="text" value={editLocation} maxLength={300} onChange={(event) => setEditLocation(event.target.value)} /></label>
                  <label>Notes<textarea value={editNotes} maxLength={2000} rows={5} onChange={(event) => setEditNotes(event.target.value)} /></label>
                  <div><button type="button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button><button type="button" className="primary" onClick={saveEdit} disabled={saving || !editDate}>{saving ? "Saving…" : "Save changes"}</button></div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <GroupSelectModal
        isOpen={!!pendingMovie}
        onClose={() => {
          if (!addingHistory) setPendingMovie(null);
        }}
        onSelect={saveDirectHistory}
        groups={groupList}
        movieTitle={pendingMovie?.title || ""}
        submitting={addingHistory}
      />
    </div>
  );
};

export default WatchHistory;
