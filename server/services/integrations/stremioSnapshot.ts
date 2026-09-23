import {
  IdentifierNamespace,
  TimestampConfidence,
} from "../../models/IntegrationMediaState";
import { StremioLibraryItemDto } from "./stremioClient";
import { normalizeImdbTitleId } from "./imdbTitleId";

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

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

const validProviderDate = (value: string | undefined) => {
  if (!value || !ISO_DATE_TIME.test(value)) return undefined;
  const timestamp = Date.parse(value);
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
