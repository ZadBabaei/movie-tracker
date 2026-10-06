import { Types } from "mongoose";
import Movie from "../../models/movie";
import WatchHistoryEntry from "../../models/WatchHistoryEntry";
import { IIntegrationMediaState } from "../../models/IntegrationMediaState";

// Exact timestamps match. Midnight UTC is the existing date-only input
// representation: it matches an occurrence on that UTC calendar date.
// No tolerance is applied to other timestamps, so same-day rewatches survive.
export const occurrenceDates = (watchedAt: Date) => [
  watchedAt,
  new Date(Date.UTC(watchedAt.getUTCFullYear(), watchedAt.getUTCMonth(), watchedAt.getUTCDate())),
];

export const findEquivalentStremioHistory = async (
  state: IIntegrationMediaState,
  ownerId: Types.ObjectId
) => {
  if (!state.providerLastWatchedAt) return null;
  if (state.providerMediaType === "tv_episode") {
    if (!state.matchedTv) return null;
    return WatchHistoryEntry.findOne({
      createdBy: ownerId,
      participants: ownerId,
      mediaType: "tv_episode",
      "tv.seriesTmdbId": state.matchedTv.seriesTmdbId,
      "tv.seasonNumber": state.matchedTv.seasonNumber,
      "tv.episodeNumber": state.matchedTv.episodeNumber,
      // An observed sync date cannot establish a historical occurrence.
      // Conservatively acknowledge existing manual history on first discovery.
      ...(state.timestampConfidence === "observed_at" ? {} : {
        watchedAt: { $in: occurrenceDates(state.providerLastWatchedAt) },
      }),
    }).select("_id");
  }
  const movies = await Movie.find({ imdbID: { $in: [
    `tmdb-${state.matchedTmdbId}`,
    ...(state.identifierNamespace === "imdb" ? [state.providerItemId] : []),
  ] } }).select("_id");
  return WatchHistoryEntry.findOne({
    createdBy: ownerId,
    participants: ownerId,
    watchedAt: { $in: occurrenceDates(state.providerLastWatchedAt) },
    mediaType: { $ne: "tv_episode" },
    movieId: { $in: movies.map(movie => movie._id) },
  }).select("_id");
};
