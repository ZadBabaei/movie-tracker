const express = require("express");
const jwt = require("jsonwebtoken");
const { StreamChat } = require("stream-chat");
const Group = require("../models/Groups"); // ✅ import your Group model
require("dotenv").config();

const router = express.Router();

// ✅ Secure token route
router.post("/token", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userId = decoded.id;
    const userName = decoded.name;

    const { groupId } = req.body;
    if (!groupId) {
      return res.status(400).json({ msg: "Group ID is required." });
    }

    // ✅ Fetch group and its members
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ msg: "Group not found." });
    }

    const groupMembers = group.members.map((m) => m.toString());

    const chatClient = StreamChat.getInstance(
      process.env.STREAM_API_KEY,
      process.env.STREAM_API_SECRET
    );

    // ✅ Create Stream token & ensure user is registered
    const chatToken = chatClient.createToken(userId);
    await chatClient.upsertUser({
      id: userId,
      name: userName,
    });

    res.json({
      token: chatToken,
      apiKey: process.env.STREAM_API_KEY,
      userId,
      name: userName,
      groupMembers, // ✅ send the group member IDs
    });
  } catch (error) {
    console.error("❌ Error in /api/chat/token:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

module.exports = router;
