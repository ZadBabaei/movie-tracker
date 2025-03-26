// ✅ FULL groupRoutes.js with /:id/add-movie route
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Group = require("../models/Groups");
const User = require("../models/User");
const Movie = require("../models/movie");
const { authenticate } = require("../middleware/authMiddleware");
require("dotenv").config();

const router = express.Router();

// ✅ GET /api/groups/mine — must come before "/:id"
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

// ✅ POST /api/groups/:id/leave
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

// ✅ CREATE GROUP
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

// ✅ INVITE MEMBERS
router.post("/invite", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = new mongoose.Types.ObjectId(decoded.id);

    const { groupId, members } = req.body;
    if (!groupId || !members || members.length === 0) {
      return res
        .status(400)
        .json({ msg: "Group ID and at least one member required." });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ msg: "Group not found." });

    group.pendingInvitations.push(...members);
    await group.save();

    res.json({ msg: "Invitations sent successfully!", group });
  } catch (error) {
    console.error("Error sending invitations:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// ✅ RESPOND TO INVITE
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
      (id) => !id.equals(userId)
    );

    await group.save();
    res.json({ msg: `You have ${response}ed the invitation.`, group });
  } catch (error) {
    console.error("Error responding to invitation:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// ✅ GET GROUP DETAILS
router.get("/:id", async (req, res) => {
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
      .populate("movies", "title imdbID poster vote_average");

    if (!group) return res.status(404).json({ msg: "Group not found" });

    res.json(group);
  } catch (error) {
    console.error("❌ Error fetching group:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// ✅ ADD MOVIE TO GROUP
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

module.exports = router;
