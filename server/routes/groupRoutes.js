const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Group = require("../models/Groups");
const User = require("../models/User");
const { authenticate } = require("../middleware/authMiddleware");
require("dotenv").config();

const router = express.Router();

// ✅ Send Group Invitation
router.post("/invite", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = new mongoose.Types.ObjectId(decoded.id);

    const { groupName, members } = req.body;
    if (!groupName || members.length === 0) {
      return res.status(400).json({ msg: "Group name and at least one invitation required." });
    }

    let group = await Group.findOne({ name: groupName });
    if (!group) {
      group = new Group({ name: groupName, members: [userId], pendingInvitations: members });
    } else {
      group.pendingInvitations.push(...members);
    }
    
    await group.save();
    res.json({ msg: "Invitations sent successfully!", group });
  } catch (error) {
    console.error("Error sending invitations:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// ✅ Accept or Decline Group Invitation
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
    if (!group) {
      return res.status(404).json({ msg: "Group not found." });
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

// ✅ Fetch Pending Invitations
router.get("/invitations", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = new mongoose.Types.ObjectId(decoded.id);

    const invitations = await Group.find({ pendingInvitations: userId })
      .select("name _id")
      .lean();

    res.json(invitations);
  } catch (error) {
    console.error("Error fetching invitations:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});
// ✅ GET Group Details (Name, Members, Watched Movies)
router.get("/:id", authenticate, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate("members", "name email")
      .populate("movies");

    if (!group) {
      return res.status(404).json({ msg: "Group not found" });
    }

    res.json(group);
  } catch (error) {
    console.error("Error fetching group:", error);
    res.status(500).json({ msg: "Server error" });
  }
});
router.post("/:id/add-movie", authenticate, async (req, res) => {
  try {
    const { movie } = req.body; // Movie object from frontend
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ msg: "Group not found" });
    }

    // Check if movie is already in the list
    if (group.movies.some(m => m.imdbID === movie.imdbID)) {
      return res.status(400).json({ msg: "Movie already added" });
    }

    group.movies.push(movie);
    await group.save();

    res.json(group);
  } catch (error) {
    console.error("Error adding movie:", error);
    res.status(500).json({ msg: "Server error" });
  }
});
router.delete("/:id/remove-movie/:movieId", authenticate, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ msg: "Group not found" });
    }

    // Only allow creator to remove movies
    if (group.creator.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Only the creator can remove movies" });
    }

    group.movies = group.movies.filter(
      (movie) => movie._id.toString() !== req.params.movieId
    );
    await group.save();

    res.json(group);
  } catch (error) {
    console.error("Error removing movie:", error);
    res.status(500).json({ msg: "Server error" });
  }
});



module.exports = router;
