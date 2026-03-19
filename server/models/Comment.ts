import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IComment extends Document {
  movieId: Types.ObjectId;
  userId: Types.ObjectId;
  username: string;
  text: string;
  parentId?: Types.ObjectId | null;
  createdAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    movieId: { type: Schema.Types.ObjectId, ref: "Movie", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true },
    text: { type: String, required: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Comment", default: null },
  },
  { timestamps: true }
);

const Comment: Model<IComment> = mongoose.model<IComment>("Comment", CommentSchema);

export default Comment;
