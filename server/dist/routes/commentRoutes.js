"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const Comment_1 = __importDefault(require("../models/Comment"));
const user_1 = __importDefault(require("../models/user"));
const router = express_1.default.Router();
// GET /api/comments?movieId=xxx
router.get("/", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const { movieId } = req.query;
        if (!movieId)
            return res.status(400).json({ msg: "movieId required" });
        const comments = await Comment_1.default.find({ movieId }).sort({ createdAt: 1 });
        res.json(comments);
    }
    catch (err) {
        console.error("Failed to fetch comments:", err);
        res.status(500).json({ msg: "Server error" });
    }
});
// POST /api/comments
router.post("/", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const { movieId, text, parentId } = req.body;
        if (!movieId || !text)
            return res.status(400).json({ msg: "movieId and text required" });
        const user = await user_1.default.findById(req.user.id).select("name email avatar");
        if (!user)
            return res.status(404).json({ msg: "User not found" });
        const comment = new Comment_1.default({
            movieId,
            userId: req.user.id,
            username: user.name,
            userAvatar: user.avatar || "",
            text,
            parentId: parentId || null,
        });
        await comment.save();
        res.status(201).json(comment);
    }
    catch (err) {
        console.error("Failed to create comment:", err);
        res.status(500).json({ msg: "Server error" });
    }
});
exports.default = router;
