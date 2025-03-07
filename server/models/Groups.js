const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  movies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }] // ✅ Ensure This Exists
});

// ✅ Corrected Export
module.exports = mongoose.models.Group || mongoose.model("Group", groupSchema);
