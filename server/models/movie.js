const mongoose = require("mongoose");

const MovieSchema = new mongoose.Schema({
  title: { type: String, required: true },
  imdbID: { type: String, unique: true, required: true },
  poster: { type: String },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
});

module.exports = mongoose.model("Movie", MovieSchema);
