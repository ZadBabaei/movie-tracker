const mongoose = require("mongoose");

const PollSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    required: true,
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
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
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
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

module.exports = mongoose.model("Poll", PollSchema);
