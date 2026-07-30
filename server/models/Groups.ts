import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IGroupInvitation {
  userId: Types.ObjectId;
  inviterName?: string;
}

export interface IWatchedMovie {
  movieId: Types.ObjectId;
  watchedDate?: Date;
  watchedAt?: Date;
  watchedWhere?: string;
  watchedLocation?: string;
  watchedWith: Types.ObjectId[];
  watchedNotes?: string;
  ratings?: {
    userId: Types.ObjectId;
    rating: number;
    createdAt?: Date;
    updatedAt?: Date;
  }[];
}

export interface IGroupWatchlistItem {
  movieId: Types.ObjectId;
  addedBy?: Types.ObjectId;
  addedAt?: Date;
}

export interface IGroup extends Document {
  name: string;
  slug?: string;
  creator: Types.ObjectId;
  members: Types.ObjectId[];
  pendingInvitations: IGroupInvitation[];
  movies: IWatchedMovie[];
  watchlist: IGroupWatchlistItem[];
  currentPoll?: Types.ObjectId;
  pollHistory: Types.ObjectId[];
  hasActivePoll(): Promise<boolean>;
}

const groupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    creator: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
    pendingInvitations: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        inviterName: { type: String },
      },
    ],
    movies: [
      {
        movieId: { type: Schema.Types.ObjectId, ref: "Movie", required: true },
        watchedDate: { type: Date, default: Date.now },
        watchedAt: { type: Date },
        watchedWhere: { type: String, default: "" },
        watchedLocation: { type: String, default: "" },
        watchedWith: [{ type: Schema.Types.ObjectId, ref: "User" }],
        watchedNotes: { type: String, default: "" },
        ratings: [
          {
            userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
            rating: { type: Number, required: true, min: 1, max: 10 },
            createdAt: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now },
          },
        ],
      },
    ],
    watchlist: [
      {
        movieId: { type: Schema.Types.ObjectId, ref: "Movie", required: true },
        addedBy: { type: Schema.Types.ObjectId, ref: "User" },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    currentPoll: { type: Schema.Types.ObjectId, ref: "Poll" },
    pollHistory: [{ type: Schema.Types.ObjectId, ref: "Poll" }],
  },
  { timestamps: true }
);

groupSchema.index({ slug: 1 }, { unique: true, sparse: true });

groupSchema.methods.hasActivePoll = async function (): Promise<boolean> {
  const Poll = mongoose.model("Poll");
  const activePoll = await Poll.findOne({ groupId: this._id, status: "active" });
  return !!activePoll;
};

const Group: Model<IGroup> =
  mongoose.models.Group || mongoose.model<IGroup>("Group", groupSchema);

export default Group;
