// ✅ FULL groupRoutes.js with /:id/add-movie route
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Group = require("../models/Groups");
const User = require("../models/User");
const Movie = require("../models/movie");
const Poll = require("../models/Poll");
const { authenticate } = require("../middleware/authMiddleware");
require("dotenv").config();

const router = express.Router();

//  GET /api/groups/mine
router.get("/mine", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const groups = await Group.find({ members: userId })
      .populate("members", "name email avatar")
      .sort({ createdAt: -1 });

    res.json(groups);
  } catch (err) {
    console.error("Error fetching user groups:", err);
    res.status(500).json({ msg: "Failed to fetch groups." });
  }
});

//  POST /api/groups/:id/leave
router.post("/:id/leave", authenticate, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ msg: "Group not found." });
    }

    group.members = group.members.filter(
      (memberId) => memberId.toString() !== userId
    );

    if (group.members.length === 0) {
      await Group.findByIdAndDelete(groupId);
      return res.json({
        msg: "You left the group. Group deleted because it was empty.",
      });
    }

    await group.save();
    res.json({ msg: "You left the group." });
  } catch (err) {
    console.error("Error leaving group:", err);
    res.status(500).json({ msg: "Failed to leave group." });
  }
});

// CREATE GROUP
router.post("/create", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = new mongoose.Types.ObjectId(decoded.id);

    const { groupName } = req.body;
    if (!groupName)
      return res.status(400).json({ msg: "Group name required." });

    const existing = await Group.findOne({ name: groupName });
    if (existing) return res.status(400).json({ msg: "Group already exists." });

    const group = new Group({
      name: groupName,
      members: [userId],
      pendingInvitations: [],
      creator: userId,
    });

    await group.save();
    return res.json({ msg: "Group created", group });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// ✅ FIXED INVITE MEMBERS ROUTE
router.post("/invite", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = new mongoose.Types.ObjectId(decoded.id);

    const { groupId, members, inviterName } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ msg: "Group not found." });

    if (!group.invitations) group.invitations = [];
    if (!group.pendingInvitations) group.pendingInvitations = [];

    const invitations = members.map((memberId) => ({
      userId: new mongoose.Types.ObjectId(memberId),
      inviterName,
    }));

    group.invitations.push(...invitations);
    group.pendingInvitations.push(...invitations);

    await group.save();

    return res
      .status(200)
      .json({ msg: "Invitations sent successfully!", group });
  } catch (error) {
    console.error("❌ Error sending invitations:", error);
    return res.status(500).json({ msg: "Server error", error: error.message });
  }
});

//  RESPOND TO INVITE
router.post("/respond", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = new mongoose.Types.ObjectId(decoded.id);

    const { groupId, response } = req.body;
    if (!groupId || !["accept", "decline"].includes(response)) {
      return res.status(400).json({ msg: "Invalid request." });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ msg: "Group not found." });

    if (!Array.isArray(group.pendingInvitations)) {
      group.pendingInvitations = [];
    }

    if (response === "accept") {
      group.members.push(userId);
    }

    group.pendingInvitations = group.pendingInvitations.filter(
      (inv) => inv.userId.toString() !== userId.toString()
    );

    await group.save();
    res.json({ msg: `You have ${response}ed the invitation.`, group });
  } catch (error) {
    console.error("Error responding to invitation:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

//  GET GROUP DETAILS
router.get("/:id", authenticate, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const groupId = req.params.id;
    const group = await Group.findById(groupId)
      .populate("members", "_id name profilePic")
      .populate("creator", "_id name")
      .populate("movies", "title imdbID poster vote_average")
      .populate({
        path: "currentPoll",
        populate: {
          path: "votes.userId",
          select: "name",
        },
      });

    if (!group) return res.status(404).json({ msg: "Group not found" });

    // Check if there's an active poll
    const hasActivePoll = await group.hasActivePoll();

    res.json({
      ...group.toObject(),
      hasActivePoll,
    });
  } catch (error) {
    console.error("Error fetching group:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

//  ADD MOVIE TO GROUP
router.post("/:id/add-movie", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = new mongoose.Types.ObjectId(decoded.id);

    const groupId = req.params.id;
    const { movie } = req.body;

    if (!movie || !movie.imdbID || !movie.title) {
      return res.status(400).json({ msg: "Invalid movie data" });
    }

    let existingMovie = await Movie.findOne({ imdbID: movie.imdbID });

    if (!existingMovie) {
      existingMovie = new Movie({
        title: movie.title,
        imdbID: movie.imdbID,
        poster: movie.poster_path,
        vote_average: movie.vote_average || 0,
        addedBy: userId,
      });

      await existingMovie.save();
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ msg: "Group not found" });

    if (!group.movies.includes(existingMovie._id)) {
      group.movies.push(existingMovie._id);
      await group.save();
    }

    res.json({ msg: "Movie added", movie: existingMovie });
  } catch (error) {
    console.error("❌ Error adding movie:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});
// ❌ DELETE /api/groups/:groupId/remove-movie/:movieId
router.delete("/:groupId/remove-movie/:movieId", async (req, res) => {
  try {
    const { groupId, movieId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ msg: "Group not found" });

    group.movies = group.movies.filter((id) => id.toString() !== movieId);
    await group.save();

    res.json({ msg: "Movie removed from group" });
  } catch (error) {
    console.error("❌ Error removing movie:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// When creating a poll, update the group's currentPoll field
router.post("/:id/create-poll", authenticate, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ msg: "Group not found" });
    }

    const hasActivePoll = await group.hasActivePoll();
    if (hasActivePoll) {
      return res.status(400).json({ msg: "Group already has an active poll" });
    }

    const poll = new Poll({
      groupId: group._id,
      movies: req.body.movies,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await poll.save();

    // Update group with current poll
    group.currentPoll = poll._id;
    if (!group.pollHistory) group.pollHistory = [];
    group.pollHistory.push(poll._id);
    await group.save();

    res.json(poll);
  } catch (error) {
    console.error("Error creating poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// When completing a poll, update the group
router.post("/:id/complete-poll", authenticate, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ msg: "Group not found" });
    }

    if (!group.currentPoll) {
      return res.status(400).json({ msg: "No active poll found" });
    }

    const poll = await Poll.findById(group.currentPoll);
    if (!poll) {
      return res.status(404).json({ msg: "Poll not found" });
    }

    poll.status = "completed";
    poll.winningMovieTmdbId = req.body.winningMovie;
    await poll.save();

    // Clear current poll from group
    group.currentPoll = null;
    await group.save();

    res.json({ msg: "Poll completed successfully" });
  } catch (error) {
    console.error("Error completing poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
