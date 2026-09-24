import { useCallback, useState } from "react";
import { createHistoryEntry, DirectHistoryMovie } from "../api/historyApi";
import { tmdbImageUrl } from "../api/tmdb";
import type { HistoryMediaSearchResult } from "../component/HistoryMediaSearch";
import type { WatchMetadata } from "../component/GroupSelectModal";
import { describeEpisodeSelection, TvWatchOutcome, TvWatchSelection, useAddTvWatch } from "./useAddTvWatch";

/**
 * One "Add to History" flow for both media kinds:
 *
 *   closed → search → (tv_episodes) → watch_details → closed
 *
 * A movie result goes straight to watch details and is saved with the
 * direct-history contract from main. A TV result first opens the episode
 * picker; every chosen episode is then saved as its own history record.
 */

export type AddHistoryStep = "closed" | "search" | "tv_episodes" | "watch_details";

export type PendingHistoryMedia =
  | { kind: "movie"; movie: DirectHistoryMovie }
  | { kind: "tv_series"; seriesTmdbId: number; title: string }
  | { kind: "tv"; selection: TvWatchSelection };

export interface MovieSaveOutcome {
  kind: "movie";
  title: string;
  scopeId: string;
}

export interface TvSaveOutcome extends TvWatchOutcome {
  kind: "tv";
}

export type AddHistoryOutcome = MovieSaveOutcome | TvSaveOutcome;

interface UseAddToHistoryOptions {
  /** Called after a save that created at least one record. */
  onSaved?: (outcome: AddHistoryOutcome) => void | Promise<void>;
  onError?: (message: string) => void;
}

/** Search result → the direct-history movie contract used by main. */
export const toDirectHistoryMovie = (result: HistoryMediaSearchResult): DirectHistoryMovie => ({
  imdbID: `tmdb-${result.tmdbId}`,
  title: result.title,
  poster_path: result.posterPath ? tmdbImageUrl(result.posterPath, "w500") : undefined,
  vote_average: result.voteAverage ?? 0,
});

export const useAddToHistory = ({ onSaved, onError }: UseAddToHistoryOptions = {}) => {
  const [step, setStep] = useState<AddHistoryStep>("closed");
  const [pending, setPending] = useState<PendingHistoryMedia | null>(null);
  const [savingMovie, setSavingMovie] = useState(false);

  const tv = useAddTvWatch({ onSaved: (outcome) => onSaved?.({ kind: "tv", ...outcome }) });

  const open = useCallback(() => {
    setPending(null);
    setStep("search");
  }, []);

  const close = useCallback(() => {
    if (savingMovie || tv.submitting) return;
    setPending(null);
    tv.setPending(null);
    setStep("closed");
  }, [savingMovie, tv]);

  const toggle = useCallback(() => {
    if (step === "closed") open();
    else close();
  }, [close, open, step]);

  /** A row from the unified search was chosen. */
  const selectSearchResult = useCallback((result: HistoryMediaSearchResult) => {
    if (result.kind === "movie") {
      setPending({ kind: "movie", movie: toDirectHistoryMovie(result) });
      setStep("watch_details");
      return;
    }
    setPending({ kind: "tv_series", seriesTmdbId: result.tmdbId, title: result.title });
    setStep("tv_episodes");
  }, []);

  /** Episodes were confirmed in the picker. */
  const selectEpisodes = useCallback(
    (selection: TvWatchSelection) => {
      setPending({ kind: "tv", selection });
      tv.setPending(selection);
      setStep("watch_details");
    },
    [tv]
  );

  const backToSearch = useCallback(() => {
    setPending(null);
    tv.setPending(null);
    setStep("search");
  }, [tv]);

  /** Watch details confirmed for whatever is pending. */
  const submitDetails = useCallback(
    async (scopeId: string, metadata?: WatchMetadata) => {
      if (!pending) return;
      if (pending.kind === "tv") {
        const outcome = await tv.submit(scopeId, metadata);
        setPending(null);
        setStep("closed");
        return outcome;
      }
      if (pending.kind !== "movie" || savingMovie) return;
      const scope = scopeId === "personal" ? "personal" : "group";
      setSavingMovie(true);
      try {
        // Same payload main sends: no `source`, so the Watchlist is untouched.
        await createHistoryEntry({
          movie: pending.movie,
          scope,
          ...(scope === "group" ? { groupId: scopeId, participants: metadata?.watchedWith || [] } : {}),
          watchedAt: metadata?.watchedDate || new Date().toISOString().slice(0, 10),
          watchedLocation: metadata?.watchedWhere?.trim() || "",
          watchedNotes: metadata?.watchedNotes?.trim() || "",
        });
        const outcome: MovieSaveOutcome = { kind: "movie", title: pending.movie.title, scopeId };
        setPending(null);
        setStep("closed");
        await onSaved?.(outcome);
        return outcome;
      } catch (error: any) {
        // Keep the selection so the person can fix details and try again.
        onError?.(error?.response?.data?.msg || "Unable to add this movie to watch history.");
        return null;
      } finally {
        setSavingMovie(false);
      }
    },
    [onError, onSaved, pending, savingMovie, tv]
  );

  const detailsTitle =
    pending?.kind === "movie"
      ? pending.movie.title
      : pending?.kind === "tv"
        ? `${pending.selection.series.seriesTitle} · ${describeEpisodeSelection(pending.selection.episodes)}`
        : "";

  return {
    step,
    pending,
    open,
    close,
    toggle,
    selectSearchResult,
    selectEpisodes,
    backToSearch,
    submitDetails,
    detailsTitle,
    submitting: savingMovie || tv.submitting,
    tvOutcome: tv.outcome,
    retryFailedEpisodes: tv.retryFailed,
    dismissTvOutcome: tv.dismissOutcome,
  };
};
