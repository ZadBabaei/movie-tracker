import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FaArrowLeft, FaMapMarkerAlt, FaStar, FaStickyNote, FaUsers } from "react-icons/fa";
import { Link, useParams, useSearchParams } from "react-router-dom";
import HistoryEntryDetailModal, { formatWatchedDate } from "../component/HistoryEntryDetailModal";
import VerticalNavbar from "../component/VerticalNavbar";
import { fetchSeriesHistory } from "../api/historyApi";
import { getTvSeries, isTmdbError, tmdbImageUrl, TvSeriesDetails } from "../api/tmdb";
import { useGroupStore } from "../store/useGroupStore";
import { HistoryEntry } from "../store/useWatchHistoryStore";
import { formatEpisodeCode, historyImageUrl, isTvEntry } from "../utils/historyEntry";
import {
  groupOccurrencesByMonth,
  parseSeriesScope,
  parseSeriesTmdbId,
  sortOccurrences,
  summarizeSeriesHistory,
} from "../utils/seriesHistory";
import "./TvSeriesHistory.css";

/**
 * /history/tv/:seriesTmdbId — one series, two sources:
 *   - TMDB describes the series (hero, metadata, cast) via getTvSeries;
 *   - Movie Tracker describes the user's relationship with it: every
 *     WatchHistoryEntry occurrence from GET /api/history/tv/:id, fetched in
 *     full for the requested scope, independent of the bounded /history page.
 * The two load independently; either one failing leaves the other usable.
 */

const CAST_LIMIT = 12;

type Status<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "error"; message: string };

const tmdbFailureMessage = (error: unknown) => {
  if (isTmdbError(error)) {
    if (error.kind === "not_found") return "TMDB has no series with this id.";
    if (error.kind === "network") return "Couldn't reach TMDB for series details.";
    if (error.kind === "config") return "Series details aren't configured on this deployment.";
    if (error.kind === "rate_limited") return "TMDB is busy right now; series details will be back shortly.";
  }
  return "Series details couldn't be loaded from TMDB.";
};

const historyFailureMessage = (error: any) =>
  error?.response?.data?.msg || (error?.response?.status === 403 ? "You don't have access to this group's history." : "Unable to load this series history.");

const formatMonthYear = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "—";

const formatAirDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

const yearOf = (value: string | null) => (value ? value.slice(0, 4) : null);

const entryRating = (entry: HistoryEntry) => entry.averageRating ?? entry.currentUserRating ?? null;

// Stored snapshot paths can go stale on TMDB; a broken image is worse than none.
const hideBrokenImage = (event: React.SyntheticEvent<HTMLImageElement>) => {
  event.currentTarget.style.display = "none";
};
const hideBrokenPoster = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const frame = event.currentTarget.closest(".series-poster-frame") as HTMLElement | null;
  if (frame) frame.hidden = true;
  else hideBrokenImage(event);
};

