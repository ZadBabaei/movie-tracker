// ✅ CLEANED BACKEND GROUP ROUTES
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Group = require("../models/Groups");
const User = require("../models/User");
const Movie = require("../models/movie");

const { authenticate } = require("../middleware/authMiddleware");
require("dotenv").config();

const router = express.Router();

// ✅ CREATE GROUP ONLY
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

// ✅ INVITE MEMBERS TO EXISTING GROUP
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

module.exports = router;
