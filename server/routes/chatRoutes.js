const express = require("express");
const jwt = require("jsonwebtoken");
const { StreamChat } = require("stream-chat");
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

    const chatClient = StreamChat.getInstance(
      process.env.STREAM_API_KEY,
      process.env.STREAM_API_SECRET
    );

    // ✅ Create token & register user with Stream
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
    });
  } catch (error) {
    console.error("❌ Error in /api/chat/token:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

module.exports = router;
