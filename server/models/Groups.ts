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
}

export interface IGroup extends Document {
  name: string;
  creator: Types.ObjectId;
  members: Types.ObjectId[];
  pendingInvitations: IGroupInvitation[];
  movies: IWatchedMovie[];
  currentPoll?: Types.ObjectId;
  pollHistory: Types.ObjectId[];
  hasActivePoll(): Promise<boolean>;
}

const groupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true },
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
      },
    ],
    currentPoll: { type: Schema.Types.ObjectId, ref: "Poll" },
    pollHistory: [{ type: Schema.Types.ObjectId, ref: "Poll" }],
  },
  { timestamps: true }
);

groupSchema.methods.hasActivePoll = async function (): Promise<boolean> {
  const Poll = mongoose.model("Poll");
  const activePoll = await Poll.findOne({ groupId: this._id, status: "active" });
  return !!activePoll;
};

const Group: Model<IGroup> =
  mongoose.models.Group || mongoose.model<IGroup>("Group", groupSchema);

export default Group;
