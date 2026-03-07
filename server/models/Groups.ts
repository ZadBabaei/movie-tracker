import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IGroupInvitation {
  userId: Types.ObjectId;
  inviterName?: string;
}

export interface IGroup extends Document {
  name: string;
  creator: Types.ObjectId;
  members: Types.ObjectId[];
  pendingInvitations: IGroupInvitation[];
  movies: Types.ObjectId[];
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
    movies: [{ type: Schema.Types.ObjectId, ref: "Movie" }],
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
