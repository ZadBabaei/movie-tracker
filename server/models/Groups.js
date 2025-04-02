const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // ✅ Updated: invitation includes inviter name
    pendingInvitations: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        inviterName: { type: String },
      },
    ],

    movies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.Group || mongoose.model("Group", groupSchema);
