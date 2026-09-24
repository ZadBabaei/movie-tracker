import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type WatchHistoryMediaType = "movie" | "tv_episode";

export const MEDIA_TYPES: WatchHistoryMediaType[] = ["movie", "tv_episode"];

export interface IWatchHistoryRating {
  userId: Types.ObjectId;
  rating: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Identity is (seriesTmdbId, seasonNumber, episodeNumber). Everything else is a
// display snapshot so history renders without a TMDB round-trip per row.
export interface IWatchHistoryTvEpisode {
  seriesTmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeTmdbId?: number;
  seriesTitle: string;
  episodeTitle?: string;
  posterPath?: string;
  backdropPath?: string;
  stillPath?: string;
  airDate?: Date;
}

export interface IWatchHistoryEntry extends Document {
  // Documents written before TV support have no mediaType; readers must treat
  // a missing value as "movie". New documents always get the default.
  mediaType: WatchHistoryMediaType;
  movieId?: Types.ObjectId;
  tv?: IWatchHistoryTvEpisode;
  scope: "personal" | "group";
  groupId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  participants: Types.ObjectId[];
  watchedAt: Date;
  watchedLocation: string;
  watchedNotes: string;
  ratings: IWatchHistoryRating[];
  legacyGroupId?: Types.ObjectId;
  legacyHistoryItemId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export const resolveMediaType = (value: unknown): WatchHistoryMediaType =>
  value === "tv_episode" ? "tv_episode" : "movie";

const ratingSchema = new Schema<IWatchHistoryRating>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 10 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const tvEpisodeSchema = new Schema<IWatchHistoryTvEpisode>(
  {
    seriesTmdbId: { type: Number, required: true, min: 1, validate: Number.isInteger },
    // Season 0 is how TMDB numbers specials.
    seasonNumber: { type: Number, required: true, min: 0, validate: Number.isInteger },
    episodeNumber: { type: Number, required: true, min: 1, validate: Number.isInteger },
    episodeTmdbId: { type: Number, min: 1, validate: Number.isInteger },
    seriesTitle: { type: String, required: true, trim: true, maxlength: 300 },
    episodeTitle: { type: String, trim: true, maxlength: 300 },
    posterPath: { type: String, trim: true, maxlength: 500 },
    backdropPath: { type: String, trim: true, maxlength: 500 },
    stillPath: { type: String, trim: true, maxlength: 500 },
    airDate: { type: Date },
  },
  { _id: false }
);

const watchHistoryEntrySchema = new Schema<IWatchHistoryEntry>(
  {
    mediaType: { type: String, enum: MEDIA_TYPES, default: "movie" },
    movieId: {
      type: Schema.Types.ObjectId,
      ref: "Movie",
      index: true,
      required: function (this: IWatchHistoryEntry) {
        return resolveMediaType(this.mediaType) === "movie";
      },
    },
    tv: {
      type: tvEpisodeSchema,
      required: function (this: IWatchHistoryEntry) {
        return resolveMediaType(this.mediaType) === "tv_episode";
      },
    },
    scope: { type: String, enum: ["personal", "group"], required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    participants: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    watchedAt: { type: Date, required: true, default: Date.now, index: true },
    watchedLocation: { type: String, default: "", trim: true, maxlength: 300 },
    watchedNotes: { type: String, default: "", trim: true, maxlength: 2000 },
    ratings: { type: [ratingSchema], default: [] },
    legacyGroupId: { type: Schema.Types.ObjectId, ref: "Group" },
    legacyHistoryItemId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

watchHistoryEntrySchema.index({ participants: 1, watchedAt: -1, _id: -1 });
watchHistoryEntrySchema.index({ groupId: 1, watchedAt: -1, _id: -1 });
watchHistoryEntrySchema.index(
  { legacyGroupId: 1, legacyHistoryItemId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      legacyGroupId: { $exists: true },
      legacyHistoryItemId: { $exists: true },
    },
  }
);
// Series page: "everything this user watched of series X, newest first". Partial
// so movie rows (the vast majority) never enter it. Not unique: rewatches are
// separate documents by design.
watchHistoryEntrySchema.index(
  { participants: 1, "tv.seriesTmdbId": 1, watchedAt: -1, _id: -1 },
  { partialFilterExpression: { mediaType: "tv_episode" } }
);

watchHistoryEntrySchema.pre("validate", function (next) {
  if (this.scope === "group" && !this.groupId) {
    next(new Error("Group history entries require a groupId."));
    return;
  }
  if (this.scope === "personal") this.groupId = undefined;
  if (!this.participants?.length) this.participants = [this.createdBy];

  // Exactly one identity per document. Reject rather than reinterpret so a
  // malformed write never becomes a half-movie/half-episode row.
  const mediaType = resolveMediaType(this.mediaType);
  if (mediaType === "movie" && this.tv) {
    next(new Error("Movie history entries cannot carry TV episode data."));
    return;
  }
  if (mediaType === "tv_episode" && this.movieId) {
    next(new Error("TV episode history entries cannot reference a movie."));
    return;
  }
  next();
});

const WatchHistoryEntry: Model<IWatchHistoryEntry> =
  mongoose.models.WatchHistoryEntry ||
  mongoose.model<IWatchHistoryEntry>("WatchHistoryEntry", watchHistoryEntrySchema);

export default WatchHistoryEntry;
