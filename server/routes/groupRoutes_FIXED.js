
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
      userId: memberId,
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

module.exports = router;
