import express, { Request, Response } from "express";
import { authenticate } from "../middleware/authMiddleware";
import Comment from "../models/Comment";
import User from "../models/user";

const router = express.Router();

// GET /api/comments?movieId=xxx
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { movieId } = req.query;
    if (!movieId) return res.status(400).json({ msg: "movieId required" });

    const comments = await Comment.find({ movieId }).sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    console.error("Failed to fetch comments:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// POST /api/comments
router.post("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { movieId, text, parentId } = req.body;
    if (!movieId || !text) return res.status(400).json({ msg: "movieId and text required" });

    const user = await User.findById(req.user!.id).select("name email avatar");
    if (!user) return res.status(404).json({ msg: "User not found" });

    const comment = new Comment({
      movieId,
      userId: req.user!.id,
      username: user.name,
      userAvatar: user.avatar || "",
      text,
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
