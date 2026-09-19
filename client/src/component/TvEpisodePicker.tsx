import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import {
  getTvSeason,
  getTvSeries,
  isTmdbError,
  tmdbImageUrl,
  tvSeasonLabel,
  TvEpisodeDetails,
  TvSeasonDetails,
  TvSeasonSummary,
  TvSeriesDetails,
} from "../api/tmdb";
import { describeEpisodeSelection, TvWatchSelection } from "../hooks/useAddTvWatch";
import Modal from "./Modal/Modal";
import "./TvEpisodePicker.css";

export interface TvEpisodePickerSeries {
  seriesTmdbId: number;
  /** Shown while the full series details load. */
  title?: string;
}

interface TvEpisodePickerProps {
  isOpen: boolean;
  /** The series chosen in the unified Add-to-History search. */
  series: TvEpisodePickerSeries | null;
  onClose: () => void;
  /** "Back to search" — the caller returns to the search step. */
  onBack?: () => void;
  /** Called with the confirmed series + aired episodes; the caller collects watch details next. */
  onSelect: (selection: TvWatchSelection) => void;
}

// Same date convention the rest of the mark-watched flow uses (UTC calendar
// day). Local-calendar semantics are settled in the timeline-grouping phase.
export const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export const isUpcomingEpisode = (episode: Pick<TvEpisodeDetails, "airDate">, today = todayIsoDate()) =>
  Boolean(episode.airDate) && (episode.airDate as string) > today;

/**
 * Latest regular season that has started airing; otherwise the first regular
 * season; otherwise whatever exists (specials only). Null when there are none.
 * Purely a UI convenience — never part of a saved record.
 */
export const pickDefaultSeason = (seasons: TvSeasonSummary[], today = todayIsoDate()): number | null => {
  const regular = seasons.filter((season) => !season.isSpecials);
  const aired = regular.filter((season) => season.airDate && season.airDate <= today);
  if (aired.length) return aired[aired.length - 1].seasonNumber;
  if (regular.length) return regular[0].seasonNumber;
  return seasons.length ? seasons[0].seasonNumber : null;
};

const yearOf = (date: string | null) => (date ? date.slice(0, 4) : "");

const seriesYears = (series: TvSeriesDetails) => {
  const start = yearOf(series.firstAirDate);
  if (!start) return "";
  const ended = series.status === "Ended" || series.status === "Canceled";
  const end = ended ? yearOf(series.lastAirDate) : "";
  return end && end !== start ? `${start}–${end}` : ended ? start : `${start}–`;
};

const friendlyError = (error: unknown, fallback: string) => {
  if (isTmdbError(error)) {
    if (error.kind === "not_found") return "That season isn't available on TMDB.";
    if (error.kind === "network") return "Couldn't reach TMDB. Check your connection and try again.";
    if (error.kind === "rate_limited") return "TMDB is busy right now. Please try again in a moment.";
    if (error.kind === "config") return "TV search isn't configured on this deployment.";
  }
  return fallback;
};

const episodeKey = (episode: Pick<TvEpisodeDetails, "seasonNumber" | "episodeNumber">) =>
  `${episode.seasonNumber}:${episode.episodeNumber}`;

