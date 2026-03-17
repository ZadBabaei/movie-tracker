import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IPollMovie {
  tmdbId: string;
  title: string;
  poster_path?: string;
  vote_average?: number;
}

export interface IPollVote {
  userId: Types.ObjectId;
  movieTmdbId: string;
}

export interface IPoll extends Document {
  name: string;
  groupId: Types.ObjectId;
  creator: Types.ObjectId;
  movies: IPollMovie[];
  votes: IPollVote[];
  status: "active" | "completed" | "cancelled";
  round: number;
  winningMovieTmdbId?: string;
  createdAt: Date;
  expiresAt?: Date;
}

const PollSchema = new Schema<IPoll>({
  name: { type: String, required: true },
  groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
  creator: { type: Schema.Types.ObjectId, ref: "User", required: true },
  movies: [
    {
      tmdbId: { type: String, required: true },
      title: { type: String, required: true },
      poster_path: String,
      vote_average: Number,
    },
  ],
  votes: [
    {
      userId: { type: Schema.Types.ObjectId, ref: "User" },
      movieTmdbId: { type: String, required: true },
    },
  ],
  status: {
    type: String,
    enum: ["active", "completed", "cancelled"],
    default: "active",
  },
  round: { type: Number, default: 1 },
  winningMovieTmdbId: String,
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
});

PollSchema.index({ groupId: 1, status: 1 });

const Poll: Model<IPoll> = mongoose.model<IPoll>("Poll", PollSchema);

export default Poll;
