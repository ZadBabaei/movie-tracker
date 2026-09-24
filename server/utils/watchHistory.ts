import mongoose, { Types } from "mongoose";
import Group from "../models/Groups";
import WatchHistoryEntry, { resolveMediaType } from "../models/WatchHistoryEntry";

const objectId = (value: unknown): Types.ObjectId | null => {
  const id = String(value ?? "");
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
};

export interface LegacySyncResult {
  groupsScanned: number;
  entriesFound: number;
  entriesUpserted: number;
  invalidEntries: number;
}

export const syncLegacyGroupHistory = async (
  groupIds?: Array<string | Types.ObjectId>
): Promise<LegacySyncResult> => {
  const validIds = (groupIds || []).map(objectId).filter((id): id is Types.ObjectId => Boolean(id));
  const query = validIds.length ? { _id: { $in: validIds } } : {};
  const groups = await Group.find(query).select("_id creator movies").lean();
  const operations: Parameters<typeof WatchHistoryEntry.bulkWrite>[0] = [];
  let entriesFound = 0;
  let invalidEntries = 0;

  for (const group of groups) {
    for (const rawEntry of group.movies || []) {
      entriesFound += 1;
      const entry = rawEntry as any;
      const movieId = objectId(entry.movieId || entry);
      const historyItemId = objectId(entry._id);
      if (!movieId || !historyItemId) {
        invalidEntries += 1;
        continue;
      }

      const participants = (Array.isArray(entry.watchedWith) ? entry.watchedWith : [])
        .map(objectId)
        .filter((id: Types.ObjectId | null): id is Types.ObjectId => Boolean(id));
      const watchedAtCandidate = entry.watchedAt || entry.watchedDate;
      const watchedAt = watchedAtCandidate ? new Date(watchedAtCandidate) : new Date();
      const safeWatchedAt = Number.isNaN(watchedAt.getTime()) ? new Date() : watchedAt;
      const ratings = (Array.isArray(entry.ratings) ? entry.ratings : [])
        .map((rating: any) => ({
          userId: objectId(rating.userId),
          rating: Number(rating.rating),
          createdAt: rating.createdAt || new Date(),
          updatedAt: rating.updatedAt || rating.createdAt || new Date(),
        }))
        .filter((rating: any) => rating.userId && Number.isInteger(rating.rating) && rating.rating >= 1 && rating.rating <= 10);

      operations.push({
        updateOne: {
          filter: { legacyGroupId: group._id, legacyHistoryItemId: historyItemId },
          update: {
            $setOnInsert: {
              // Group.movies[] only ever holds movies; TV episodes never enter
              // the legacy array, so this sync stays movie-only.
              mediaType: "movie",
              movieId,
              scope: "group",
              groupId: group._id,
              createdBy: group.creator,
              participants: participants.length ? participants : [group.creator],
              watchedAt: safeWatchedAt,
              watchedLocation: String(entry.watchedLocation || entry.watchedWhere || "").trim(),
              watchedNotes: String(entry.watchedNotes || "").trim(),
              ratings,
              legacyGroupId: group._id,
              legacyHistoryItemId: historyItemId,
            },
          },
          upsert: true,
        },
      });
    }
  }

  let entriesUpserted = 0;
  if (operations.length) {
    const result = await WatchHistoryEntry.bulkWrite(operations, { ordered: false });
    entriesUpserted = result.upsertedCount;
  }

  return { groupsScanned: groups.length, entriesFound, entriesUpserted, invalidEntries };
};

export const getRatingSummary = (entry: any, currentUserId: string) => {
  const ratings = (Array.isArray(entry?.ratings) ? entry.ratings : [])
    .map((rating: any) => ({
      userId: rating.userId?._id?.toString?.() || rating.userId?.toString?.() || "",
      name: rating.userId?.name || "Member",
      avatar: rating.userId?.avatar || "",
      rating: Number(rating.rating),
    }))
    .filter((rating: any) => Number.isFinite(rating.rating) && rating.rating >= 1 && rating.rating <= 10);
  const ratingCount = ratings.length;
  const averageRating = ratingCount
    ? Number((ratings.reduce((sum: number, rating: any) => sum + rating.rating, 0) / ratingCount).toFixed(1))
    : null;
  const currentUserRating = ratings.find((rating: any) => rating.userId === currentUserId)?.rating ?? null;
  return { ratings, ratingCount, averageRating, currentUserRating };
};

const serializeTvEpisode = (tv: any) => ({
  seriesTmdbId: Number(tv?.seriesTmdbId) || 0,
  seasonNumber: Number(tv?.seasonNumber) || 0,
  episodeNumber: Number(tv?.episodeNumber) || 0,
  episodeTmdbId: tv?.episodeTmdbId ? Number(tv.episodeTmdbId) : null,
  seriesTitle: tv?.seriesTitle || "Untitled series",
  episodeTitle: tv?.episodeTitle || "",
  posterPath: tv?.posterPath || "",
  backdropPath: tv?.backdropPath || "",
  stillPath: tv?.stillPath || "",
  airDate: tv?.airDate || null,
});

// Title used for title sorting regardless of media type.
export const getHistoryEntryTitle = (entry: any): string => {
  if (resolveMediaType(entry?.mediaType) === "tv_episode") return entry?.tv?.seriesTitle || "";
  const movie = entry?.movieId;
  return movie && typeof movie === "object" ? movie.title || "" : "";
};

export const serializeHistoryEntry = (entry: any, currentUserId: string) => {
  const mediaType = resolveMediaType(entry.mediaType);
  const movie = entry.movieId || {};
  const group = entry.groupId && typeof entry.groupId === "object" ? entry.groupId : null;
  return {
    _id: entry._id?.toString?.() || String(entry._id),
    mediaType,
    scope: entry.scope,
    group: group
      ? { _id: group._id?.toString?.() || String(group._id), name: group.name, slug: group.slug }
      : null,
    createdBy: entry.createdBy?._id
      ? { _id: entry.createdBy._id.toString(), name: entry.createdBy.name, avatar: entry.createdBy.avatar || "" }
      : { _id: entry.createdBy?.toString?.() || String(entry.createdBy || "") },
    // Movies keep the shape existing clients depend on; episodes get `tv` and
    // a null `movie` so a consumer can never mistake one for the other.
    movie:
      mediaType === "movie"
        ? {
            _id: movie._id?.toString?.() || String(movie._id || movie),
            title: movie.title || "Untitled movie",
            imdbID: movie.imdbID || "",
            poster: movie.poster || "",
            vote_average: Number(movie.vote_average) || 0,
          }
        : null,
    tv: mediaType === "tv_episode" ? serializeTvEpisode(entry.tv) : null,
    participants: (entry.participants || []).map((participant: any) => ({
      _id: participant._id?.toString?.() || participant.toString?.() || String(participant),
      name: participant.name || "Member",
      avatar: participant.avatar || "",
    })),
    watchedAt: entry.watchedAt,
    watchedLocation: entry.watchedLocation || "",
    watchedNotes: entry.watchedNotes || "",
    ...getRatingSummary(entry, currentUserId),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
};
