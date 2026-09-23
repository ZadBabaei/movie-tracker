import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IWatchHistoryRating {
  userId: Types.ObjectId;
  rating: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IWatchHistoryEntry extends Document {
  movieId: Types.ObjectId;
  scope: "personal" | "group";
  groupId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  participants: Types.ObjectId[];
  watchedAt: Date;
  watchedLocation: string;
  watchedNotes: string;
  ratings: IWatchHistoryRating[];
  integrationMediaStateId?: Types.ObjectId;
  legacyGroupId?: Types.ObjectId;
  legacyHistoryItemId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const ratingSchema = new Schema<IWatchHistoryRating>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 10 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const watchHistoryEntrySchema = new Schema<IWatchHistoryEntry>(
  {
    movieId: { type: Schema.Types.ObjectId, ref: "Movie", required: true, index: true },
    scope: { type: String, enum: ["personal", "group"], required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    participants: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    watchedAt: { type: Date, required: true, default: Date.now, index: true },
    watchedLocation: { type: String, default: "", trim: true, maxlength: 300 },
    watchedNotes: { type: String, default: "", trim: true, maxlength: 2000 },
    ratings: { type: [ratingSchema], default: [] },
    integrationMediaStateId: {
      type: Schema.Types.ObjectId,
      ref: "IntegrationMediaState",
      select: false,
    },
    legacyGroupId: { type: Schema.Types.ObjectId, ref: "Group" },
    legacyHistoryItemId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

watchHistoryEntrySchema.index({ participants: 1, watchedAt: -1, _id: -1 });
watchHistoryEntrySchema.index({ groupId: 1, watchedAt: -1, _id: -1 });
watchHistoryEntrySchema.index(
  { integrationMediaStateId: 1 },
  {
    unique: true,
    partialFilterExpression: { integrationMediaStateId: { $exists: true } },
  }
);
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

watchHistoryEntrySchema.pre("validate", function (next) {
  if (this.scope === "group" && !this.groupId) {
    next(new Error("Group history entries require a groupId."));
    return;
  }
  if (this.scope === "personal") this.groupId = undefined;
  if (!this.participants?.length) this.participants = [this.createdBy];
  next();
});

const WatchHistoryEntry: Model<IWatchHistoryEntry> =
  mongoose.models.WatchHistoryEntry ||
  mongoose.model<IWatchHistoryEntry>("WatchHistoryEntry", watchHistoryEntrySchema);

export default WatchHistoryEntry;