const TvEpisodePicker: React.FC<TvEpisodePickerProps> = ({ isOpen, series: seed, onClose, onBack, onSelect }) => {
  const [series, setSeries] = useState<TvSeriesDetails | null>(null);
  const [seriesError, setSeriesError] = useState("");
  const [seriesAttempt, setSeriesAttempt] = useState(0);

  const [activeSeason, setActiveSeason] = useState<number | null>(null);
  const [seasons, setSeasons] = useState<Record<number, TvSeasonDetails>>({});
  const [seasonLoading, setSeasonLoading] = useState<number | null>(null);
  const [seasonError, setSeasonError] = useState("");
  const [seasonAttempt, setSeasonAttempt] = useState(0);
  const [selected, setSelected] = useState<Map<string, TvEpisodeDetails>>(new Map());

  const seriesAbort = useRef<AbortController | null>(null);
  const seasonAbort = useRef<AbortController | null>(null);
  const today = useMemo(() => todayIsoDate(), []);

  const reset = useCallback(() => {
    seriesAbort.current?.abort();
    seasonAbort.current?.abort();
    setSeries(null);
    setSeriesError("");
    setActiveSeason(null);
    setSeasons({});
    setSeasonLoading(null);
    setSeasonError("");
    setSelected(new Map());
  }, []);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  const loadSeason = useCallback(
    async (seriesTmdbId: number, seasonNumber: number) => {
      seasonAbort.current?.abort();
      const controller = new AbortController();
      seasonAbort.current = controller;
      setSeasonLoading(seasonNumber);
      setSeasonError("");
      try {
        const season = await getTvSeason(seriesTmdbId, seasonNumber, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setSeasons((prev) => ({ ...prev, [seasonNumber]: season }));
      } catch (error) {
        if (controller.signal.aborted || (isTmdbError(error) && error.kind === "aborted")) return;
        setSeasonError(friendlyError(error, "Couldn't load this season. Please try again."));
      } finally {
        if (!controller.signal.aborted) setSeasonLoading(null);
      }
    },
    []
  );

  // Lazy-load a season the first time it becomes active.
  useEffect(() => {
    if (!series || activeSeason === null || seasons[activeSeason]) return;
    void loadSeason(series.seriesTmdbId, activeSeason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeason, series, seasonAttempt]);

  // Load the chosen series whenever the picker opens for a (new) series.
  useEffect(() => {
    if (!isOpen || !seed) return undefined;
    reset();
    const controller = new AbortController();
    seriesAbort.current = controller;
    (async () => {
      try {
        const details = await getTvSeries(seed.seriesTmdbId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setSeries(details);
        setActiveSeason(pickDefaultSeason(details.seasons, today));
      } catch (error) {
        if (controller.signal.aborted || (isTmdbError(error) && error.kind === "aborted")) return;
        setSeriesError(friendlyError(error, "Couldn't load that series. Please try again."));
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, seed?.seriesTmdbId, seriesAttempt]);

  const toggleEpisode = (episode: TvEpisodeDetails) => {
    if (isUpcomingEpisode(episode, today)) return;
    setSelected((prev) => {
      const next = new Map(prev);
      const key = episodeKey(episode);
      if (next.has(key)) next.delete(key);
      else next.set(key, episode);
      return next;
    });
  };

  const currentSeason = activeSeason !== null ? seasons[activeSeason] : undefined;
  const airedInSeason = currentSeason?.episodes.filter((episode) => !isUpcomingEpisode(episode, today)) ?? [];
  const allAiredSelected = airedInSeason.length > 0 && airedInSeason.every((episode) => selected.has(episodeKey(episode)));

  const toggleWholeSeason = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allAiredSelected) airedInSeason.forEach((episode) => next.delete(episodeKey(episode)));
      else airedInSeason.forEach((episode) => next.set(episodeKey(episode), episode));
      return next;
    });
  };

  const selectedEpisodes = useMemo(
    () => [...selected.values()].sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber),
    [selected]
  );

  const confirm = () => {
    if (!series || !selectedEpisodes.length) return;
    onSelect({ series, episodes: selectedEpisodes });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" ariaLabel="Choose episodes to add to history" className="tv-add-modal">
      {!series ? (
        <div className="tv-add-step" data-testid="tv-add-loading-step">
          {onBack && (
            <button type="button" className="tv-add-back" onClick={onBack}>
              <FaArrowLeft aria-hidden="true" /> Back to search
            </button>
          )}
          <p className="tv-add-kicker">TV series</p>
          <h2 className="tv-add-heading">{seed?.title || "Loading series"}</h2>
          {seriesError ? (
            <div className="tv-add-error" role="alert">
              <p>{seriesError}</p>
              <button type="button" onClick={() => setSeriesAttempt((value) => value + 1)}>Try again</button>
            </div>
          ) : (
            <p className="tv-add-status" role="status">Loading seasons and episodes…</p>
          )}
        </div>
      ) : (
        <div className="tv-add-step" data-testid="tv-add-episodes-step">
          {onBack && (
            <button type="button" className="tv-add-back" onClick={onBack}>
              <FaArrowLeft aria-hidden="true" /> Back to search
            </button>
          )}

          <header className="tv-add-series">
            {series.backdropPath && <img className="tv-add-series-backdrop" src={tmdbImageUrl(series.backdropPath, "w780")} alt="" aria-hidden="true" />}
            <div className="tv-add-series-scrim" />
            <div className="tv-add-series-inner">
              {series.posterPath ? (
                <img className="tv-add-series-poster" src={tmdbImageUrl(series.posterPath, "w185")} alt={`${series.seriesTitle} poster`} />
              ) : (
                <span className="tv-add-series-poster tv-add-series-poster--empty" aria-hidden="true">TV</span>
              )}
              <div>
                <p className="tv-add-kicker">Series</p>
                <h2 className="tv-add-heading">{series.seriesTitle}</h2>
                <p className="tv-add-series-meta">
                  {[seriesYears(series), series.status, series.numberOfSeasons ? `${series.numberOfSeasons} season${series.numberOfSeasons === 1 ? "" : "s"}` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {series.overview && <p className="tv-add-series-overview">{series.overview}</p>}
              </div>
            </div>
          </header>

          {series.seasons.length === 0 ? (
            <p className="tv-add-status">TMDB has no season information for this series yet.</p>
          ) : (
            <>
              <div className="tv-add-seasons" role="tablist" aria-label="Seasons">
                {series.seasons.map((season) => (
                  <button
                    key={season.seasonNumber}
                    type="button"
                    role="tab"
                    aria-selected={activeSeason === season.seasonNumber}
                    className={`tv-add-season${activeSeason === season.seasonNumber ? " active" : ""}${season.isSpecials ? " specials" : ""}`}
                    onClick={() => setActiveSeason(season.seasonNumber)}
                    data-testid="tv-season-tab"
                  >
                    {tvSeasonLabel(season.seasonNumber, season.name)}
                    {season.episodeCount !== null && <small>{season.episodeCount}</small>}
                  </button>
                ))}
              </div>

              <div className="tv-add-episodes" role="tabpanel">
                {activeSeason !== null && seasonLoading === activeSeason && !currentSeason ? (
                  <p className="tv-add-status" role="status">Loading episodes…</p>
                ) : seasonError && !currentSeason ? (
                  <div className="tv-add-error" role="alert">
                    <p>{seasonError}</p>
                    <button type="button" onClick={() => setSeasonAttempt((value) => value + 1)}>Try again</button>
                  </div>
                ) : currentSeason && currentSeason.episodes.length === 0 ? (
                  <p className="tv-add-status">No episodes are listed for {tvSeasonLabel(currentSeason.seasonNumber, currentSeason.name).toLowerCase()} yet.</p>
                ) : currentSeason ? (
                  <>
                    <div className="tv-add-episodes-head">
                      <span>{tvSeasonLabel(currentSeason.seasonNumber, currentSeason.name)}{currentSeason.isSpecials ? " — kept separate from numbered seasons" : ""}</span>
                      {airedInSeason.length > 0 && (
                        <button type="button" className="tv-add-linkbtn" onClick={toggleWholeSeason}>
                          {allAiredSelected ? "Clear season" : "Select all aired"}
                        </button>
                      )}
                    </div>
                    <ul className="tv-add-episode-list">
                      {currentSeason.episodes.map((episode) => {
                        const upcoming = isUpcomingEpisode(episode, today);
                        const key = episodeKey(episode);
                        const checked = selected.has(key);
                        return (
                          <li key={key}>
                            <label className={`tv-add-episode${checked ? " checked" : ""}${upcoming ? " upcoming" : ""}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={upcoming}
                                onChange={() => toggleEpisode(episode)}
                                aria-label={`Episode ${episode.episodeNumber}: ${episode.episodeTitle}${upcoming ? " (upcoming)" : ""}`}
                                data-testid="tv-episode-checkbox"
                              />
                              {episode.stillPath ? (
                                <img src={tmdbImageUrl(episode.stillPath, "w300")} alt="" />
                              ) : (
                                <span className="tv-add-episode-noart" aria-hidden="true" />
                              )}
                              <span className="tv-add-episode-body">
                                <strong>
                                  <span className="tv-add-episode-num">E{String(episode.episodeNumber).padStart(2, "0")}</span> {episode.episodeTitle}
                                </strong>
                                <span className="tv-add-episode-meta">
                                  {upcoming ? <em>Upcoming · {episode.airDate}</em> : episode.airDate || "Air date unknown"}
                                  {episode.runtime ? ` · ${episode.runtime} min` : ""}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}
              </div>
            </>
          )}

          <footer className="tv-add-footer">
            <span className="tv-add-selection" aria-live="polite">
              {selectedEpisodes.length
                ? `${selectedEpisodes.length} episode${selectedEpisodes.length === 1 ? "" : "s"} · ${describeEpisodeSelection(selectedEpisodes)}`
                : "Select the episodes you watched"}
            </span>
            <button type="button" className="tv-add-continue" onClick={confirm} disabled={!selectedEpisodes.length} data-testid="tv-add-continue">
              Continue
            </button>
          </footer>
        </div>
      )}
    </Modal>
  );
};

export default TvEpisodePicker;