const TvSeriesHistory: React.FC = () => {
  const params = useParams<{ seriesTmdbId: string }>();
  const [searchParams] = useSearchParams();
  const seriesTmdbId = parseSeriesTmdbId(params.seriesTmdbId);
  const scope = useMemo(() => parseSeriesScope(searchParams), [searchParams]);
  const { groupList, fetchGroups } = useGroupStore();

  const [series, setSeries] = useState<Status<TvSeriesDetails>>({ state: "loading" });
  const [history, setHistory] = useState<Status<HistoryEntry[]>>({ state: "loading" });
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [showAllCast, setShowAllCast] = useState(false);

  const routeInvalid = seriesTmdbId === null || scope.invalid;

  useEffect(() => {
    if (scope.scope === "group") void fetchGroups();
  }, [fetchGroups, scope.scope]);

  // TMDB metadata — never blocks the history below it.
  useEffect(() => {
    if (routeInvalid || seriesTmdbId === null) return undefined;
    const controller = new AbortController();
    setSeries({ state: "loading" });
    getTvSeries(seriesTmdbId, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setSeries({ state: "ready", data }); })
      .catch((error) => {
        if (controller.signal.aborted || (isTmdbError(error) && error.kind === "aborted")) return;
        setSeries({ state: "error", message: tmdbFailureMessage(error) });
      });
    return () => controller.abort();
  }, [routeInvalid, seriesTmdbId]);

  const loadHistory = useCallback(async () => {
    if (routeInvalid || seriesTmdbId === null) return;
    setHistory({ state: "loading" });
    try {
      const data = await fetchSeriesHistory<HistoryEntry>(seriesTmdbId, { scope: scope.scope, groupId: scope.groupId || undefined });
      setHistory({ state: "ready", data: sortOccurrences((data.items || []).filter(isTvEntry)) });
    } catch (error) {
      setHistory({ state: "error", message: historyFailureMessage(error) });
    }
  }, [routeInvalid, scope.groupId, scope.scope, seriesTmdbId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const entries = history.state === "ready" ? history.data : [];
  const summary = useMemo(() => summarizeSeriesHistory(entries), [entries]);
  const months = useMemo(() => groupOccurrencesByMonth(entries), [entries]);
  const details = series.state === "ready" ? series.data : null;

  const seriesTitle = details?.seriesTitle || summary.seriesTitle || "TV series";
  const backdrop = tmdbImageUrl(details?.backdropPath, "w1280") || historyImageUrl(summary.backdropPath, "w780");
  const poster = tmdbImageUrl(details?.posterPath, "w500") || historyImageUrl(summary.posterPath);
  const activeGroup = scope.scope === "group" ? groupList.find((group) => group._id === scope.groupId) : undefined;
  const groupName = scope.scope === "group" ? activeGroup?.name || entries[0]?.group?.name || "Group" : null;
  const backHref = activeGroup?.slug ? `/history?group=${encodeURIComponent(activeGroup.slug)}` : "/history";

  // Mutations go through the shared modal + store; the page only mirrors the
  // result onto its own complete list so counts and order stay exact.
  const handleUpdated = (entry: HistoryEntry) => {
    setSelected(entry);
    setHistory((current) => (current.state === "ready" ? { state: "ready", data: sortOccurrences(current.data.map((item) => (item._id === entry._id ? entry : item))) } : current));
  };
  const handleDeleted = (entryId: string) => {
    setSelected(null);
    setHistory((current) => (current.state === "ready" ? { state: "ready", data: current.data.filter((item) => item._id !== entryId) } : current));
  };

  if (routeInvalid) {
    return (
      <div className="series-page">
        <VerticalNavbar />
        <main className="series-main series-main--message">
          <Link to="/history" className="series-back"><FaArrowLeft aria-hidden="true" /> Back to Watch History</Link>
          <section className="series-state" role="alert" data-testid="series-invalid">
            <h1>{seriesTmdbId === null ? "That series link isn't valid" : "That group link isn't valid"}</h1>
            <p>{seriesTmdbId === null ? "A series page needs a numeric TMDB series id, for example /history/tv/95396." : "Open the series from the group's history so the link carries a valid group."}</p>
          </section>
        </main>
      </div>
    );
  }

  const cast = details ? (showAllCast ? details.cast : details.cast.slice(0, CAST_LIMIT)) : [];
  const facts = details
    ? [
        yearOf(details.firstAirDate),
        details.status,
        details.numberOfSeasons != null ? `${details.numberOfSeasons} season${details.numberOfSeasons === 1 ? "" : "s"}` : null,
        details.numberOfEpisodes != null ? `${details.numberOfEpisodes} episodes` : null,
        details.episodeRunTime != null ? `~${details.episodeRunTime} min` : null,
      ].filter((fact): fact is string => !!fact)
    : [];

  return (
    <div className="series-page">
      <VerticalNavbar />
      <header className={`series-hero${series.state === "loading" ? " series-hero--loading" : ""}`}>
        {backdrop && <img className="series-hero-backdrop" src={backdrop} alt="" aria-hidden="true" onError={hideBrokenImage} />}
        <div className="series-hero-scrim" />
        <div className="series-hero-inner">
          <Link to={backHref} className="series-back"><FaArrowLeft aria-hidden="true" /> {groupName ? `${groupName} history` : "Watch History"}</Link>
          <div className="series-hero-grid">
            <div className="series-poster-frame">
              {poster ? (
                <img className="series-poster" src={poster} alt={`${seriesTitle} poster`} onError={hideBrokenPoster} />
              ) : (
                <div className="series-poster series-poster--empty" aria-hidden="true" />
              )}
            </div>
            <div className="series-hero-body">
              <p className="series-kicker"><span className="series-tv-badge">TV</span> {groupName ? `${groupName} · series history` : "Your series history"}</p>
              {series.state === "loading" && !summary.seriesTitle ? (
                <div className="series-skeleton series-skeleton--title" role="status" aria-label="Loading series details" />
              ) : (
                <h1>{seriesTitle}</h1>
              )}
              {details?.tagline && <p className="series-tagline">{details.tagline}</p>}
              {facts.length > 0 && (
                <ul className="series-facts" aria-label="Series facts">
                  {facts.map((fact) => <li key={fact}>{fact}</li>)}
                </ul>
              )}
              {details && details.genres.length > 0 && (
                <ul className="series-genres" aria-label="Genres">
                  {details.genres.map((genre) => <li key={genre.id}>{genre.name}</li>)}
                </ul>
              )}
              {details?.overview && <p className="series-overview">{details.overview}</p>}
              {details && details.voteAverage != null && (
                <p className="series-tmdb-rating"><FaStar aria-hidden="true" /> <strong>{details.voteAverage.toFixed(1)}</strong> on TMDB{details.voteCount ? ` · ${details.voteCount.toLocaleString()} votes` : ""}</p>
              )}
              {series.state === "error" && (
                <p className="series-notice" role="status" data-testid="series-tmdb-warning">{series.message} Showing what Movie Tracker has stored for this series.</p>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="series-main">
        <section className="series-stats" aria-labelledby="series-stats-heading" data-testid="series-stats">
          <h2 id="series-stats-heading">{groupName ? `${groupName} and this series` : "You and this series"}</h2>
          {history.state === "loading" ? (
            <div className="series-skeleton series-skeleton--stats" role="status" aria-label="Loading your series history" />
          ) : history.state === "error" ? (
            <p className="series-stat-empty">Movie Tracker stats are unavailable until the history loads.</p>
          ) : (
            <dl className="series-stat-grid">
              <div><dt>Watch occurrences</dt><dd>{summary.watchCount}</dd></div>
              <div><dt>Unique episodes</dt><dd>{summary.uniqueEpisodes}</dd></div>
              <div><dt>Seasons watched</dt><dd>{summary.seasonsWatched}</dd></div>
              <div><dt>First watched</dt><dd>{formatMonthYear(summary.firstWatchedAt)}</dd></div>
              <div><dt>Latest watched</dt><dd>{formatMonthYear(summary.latestWatchedAt)}</dd></div>
            </dl>
          )}
        </section>

        {series.state === "loading" ? (
          <section className="series-cast" aria-label="Cast">
            <div className="series-skeleton series-skeleton--cast" role="status" aria-label="Loading cast" />
          </section>
        ) : details && details.cast.length > 0 ? (
          <section className="series-cast" aria-labelledby="series-cast-heading" data-testid="series-cast">
            <div className="series-section-head">
              <h2 id="series-cast-heading">Cast</h2>
              {details.cast.length > CAST_LIMIT && (
                <button type="button" onClick={() => setShowAllCast((value) => !value)}>
                  {showAllCast ? "Show fewer" : `Show all ${details.cast.length}`}
                </button>
              )}
            </div>
            <ul className="series-cast-strip">
              {cast.map((member) => (
                <li key={`${member.personTmdbId}-${member.character || ""}`} className="series-cast-card">
                  {member.profilePath ? (
                    <img src={tmdbImageUrl(member.profilePath, "w185")} alt={member.name} loading="lazy" onError={hideBrokenImage} />
                  ) : (
                    <span className="series-cast-noart" aria-hidden="true">{member.name.slice(0, 1)}</span>
                  )}
                  <strong>{member.name}</strong>
                  {member.character && <span>{member.character}</span>}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="series-history" aria-labelledby="series-history-heading">
          <div className="series-section-head">
            <h2 id="series-history-heading">{groupName ? `${groupName}'s watch history` : "Your watch history"}</h2>
            {history.state === "ready" && entries.length > 0 && (
              <p>{summary.watchCount === 1 ? "1 watch occurrence" : `${summary.watchCount} watch occurrences`} · each one can be edited on its own</p>
            )}
          </div>

          {history.state === "loading" ? (
            <div className="series-skeleton-list" role="status" aria-label="Loading watch occurrences">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="series-skeleton" />)}</div>
          ) : history.state === "error" ? (
            <section className="series-state" role="alert" data-testid="series-history-error">
              <h3>History unavailable</h3>
              <p>{history.message}</p>
              <button type="button" onClick={() => loadHistory()}>Try again</button>
            </section>
          ) : entries.length === 0 ? (
            <section className="series-state" data-testid="series-history-empty">
              <h3>No watched episodes found in this history scope.</h3>
              <p>Episodes you mark watched from Watch History will show up here, one card per watch.</p>
            </section>
          ) : (
            <div className="series-months">
              {months.map((month) => (
                <section className="series-month" key={month.key} aria-label={`${month.month} ${month.year}`.trim()}>
                  <header className="series-month-label"><h3>{month.month}</h3><span>{month.year}</span></header>
                  <ul className="series-occurrences">
                    {month.entries.map((entry) => {
                      const tv = entry.tv!;
                      const still = historyImageUrl(tv.stillPath, "w300") || historyImageUrl(tv.backdropPath, "w300") || historyImageUrl(tv.posterPath, "w185");
                      const rating = entryRating(entry);
                      const code = formatEpisodeCode(tv);
                      return (
                        <li key={entry._id}>
                          <button
                            type="button"
                            className="series-occurrence"
                            data-testid="series-occurrence"
                            data-entry-id={entry._id}
                            onClick={() => setSelected(entry)}
                            aria-label={`${code}${tv.episodeTitle ? ` ${tv.episodeTitle}` : ""}, watched ${formatWatchedDate(entry.watchedAt)}${rating != null ? `, rated ${rating} out of 10` : ""}. Open details`}
                          >
                            <span className="series-occurrence-still">
                              {still ? <img src={still} alt="" loading="lazy" onError={hideBrokenImage} /> : <span className="series-occurrence-noart" aria-hidden="true" />}
                              <span className="series-occurrence-code">{code}</span>
                            </span>
                            <span className="series-occurrence-body">
                              <strong>{tv.episodeTitle || "Untitled episode"}</strong>
                              <span className="series-occurrence-watched">Watched {formatWatchedDate(entry.watchedAt)}</span>
                              <span className="series-occurrence-meta">
                                {rating != null && <span className="series-occurrence-rating"><FaStar aria-hidden="true" /> {rating}/10</span>}
                                {entry.watchedLocation && <span><FaMapMarkerAlt aria-hidden="true" /> {entry.watchedLocation}</span>}
                                {entry.scope === "group" && entry.group?.name && <span><FaUsers aria-hidden="true" /> {entry.group.name}</span>}
                                {entry.scope !== "group" && entry.participants.length > 1 && <span><FaUsers aria-hidden="true" /> {entry.participants.length} watched</span>}
                                {entry.watchedNotes && <span className="series-occurrence-notes"><FaStickyNote aria-hidden="true" /> Notes</span>}
                              </span>
                              {tv.airDate && <span className="series-occurrence-air">Aired {formatAirDate(tv.airDate)}</span>}
                            </span>
                            <span className="series-occurrence-action">Details</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>
      </main>

      <HistoryEntryDetailModal entry={selected} onClose={() => setSelected(null)} onUpdated={handleUpdated} onDeleted={handleDeleted} />
    </div>
  );
};

export default TvSeriesHistory;
