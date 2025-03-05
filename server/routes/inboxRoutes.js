const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Group = require("../models/Groups");
const User = require("../models/User");
require("dotenv").config();

const router = express.Router();

// ✅ Fetch Inbox Messages (Group Invitations, Notifications, etc.)
router.get("/inbox", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = new mongoose.Types.ObjectId(decoded.id);

    // Fetch group invitations
    const invitations = await Group.find({ pendingInvitations: userId })
      .select("name _id")
      .lean();

    // Format invitations as messages
    const formattedInvites = invitations.map((group) => ({
      _id: group._id,
      type: "invitation",
      content: `You have been invited to join '${group.name}'!`,
    }));

    // Future: Fetch other messages/notifications here
    const allMessages = [...formattedInvites];

    res.json(allMessages);
  } catch (error) {
    console.error("Error fetching inbox messages:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

module.exports = router;
