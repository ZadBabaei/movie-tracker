import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IPollMovie {
  tmdbId: string;
  title: string;
  poster_path?: string;
  vote_average?: number;
}

export interface IPollVote {
  userId: Types.ObjectId;
  rankings: {
    movieTmdbId: string;
    rank: number;
  }[];
}

export interface IPollResultMovie {
  movieTmdbId: string;
  title?: string;
  score: number;
}

export interface IPollResult {
  mode?: "ranked" | "runoff" | "randomTieBreak";
  lowestScoreWins?: boolean;
  randomTieBreak?: boolean;
  movies?: IPollResultMovie[];
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
  result?: IPollResult;
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
      rankings: [
        {
          movieTmdbId: { type: String, required: true },
          rank: { type: Number, required: true },
        },
      ],
    },
  ],
  status: {
    type: String,
    enum: ["active", "completed", "cancelled"],
    default: "active",
  },
  round: { type: Number, default: 1 },
  winningMovieTmdbId: String,
  result: {
    mode: { type: String, enum: ["ranked", "runoff", "randomTieBreak"] },
    lowestScoreWins: Boolean,
    randomTieBreak: Boolean,
    movies: [
      {
        movieTmdbId: String,
        title: String,
        score: Number,
      },
    ],
  },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
});

PollSchema.index({ groupId: 1, status: 1 });

const Poll: Model<IPoll> = mongoose.model<IPoll>("Poll", PollSchema);

// Polls are retained for 30 days. The database previously carried a 7-day
// TTL on createdAt, which deleted history early — realign it on startup.
const POLL_RETENTION_SECONDS = 30 * 24 * 60 * 60;

const ensurePollRetentionIndex = async () => {
  try {
    const collection = mongoose.connection.db?.collection("polls");
    if (!collection) return;

    const indexes = await collection.indexes();
    const createdAtIndex = indexes.find((index) => index.name === "createdAt_1");
    if (createdAtIndex?.expireAfterSeconds === POLL_RETENTION_SECONDS) return;

    if (createdAtIndex) {
      await collection.dropIndex("createdAt_1");
    }
    await collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: POLL_RETENTION_SECONDS }
    );
    console.info("Poll retention TTL index set to 30 days.");
  } catch (error) {
    console.warn("Could not update poll retention TTL index:", error);
  }
};

if (mongoose.connection.readyState === 1) {
  void ensurePollRetentionIndex();
} else {
  mongoose.connection.once("open", () => void ensurePollRetentionIndex());
}

export default Poll;
