import {
  IdentifierNamespace,
  TimestampConfidence,
} from "../../models/IntegrationMediaState";
import { StremioLibraryItemDto } from "./stremioClient";
import { normalizeImdbTitleId } from "./imdbTitleId";
import { decodeStremioWatchedVideos, parseStremioEpisodeId } from "./stremioWatchedBitfield";

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export interface NormalizedStremioMovieState {
  providerMediaType: "movie";
  providerItemId: string;
  identifierNamespace: IdentifierNamespace;
  providerRevision?: string;
  providerLastWatchedAt?: Date;
  completed: boolean;
  removed: boolean;
  timestampConfidence: TimestampConfidence;
}

export interface NormalizedStremioTvEpisodeState extends Omit<NormalizedStremioMovieState, "providerMediaType"> {
  providerMediaType: "tv_episode";
  providerSeriesImdbId: string;
  seasonNumber: number;
  episodeNumber: number;
}

export type NormalizedStremioState = NormalizedStremioMovieState | NormalizedStremioTvEpisodeState;

export const normalizeStremioTvEpisodes = (
  item: StremioLibraryItemDto,
  orderedVideoIds: string[],
  observedAt: Date
): NormalizedStremioTvEpisodeState[] => {
  const seriesId = normalizeImdbTitleId(item.id ?? "");
  if (item.type !== "series" || !seriesId || !item.state.watched || !Number.isFinite(observedAt.getTime())) return [];
  const watched = decodeStremioWatchedVideos(item.state.watched, orderedVideoIds);
  if (!watched) return [];
  return watched.flatMap(videoId => {
    const identity = parseStremioEpisodeId(videoId);
    if (!identity || identity.seriesImdbId !== seriesId) return [];
    return [{
      providerMediaType: "tv_episode" as const,
      providerItemId: `${seriesId}:${identity.seasonNumber}:${identity.episodeNumber}`,
      identifierNamespace: "imdb" as const,
      providerSeriesImdbId: seriesId,
      seasonNumber: identity.seasonNumber,
      episodeNumber: identity.episodeNumber,
      providerRevision: item.revision,
      // Explicit product policy: episode watch dates are the first sync date,
      // never the series-level lastWatched or the bitfield anchor's date.
      providerLastWatchedAt: new Date(observedAt),
      timestampConfidence: "observed_at" as const,
      completed: true,
      removed: item.removed,
    }];
  });
};

const validProviderDate = (value: string | undefined) => {
  if (!value || !ISO_DATE_TIME.test(value)) return undefined;
  // Stremio's Rust clients serialize nanoseconds. MongoDB/JavaScript Dates
  // retain milliseconds, so discard only sub-millisecond precision.
  const timestamp = Date.parse(value.replace(/(\.\d{3})\d+(?=Z|[+-]\d{2}:\d{2}$)/, "$1"));
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp);
};

export const normalizeStremioMovie = (
  item: StremioLibraryItemDto
): NormalizedStremioMovieState | null => {
  if (item.type !== "movie") return null;
  const rawId = item.id?.trim();
  if (!rawId) return null;
  const imdbId = normalizeImdbTitleId(rawId);
  const providerItemId = imdbId ?? rawId;
  const providerLastWatchedAt = validProviderDate(item.state.lastWatched);

  return {
    providerMediaType: "movie",
    providerItemId,
    identifierNamespace: imdbId ? "imdb" : "provider",
    providerRevision: item.revision,
    providerLastWatchedAt,
    completed:
      typeof item.state.timesWatched === "number" && item.state.timesWatched > 0,
    removed: item.removed,
    timestampConfidence: providerLastWatchedAt ? "provider_last_watched" : "unknown",
  };
};

export const normalizeStremioMovieSnapshot = (items: StremioLibraryItemDto[]) =>
  items
    .map(normalizeStremioMovie)
    .filter((item): item is NormalizedStremioMovieState => item !== null);
