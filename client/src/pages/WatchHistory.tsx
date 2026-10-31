import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaMinus, FaPlus, FaSearch, FaStar, FaTimes } from "react-icons/fa";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import GroupSelectModal, { WatchMetadata } from "../component/GroupSelectModal";
import HistoryEntryDetailModal from "../component/HistoryEntryDetailModal";
import HistoryMediaSearch from "../component/HistoryMediaSearch";
import TvEpisodePicker from "../component/TvEpisodePicker";
import TvSessionCard from "../component/TvSessionCard";
import VerticalNavbar from "../component/VerticalNavbar";
import { AddHistoryOutcome, useAddToHistory } from "../hooks/useAddToHistory";
import { useSocket } from "../hooks/useSocket";
import { useGroupStore } from "../store/useGroupStore";
import type { HistoryTypeFilter } from "../api/historyApi";
import { HistoryEntry, historyBucketKey, useWatchHistoryStore } from "../store/useWatchHistoryStore";
import { getAvatarUrl, handleAvatarError } from "../utils/avatar";
import { formatEpisodeCode, getEntryBackdropPath, getEntryPosterPath, getEntryTitle } from "../utils/historyEntry";
import {
  buildTimeline,
  sortTimelineItems,
  timelineItemIsRated,
  timelineItemMatchesSearch,
  timelineItemYear,
  TimelineItem,
} from "../utils/historyTimeline";
import "./WatchHistory.css";

type PeriodFilter = "all" | "year" | "rated";
type SortMode = "recent" | "rating" | "title";
const ACTIVE_TAB_KEY = "history:activeTab";
const TYPE_FILTERS: Array<[HistoryTypeFilter, string]> = [["all", "All"], ["movie", "Movies"], ["tv", "TV Series"]];
const TYPE_EMPTY_COPY: Record<Exclude<HistoryTypeFilter, "all">, [string, string]> = {
  movie: ["No movies yet", "Movies you log will show up here."],
  tv: ["No TV episodes yet", "Watched TV episodes, with their season and episode, will show up here."],
};

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

