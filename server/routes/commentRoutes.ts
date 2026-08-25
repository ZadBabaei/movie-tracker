import express, { Request, Response } from "express";
import mongoose from "mongoose";
import { authenticate } from "../middleware/authMiddleware";
import Comment from "../models/Comment";
import User from "../models/user";

const router = express.Router();

// GET /api/comments?movieId=xxx
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const movieId = String(req.query.movieId || "");
    if (!mongoose.Types.ObjectId.isValid(movieId)) {
      return res.status(400).json({ msg: "A valid movieId is required" });
    }

    // Server-enforced ceiling so a hot movie cannot return an unbounded page.
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const comments = await Comment.find({ movieId })
      .sort({ createdAt: 1 })
      .limit(limit);
    res.json(comments);
  } catch (err) {
    console.error("Failed to fetch comments:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// POST /api/comments
router.post("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { text, parentId } = req.body;
    const movieId = String(req.body?.movieId || "");
    if (!mongoose.Types.ObjectId.isValid(movieId)) {
      return res.status(400).json({ msg: "A valid movieId is required" });
    }
    if (parentId && !mongoose.Types.ObjectId.isValid(String(parentId))) {
      return res.status(400).json({ msg: "Invalid parentId" });
    }
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ msg: "text required" });
    }
    if (text.length > 2000) {
      return res.status(400).json({ msg: "Comment is too long" });
    }

    const user = await User.findById(req.user!.id).select("name email avatar");
    if (!user) return res.status(404).json({ msg: "User not found" });

    const comment = new Comment({
      movieId,
      userId: req.user!.id,
      username: user.name,
      userAvatar: user.avatar || "",
      text: text.trim(),
      parentId: parentId || null,
    });

    await comment.save();
    res.status(201).json(comment);
  } catch (err) {
    console.error("Failed to create comment:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
