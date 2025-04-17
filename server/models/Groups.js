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
    pendingInvitations: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        inviterName: { type: String },
      },
    ],
    movies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }],
    currentPoll: { type: mongoose.Schema.Types.ObjectId, ref: "Poll" },
    pollHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: "Poll" }],
  },
  {
    timestamps: true,
  }
);

// Add method to check for active poll
groupSchema.methods.hasActivePoll = async function () {
  const Poll = mongoose.model("Poll");
  const activePoll = await Poll.findOne({
    groupId: this._id,
    status: "active",
  });
  return !!activePoll;
};

module.exports = mongoose.models.Group || mongoose.model("Group", groupSchema);
