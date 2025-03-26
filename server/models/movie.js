const mongoose = require("mongoose");

const MovieSchema = new mongoose.Schema({
  title: { type: String, required: true },
  imdbID: { type: String, unique: true, required: true },
  poster: { type: String },
  vote_average: { type: Number, default: 0 },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("Movie", MovieSchema);