const WatchHistory: React.FC = () => {
  const { groupList, fetchGroups } = useGroupStore();
  const {
    personal,
    byGroup,
    typed,
    loading,
    errors,
    fetchPersonal,
    fetchGroup,
    invalidate,
    isBucketFresh,
  } = useWatchHistoryStore();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTabState] = useState(() => localStorage.getItem(ACTIVE_TAB_KEY) || "personal");
  const [search, setSearch] = useState("");
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [typeFilter, setTypeFilter] = useState<HistoryTypeFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [monthPage, setMonthPage] = useState(1);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const deepLinkApplied = useRef(false);
  // Views requested since the page mounted or the scope tab last changed. A
  // view is reused without a request only if it is in here *and* the store
  // still considers it fresh; entering the page always reloads, since history
  // can change elsewhere (e.g. marking a movie watched from a watchlist).
  const loadedViews = useRef<Set<string>>(new Set());
  const activeGroup = groupList.find((group) => group._id === activeTab);
  const isPersonal = activeTab === "personal";
  const socket = useSocket(isPersonal ? "" : activeTab);

  const setActiveTab = useCallback((tab: string) => {
    // Socket updates are only received for the open group, so a scope we
    // leave can change unobserved; every tab switch reloads, as before. The
    // no-request reuse only applies to filter switches within one scope.
    loadedViews.current.clear();
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
    setActiveTabState(tab);
    setSearch("");
    setPeriodFilter("all");
    setTypeFilter("all");
    setMonthPage(1);
    setExpandedMonths(new Set());
  }, []);

  const changeTypeFilter = (type: HistoryTypeFilter) => {
    if (type === typeFilter) return;
    setTypeFilter(type);
    setMonthPage(1);
    setExpandedMonths(new Set());
  };

  // One flow for movies and TV: search → (episodes) → watch details → save.
  // Saves land in the scope they were recorded to and, because personal history
  // also lists group watches the user took part in, in the personal bucket.
  const handleSaved = useCallback(
    async (outcome: AddHistoryOutcome) => {
      if (outcome.kind === "movie") {
        toast.success(`${outcome.title} added to ${outcome.scopeId === "personal" ? "your" : "group"} watch history.`);
      } else if (outcome.failed.length === 0) {
        toast.success(`${outcome.succeeded} episode${outcome.succeeded === 1 ? "" : "s"} of ${outcome.seriesTitle} saved to history.`);
      } else {
        toast.warn(`${outcome.succeeded} saved, ${outcome.failed.length} failed for ${outcome.seriesTitle}.`);
      }
      invalidate();
      setActiveTab(outcome.scopeId);
      const refreshes = [fetchPersonal(false, 1)];
      if (outcome.scopeId !== "personal") refreshes.push(fetchGroup(outcome.scopeId, false, 1));
      await Promise.all(refreshes);
    },
    [fetchGroup, fetchPersonal, invalidate, setActiveTab]
  );
  const addFlow = useAddToHistory({ onSaved: handleSaved, onError: (message) => toast.error(message) });

  const handleDetailsSubmit = async (scopeId: string, metadata?: WatchMetadata) => {
    const outcome = await addFlow.submitDetails(scopeId, metadata);
    if (outcome && outcome.kind === "tv" && outcome.succeeded === 0) {
      toast.error(`Couldn't save ${outcome.seriesTitle} — no episodes were recorded.`);
    }
  };

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

  const viewKey = historyBucketKey(activeTab, typeFilter);

  // Runs on view changes only. Freshness is read from the store rather than
  // subscribed to, so an invalidation alone never triggers a request: stale
  // views reload when they are next shown.
  useEffect(() => {
    if (loadedViews.current.has(viewKey) && isBucketFresh(viewKey, monthPage)) return;
    loadedViews.current.add(viewKey);
    if (isPersonal) fetchPersonal(false, monthPage, typeFilter);
    else fetchGroup(activeTab, false, monthPage, typeFilter);
  }, [activeTab, fetchGroup, fetchPersonal, isBucketFresh, isPersonal, monthPage, typeFilter, viewKey]);

  useEffect(() => {
    if (isPersonal) return;
    // Another member changed this group's history: every cached view may be
    // affected (all three filters here, and personal history, which includes
    // group watches), so invalidate them all and reload only the visible one.
    const refresh = () => {
      invalidate();
      fetchGroup(activeTab, false, monthPage, typeFilter);
    };
    socket.on("group:history_updated", refresh);
    socket.on("group:history_deleted", refresh);
    socket.on("group:history_rating_updated", refresh);
    return () => {
      socket.off("group:history_updated", refresh);
      socket.off("group:history_deleted", refresh);
      socket.off("group:history_rating_updated", refresh);
    };
  }, [activeTab, fetchGroup, invalidate, isPersonal, socket, monthPage, typeFilter]);

  const emptyBucket: typeof personal = { items: [], total: 0, nextCursor: null };
  const bucket = typeFilter !== "all"
    ? (typed[viewKey] || emptyBucket)
    : isPersonal ? personal : (byGroup[activeTab] || emptyBucket);
  const activeLoading = !!loading[viewKey];
  const activeError = errors[viewKey];
  const refetchActive = () => (isPersonal ? fetchPersonal(false, monthPage, typeFilter) : fetchGroup(activeTab, false, monthPage, typeFilter));

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
  }, [visibleItems, bucket.monthPagination]);

  const changeMonthPage = (page: number) => {
    setMonthPage(page);
    setExpandedMonths(new Set());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const latest = bucket.items[0];
  const heroBackdrop = latest ? posterUrl(getEntryBackdropPath(latest)) : "";


  // Movie cards are unchanged from the movie-only timeline.
  // TV cards link to the series page in the scope they were opened from.
  const seriesHref = (seriesTmdbId: number) =>
    isPersonal ? `/history/tv/${seriesTmdbId}?scope=personal` : `/history/tv/${seriesTmdbId}?scope=group&groupId=${encodeURIComponent(activeTab)}`;

  const openDetails = (entry: HistoryEntry) => setSelected(entry);

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
          <div className="history-type-tabs" role="group" aria-label="Content type">
            {TYPE_FILTERS.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={typeFilter === value} onClick={() => changeTypeFilter(value)}>{label}</button>
            ))}
          </div>
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
            className={`history-add-toggle${addFlow.step !== "closed" ? " history-add-toggle--open" : ""}`}
            onClick={addFlow.toggle}
            aria-expanded={addFlow.step !== "closed"}
            data-testid="add-to-history"
          >
            {addFlow.step !== "closed" ? <FaTimes aria-hidden="true" /> : <FaPlus aria-hidden="true" />}
            <span>{addFlow.step !== "closed" ? "Close" : "Add to History"}</span>
          </button>
        </section>

        {addFlow.step === "search" && (
          <div className="history-quickadd">
            <HistoryMediaSearch onSelect={addFlow.selectSearchResult} />
          </div>
        )}

        {addFlow.tvOutcome && addFlow.tvOutcome.failed.length > 0 && (
          <section className="history-tv-outcome" role="alert" data-testid="tv-outcome">
            <p>
              <strong>{addFlow.tvOutcome.seriesTitle}:</strong> {addFlow.tvOutcome.succeeded} saved,{" "}
              {addFlow.tvOutcome.failed.length} failed —{" "}
              {addFlow.tvOutcome.failed.map((item) => `${formatEpisodeCode(item.episode)} (${item.message})`).join(", ")}
            </p>
            <div>
              <button type="button" onClick={() => addFlow.retryFailedEpisodes()} disabled={addFlow.submitting}>
                {addFlow.submitting ? "Retrying…" : "Retry failed"}
              </button>
              <button type="button" onClick={addFlow.dismissTvOutcome}>Dismiss</button>
            </div>
          </section>
        )}

        {activeLoading ? (
          <div className="history-skeleton" role="status" aria-label="Loading watch history">{Array.from({ length: 6 }).map((_, index) => <div key={index} />)}</div>
        ) : activeError ? (
          <section className="history-state"><h2>History unavailable</h2><p>{activeError}</p><button type="button" onClick={() => refetchActive()}>Try again</button></section>
        ) : visibleItems.length === 0 && !bucket.items.length && typeFilter !== "all" ? (
          <section className="history-state" data-testid="history-type-empty"><h2>{TYPE_EMPTY_COPY[typeFilter][0]}</h2><p>{TYPE_EMPTY_COPY[typeFilter][1]}</p><button type="button" onClick={() => changeTypeFilter("all")}>Show all</button></section>
        ) : visibleItems.length === 0 ? (
          <section className="history-state"><h2>{bucket.items.length ? "No matching screenings" : "Your next movie night starts here"}</h2><p>{bucket.items.length ? "Try another title or clear the active filter." : isPersonal ? "Add something you've watched, or mark a movie watched from your Watchlist." : "Add something this group watched, or mark a movie watched from the group's Watchlist."}</p>{bucket.items.length ? <button type="button" onClick={() => { setSearch(""); setPeriodFilter("all"); }}>Clear filters</button> : null}</section>
        ) : (
          <div className="history-timeline">
            {periods.map((period) => (
              <section className="history-period" key={`${period.month}-${period.year}`}>
                <header className="history-period-label"><h2>{period.month}</h2><span>{period.year}</span></header>
                <div className="history-month-content">
                  <div className="history-month-toolbar">
                  {period.items.length > 4 && <button className="history-month-toggle" type="button"
                    aria-label={`${expandedMonths.has(`${period.month}-${period.year}`) ? "Collapse" : "Expand"} ${period.month} ${period.year}`}
                    aria-expanded={expandedMonths.has(`${period.month}-${period.year}`)}
                    aria-controls={`history-month-${period.month}-${period.year}`}
                    onClick={() => setExpandedMonths((previous) => {
                      const next = new Set(previous); const key = `${period.month}-${period.year}`;
                      if (next.has(key)) next.delete(key); else next.add(key); return next;
                    })}>{expandedMonths.has(`${period.month}-${period.year}`) ? <FaMinus aria-hidden="true" /> : <FaPlus aria-hidden="true" />}</button>}
                  </div>
                <div className="history-period-list history-month-preview" id={`history-month-${period.month}-${period.year}`}>
                  {(expandedMonths.has(`${period.month}-${period.year}`) ? period.items : period.items.slice(0, 4)).map((item) =>
                    item.kind === "movie" ? (
                      renderMovieCard(item.entry)
                    ) : (
                      <TvSessionCard key={item.id} session={item} formattedDay={formatCalendarDay(item.calendarDay)} to={seriesHref(item.seriesTmdbId)} />
                    )
                  )}
                  {period.items.length === 0 && <p className="history-empty-month">{search || periodFilter !== "all" ? "No matching entries this month." : "No watches this month."}</p>}
                </div>
                </div>
              </section>
            ))}
          </div>
        )}
        {bucket.monthPagination && (
          <nav className="history-pagination" aria-label="History pages">
            <button type="button" disabled={activeLoading || monthPage === 1} onClick={() => changeMonthPage(monthPage - 1)}>Previous</button>
            {Array.from({ length: bucket.monthPagination.totalPages }, (_, index) => index + 1).filter((page) => page === 1 || page === bucket.monthPagination!.totalPages || Math.abs(page - monthPage) <= 2).map((page, index, pages) => (
              <React.Fragment key={page}>
                {index > 0 && page - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}
                <button type="button" aria-label={`Page ${page}`} aria-current={page === monthPage ? "page" : undefined} disabled={activeLoading} onClick={() => changeMonthPage(page)}>{page}</button>
              </React.Fragment>
            ))}
            <button type="button" disabled={activeLoading || monthPage >= bucket.monthPagination.totalPages} onClick={() => changeMonthPage(monthPage + 1)}>Next</button>
          </nav>
        )}
      </main>

      <TvEpisodePicker
        isOpen={addFlow.step === "tv_episodes"}
        series={addFlow.pending?.kind === "tv_series" ? { seriesTmdbId: addFlow.pending.seriesTmdbId, title: addFlow.pending.title } : null}
        onClose={addFlow.close}
        onBack={addFlow.backToSearch}
        onSelect={addFlow.selectEpisodes}
      />
      <GroupSelectModal
        isOpen={addFlow.step === "watch_details"}
        onClose={addFlow.close}
        onSelect={handleDetailsSubmit}
        groups={groupList}
        watchTitle={addFlow.detailsTitle}
        submitting={addFlow.submitting}
      />

      <HistoryEntryDetailModal entry={selected} onClose={() => setSelected(null)} onUpdated={setSelected} onDeleted={() => setSelected(null)} />
    </div>
  );
};

export default WatchHistory;
