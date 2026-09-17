import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaClock, FaMapMarkerAlt, FaSearch, FaStar, FaTrashAlt, FaTv, FaUsers } from "react-icons/fa";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import AddTvWatchModal from "../component/AddTvWatchModal";
import GroupSelectModal, { WatchMetadata } from "../component/GroupSelectModal";
import Modal from "../component/Modal/Modal";
import VerticalNavbar from "../component/VerticalNavbar";
import { describeEpisodeSelection, TvWatchOutcome, TvWatchSelection, useAddTvWatch } from "../hooks/useAddTvWatch";
import { useSocket } from "../hooks/useSocket";
import { useGroupStore } from "../store/useGroupStore";
import { HistoryEntry, useWatchHistoryStore } from "../store/useWatchHistoryStore";
import { getAvatarUrl, handleAvatarError } from "../utils/avatar";
import { formatEpisodeCode, getEntryBackdropPath, getEntryPosterPath, getEntrySubtitle, getEntryTitle, isTvEntry } from "../utils/historyEntry";
import {
  buildTimeline,
  sortTimelineItems,
  timelineItemIsRated,
  timelineItemMatchesSearch,
  timelineItemYear,
  TimelineItem,
  TvSessionTimelineItem,
} from "../utils/historyTimeline";
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

const formatCalendarDay = (day: string) => (day ? formatDate(`${day}T00:00:00.000Z`) : "Unknown date");

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
  // A TV session is identified by its recomputed key, never a snapshot, so the
  // list always reflects the raw store after edits/deletes/regrouping.
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const deepLinkApplied = useRef(false);
  const [tvPickerOpen, setTvPickerOpen] = useState(false);
  const activeGroup = groupList.find((group) => group._id === activeTab);
  const isPersonal = activeTab === "personal";
  const socket = useSocket(isPersonal ? "" : activeTab);

  // Episodes land in the scope they were saved to and, because personal history
  // also lists group watches the user took part in, in the personal bucket.
  const refreshAfterTvSave = useCallback(
    async (outcome: TvWatchOutcome) => {
      const refreshes = [fetchPersonal()];
      if (outcome.scopeId !== "personal") refreshes.push(fetchGroup(outcome.scopeId));
      await Promise.all(refreshes);
    },
    [fetchGroup, fetchPersonal]
  );
  const tvWatch = useAddTvWatch({ onSaved: refreshAfterTvSave });

  const handleTvSelection = (selection: TvWatchSelection) => {
    setTvPickerOpen(false);
    tvWatch.setPending(selection);
  };

  const handleTvDetails = async (scopeId: string, metadata?: WatchMetadata) => {
    const outcome = await tvWatch.submit(scopeId, metadata);
    if (!outcome) return;
    if (outcome.failed.length === 0) {
      toast.success(`${outcome.succeeded} episode${outcome.succeeded === 1 ? "" : "s"} of ${outcome.seriesTitle} saved to history.`);
    } else if (outcome.succeeded === 0) {
      toast.error(`Couldn't save ${outcome.seriesTitle} — no episodes were recorded.`);
    } else {
      toast.warn(`${outcome.succeeded} saved, ${outcome.failed.length} failed for ${outcome.seriesTitle}.`);
    }
  };

  const pendingTvTitle = tvWatch.pending
    ? `${tvWatch.pending.series.seriesTitle} · ${describeEpisodeSelection(tvWatch.pending.episodes)}`
    : "";

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

  // The store keeps raw entries; grouping into movie items and TV sessions is
  // derived here so every mutation regroups automatically.
  const timeline = useMemo(() => buildTimeline(bucket.items), [bucket.items]);

  const visibleItems = useMemo(() => {
    const currentYear = new Date().getUTCFullYear();
    const items = timeline.filter((item) => {
      if (!timelineItemMatchesSearch(item, search)) return false;
      if (periodFilter === "year" && timelineItemYear(item) !== currentYear) return false;
      if (periodFilter === "rated" && !timelineItemIsRated(item)) return false;
      return true;
    });
    return sortTimelineItems(items, sortMode);
  }, [periodFilter, search, sortMode, timeline]);

  const periods = useMemo(() => {
    const grouped = new Map<string, { month: string; year: string; items: TimelineItem[] }>();
    visibleItems.forEach((item) => {
      const date = new Date(`${item.calendarDay || "1970-01-01"}T00:00:00.000Z`);
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
      const existing = grouped.get(key) || {
        month: date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }),
        year: String(date.getUTCFullYear()),
        items: [],
      };
      existing.items.push(item);
      grouped.set(key, existing);
    });
    return [...grouped.values()];
  }, [visibleItems]);

  const selectedSession = useMemo(
    () => (selectedSessionId ? (timeline.find((item): item is TvSessionTimelineItem => item.kind === "tv_session" && item.id === selectedSessionId) ?? null) : null),
    [selectedSessionId, timeline]
  );

  const latest = bucket.items[0];
  const heroBackdrop = latest ? posterUrl(getEntryBackdropPath(latest)) : "";

  const openSession = (session: TvSessionTimelineItem) => {
    setSelected(null);
    setSelectedSessionId(session.id);
  };

  const closeDetails = () => {
    setSelected(null);
    setSelectedSessionId(null);
  };

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
      if (selectedSession && selectedSession.entries.length <= 1) setSelectedSessionId(null);
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

  // Movie cards are unchanged from the movie-only timeline.
  const renderMovieCard = (entry: HistoryEntry) => (
                    <button type="button" className="history-card" data-testid="history-row" key={entry._id} onClick={() => openDetails(entry)} aria-label={`View details for ${getEntryTitle(entry)}`}>
                      <span className="history-card-poster-wrap">
                        <img className="history-card-poster" src={posterUrl(getEntryPosterPath(entry))} alt={`${getEntryTitle(entry)} poster`} onError={(event) => { (event.currentTarget as HTMLImageElement).src = "/default-avatar.png"; }} />
                        {(entry.averageRating != null || entry.currentUserRating != null) && (
                          <span className="history-card-rating"><FaStar aria-hidden="true" /> {entry.averageRating ?? entry.currentUserRating}</span>
                        )}
                      </span>
                      <span className="history-card-body">
                        <strong className="history-card-title">{getEntryTitle(entry)}</strong>
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
  );

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
              ? "Every movie night and TV binge, remembered. Revisit what you watched, where you watched it, and who shared the screen with you."
              : `The complete screening record for ${activeGroup?.name || "your group"}.`}
          </p>
          <p className="history-hero-stats">
            <strong>{bucket.total}</strong> {bucket.total === 1 ? "watch event" : "watch events"}
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
          <button type="button" className="history-add-tv" onClick={() => setTvPickerOpen(true)} data-testid="add-tv-watch">
            <FaTv aria-hidden="true" /> Add TV Watch
          </button>
        </section>

        {tvWatch.outcome && tvWatch.outcome.failed.length > 0 && (
          <section className="history-tv-outcome" role="alert" data-testid="tv-outcome">
            <p>
              <strong>{tvWatch.outcome.seriesTitle}:</strong> {tvWatch.outcome.succeeded} saved,{" "}
              {tvWatch.outcome.failed.length} failed —{" "}
              {tvWatch.outcome.failed.map((item) => `${formatEpisodeCode(item.episode)} (${item.message})`).join(", ")}
            </p>
            <div>
              <button type="button" onClick={() => tvWatch.retryFailed()} disabled={tvWatch.submitting}>
                {tvWatch.submitting ? "Retrying…" : "Retry failed"}
              </button>
              <button type="button" onClick={tvWatch.dismissOutcome}>Dismiss</button>
            </div>
          </section>
        )}

        {activeLoading ? (
          <div className="history-skeleton" role="status" aria-label="Loading watch history">{Array.from({ length: 6 }).map((_, index) => <div key={index} />)}</div>
        ) : activeError ? (
          <section className="history-state"><h2>History unavailable</h2><p>{activeError}</p><button type="button" onClick={() => isPersonal ? fetchPersonal() : fetchGroup(activeTab)}>Try again</button></section>
        ) : visibleItems.length === 0 ? (
          <section className="history-state"><h2>{bucket.items.length ? "No matching screenings" : "Your next movie night starts here"}</h2><p>{bucket.items.length ? "Try another title or clear the active filter." : isPersonal ? "Mark a movie as watched from your Watchlist, or add a TV watch above, and it will appear in your personal diary." : "Movies and episodes marked watched by this group will collect here."}</p>{bucket.items.length ? <button type="button" onClick={() => { setSearch(""); setPeriodFilter("all"); }}>Clear filters</button> : null}</section>
        ) : (
          <div className="history-timeline">
            {periods.map((period) => (
              <section className="history-period" key={`${period.month}-${period.year}`}>
                <header className="history-period-label"><h2>{period.month}</h2><span>{period.year}</span></header>
                <div className="history-period-list">
                  {period.items.map((item) =>
                    item.kind === "movie" ? (
                      renderMovieCard(item.entry)
                    ) : (
                      <button type="button" className="history-card history-card--session" data-testid="history-session" key={item.id} onClick={() => openSession(item)} aria-label={`View ${item.seriesTitle} episodes watched on ${formatCalendarDay(item.calendarDay)}`}>
                        <span className="history-card-poster-wrap">
                          <img className="history-card-poster" src={posterUrl(item.posterPath)} alt={`${item.seriesTitle} poster`} onError={(event) => { (event.currentTarget as HTMLImageElement).src = "/default-avatar.png"; }} />
                        </span>
                        <span className="history-card-body">
                          <strong className="history-card-title">{item.seriesTitle}</strong>
                          <span className="history-card-episode">{item.episodeSummary}</span>
                          <span className="history-card-meta">
                            <span>{formatCalendarDay(item.calendarDay)}</span>
                            <span>{item.watchCount === 1 ? "1 episode watch" : `${item.watchCount} episode watches`}</span>
                          </span>
                          <span className="history-card-action">Episodes</span>
                        </span>
                      </button>
                    )
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <AddTvWatchModal isOpen={tvPickerOpen} onClose={() => setTvPickerOpen(false)} onSelect={handleTvSelection} />
      <GroupSelectModal
        isOpen={!!tvWatch.pending}
        onClose={() => tvWatch.setPending(null)}
        onSelect={handleTvDetails}
        groups={groupList}
        watchTitle={pendingTvTitle}
      />

      <Modal isOpen={!!selected || !!selectedSession} onClose={closeDetails} size="lg" ariaLabel="Watch history details" className="history-details-modal">
        {!selected && selectedSession ? (
          <div className="history-details" data-testid="session-detail">
            <img className="history-details-poster" src={posterUrl(selectedSession.posterPath)} alt={`${selectedSession.seriesTitle} poster`} />
            <div className="history-details-body">
              <p className="history-details-context">{formatCalendarDay(selectedSession.calendarDay)}</p>
              <h2>{selectedSession.seriesTitle}</h2>
              <p className="history-details-episode">{selectedSession.episodeSummary}</p>
              <p className="history-session-hint">{selectedSession.watchCount === 1 ? "One episode watch this day." : `${selectedSession.watchCount} episode watches this day. Each one can be edited on its own.`}</p>
              <ul className="history-session-list">
                {selectedSession.entries.map((entry) => (
                  <li key={entry._id}>
                    <button type="button" className="history-session-entry" data-testid="session-entry" onClick={() => openDetails(entry)}>
                      <span className="history-session-code">{entry.tv ? formatEpisodeCode(entry.tv) : ""}</span>
                      <span className="history-session-body">
                        <strong>{entry.tv?.episodeTitle || "Untitled episode"}</strong>
                        <span>
                          {formatDate(entry.watchedAt)}
                          {entry.watchedLocation ? ` · ${entry.watchedLocation}` : ""}
                          {entry.averageRating != null || entry.currentUserRating != null ? ` · ★ ${entry.averageRating ?? entry.currentUserRating}` : ""}
                        </span>
                      </span>
                      <span className="history-card-action">Details</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : selected ? (
          <div className="history-details">
            <img className="history-details-poster" src={posterUrl(getEntryPosterPath(selected))} alt={`${getEntryTitle(selected)} poster`} />
            <div className="history-details-body">
              {selectedSession && (
                <button type="button" className="history-details-back" onClick={() => setSelected(null)}>← All episodes that day</button>
              )}
              <p className="history-details-context">{selected.scope === "group" ? selected.group?.name : "Personal history"}</p>
              <h2>{getEntryTitle(selected)}</h2>
              {isTvEntry(selected) && <p className="history-details-episode">{getEntrySubtitle(selected)}</p>}
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
    </div>
  );
};

export default WatchHistory;
