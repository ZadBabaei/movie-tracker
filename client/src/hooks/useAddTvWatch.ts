import { useCallback, useRef, useState } from "react";
import {
  createTvEpisodeHistoryEntries,
  TvEpisodeWatchIdentity,
  TvWatchDetails,
} from "../api/historyApi";
import type { TvEpisodeDetails, TvSeriesDetails } from "../api/tmdb";
import type { WatchMetadata } from "../component/GroupSelectModal";

export interface TvWatchSelection {
  series: TvSeriesDetails;
  episodes: TvEpisodeDetails[];
}

export interface TvWatchFailure {
  episode: TvEpisodeWatchIdentity;
  message: string;
}

export interface TvWatchOutcome {
  scopeId: string;
  seriesTitle: string;
  succeeded: number;
  failed: TvWatchFailure[];
}

interface UseAddTvWatchOptions {
  /** Called once per submission that saved at least one episode. */
  onSaved?: (outcome: TvWatchOutcome) => void | Promise<void>;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "S01 · E01–E03" for contiguous runs, "S01 · E01, E03" otherwise. */
export const describeEpisodeSelection = (episodes: Array<{ seasonNumber: number; episodeNumber: number }>): string => {
  if (!episodes.length) return "";
  const bySeason = new Map<number, number[]>();
  episodes.forEach((episode) => {
    bySeason.set(episode.seasonNumber, [...(bySeason.get(episode.seasonNumber) || []), episode.episodeNumber]);
  });
  return [...bySeason.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, numbers]) => {
      const sorted = [...new Set(numbers)].sort((a, b) => a - b);
      const contiguous = sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
      const episodesText =
        sorted.length === 1
          ? `E${pad(sorted[0])}`
          : contiguous
            ? `E${pad(sorted[0])}–E${pad(sorted[sorted.length - 1])}`
            : sorted.map((value) => `E${pad(value)}`).join(", ");
      return `S${pad(season)} · ${episodesText}`;
    })
    .join(" · ");
};

export const toTvWatchIdentity = (series: TvSeriesDetails, episode: TvEpisodeDetails): TvEpisodeWatchIdentity => ({
  seriesTmdbId: series.seriesTmdbId,
  seasonNumber: episode.seasonNumber,
  episodeNumber: episode.episodeNumber,
  episodeTmdbId: episode.episodeTmdbId,
  seriesTitle: series.seriesTitle,
  episodeTitle: episode.episodeTitle,
  posterPath: series.posterPath,
  backdropPath: series.backdropPath,
  stillPath: episode.stillPath,
  airDate: episode.airDate,
});

export const toTvWatchDetails = (scopeId: string, metadata?: WatchMetadata): TvWatchDetails => ({
  scopeId,
  watchedAt: metadata?.watchedDate || undefined,
  watchedLocation: metadata?.watchedWhere || undefined,
  participants: metadata?.watchedWith,
  watchedNotes: metadata?.watchedNotes || undefined,
});

/**
 * Drives the "Add TV watch" flow: hold the episodes the picker produced, send
 * them one request each once watch details are known, and keep the failures
 * around so they can be retried without resending what already saved.
 */
export const useAddTvWatch = ({ onSaved }: UseAddTvWatchOptions = {}) => {
  const [pending, setPending] = useState<TvWatchSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<TvWatchOutcome | null>(null);
  const submittingRef = useRef(false);
  const lastDetailsRef = useRef<TvWatchDetails | null>(null);

  const run = useCallback(
    async (episodes: TvEpisodeWatchIdentity[], details: TvWatchDetails, seriesTitle: string) => {
      // A ref, not state, so a second click before React re-renders is ignored.
      if (submittingRef.current || !episodes.length) return null;
      submittingRef.current = true;
      setSubmitting(true);
      lastDetailsRef.current = details;
      try {
        const result = await createTvEpisodeHistoryEntries(episodes, details);
        const next: TvWatchOutcome = {
          scopeId: details.scopeId,
          seriesTitle,
          succeeded: result.succeeded.length,
          failed: result.failed.map((item) => ({ episode: item.episode, message: item.message })),
        };
        setOutcome(next);
        if (next.succeeded > 0) await onSaved?.(next);
        return next;
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [onSaved]
  );

  const submit = useCallback(
    (scopeId: string, metadata?: WatchMetadata) => {
      if (!pending) return Promise.resolve(null);
      const { series, episodes } = pending;
      setPending(null);
      return run(
        episodes.map((episode) => toTvWatchIdentity(series, episode)),
        toTvWatchDetails(scopeId, metadata),
        series.seriesTitle
      );
    },
    [pending, run]
  );

  /** Resend only the episodes that failed last time, with the same details. */
  const retryFailed = useCallback(() => {
    if (!outcome?.failed.length || !lastDetailsRef.current) return Promise.resolve(null);
    return run(
      outcome.failed.map((item) => item.episode),
      lastDetailsRef.current,
      outcome.seriesTitle
    );
  }, [outcome, run]);

  const dismissOutcome = useCallback(() => setOutcome(null), []);

  return { pending, setPending, submit, submitting, outcome, retryFailed, dismissOutcome };
};
