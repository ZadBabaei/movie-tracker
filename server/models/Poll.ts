import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IPollMovie {
  tmdbId: string;
  title: string;
  poster_path?: string;
  vote_average?: number;
  selected?: number | null;
}

export interface IPollVote {
  userId: Types.ObjectId;
  movieTmdbId: string;
  rank: number;
}

export interface IPoll extends Document {
  groupId: Types.ObjectId;
  creator: Types.ObjectId;
  movies: IPollMovie[];
  votes: IPollVote[];
  status: "active" | "completed" | "cancelled";
  winningMovieTmdbId?: string;
  createdAt: Date;
  expiresAt?: Date;
}

const PollSchema = new Schema<IPoll>({
  groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
  creator: { type: Schema.Types.ObjectId, ref: "User", required: true },
  movies: [
    {
      tmdbId: { type: String, required: true },
      title: { type: String, required: true },
      poster_path: String,
      vote_average: Number,
      selected: { type: Number, min: 1, max: 4, default: null },
    },
  ],
  votes: [
    {
      userId: { type: Schema.Types.ObjectId, ref: "User" },
      movieTmdbId: { type: String, required: true },
      rank: { type: Number, required: true, min: 1, max: 4 },
    },
  ],
  status: {
    type: String,
    enum: ["active", "completed", "cancelled"],
    default: "active",
  },
  winningMovieTmdbId: String,
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
});

PollSchema.index({ groupId: 1, status: 1 });
PollSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

const Poll: Model<IPoll> = mongoose.model<IPoll>("Poll", PollSchema);

export default Poll;
