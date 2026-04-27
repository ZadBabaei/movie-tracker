"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const user_1 = __importDefault(require("../models/user"));
const Groups_1 = __importDefault(require("../models/Groups"));
const Poll_1 = __importDefault(require("../models/Poll"));
const cloudinary_1 = __importDefault(require("../utils/cloudinary"));
const router = express_1.default.Router();
// Multer: store in memory buffer (we upload to Cloudinary, not disk)
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        }
        else {
            cb(new Error("Only image files are allowed"));
        }
    },
});
// GET /api/profile — get current user profile
router.get("/", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const user = await user_1.default.findById(req.user.id).select("-password");
        if (!user) {
            res.status(404).json({ msg: "User not found" });
            return;
        }
        res.json(user);
    }
    catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).json({ msg: "Server error" });
    }
});
// PUT /api/profile — update profile (name, email)
router.put("/", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const { name, email } = req.body;
        const userId = req.user.id;
        const updateData = {};
        if (name?.trim())
            updateData.name = name.trim();
        if (email?.trim()) {
            // Check if email is taken by another user
            const existing = await user_1.default.findOne({ email: email.trim(), _id: { $ne: userId } });
            if (existing) {
                res.status(400).json({ msg: "Email already in use" });
                return;
            }
            updateData.email = email.trim();
        }
        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ msg: "No fields to update" });
            return;
        }
        const user = await user_1.default.findByIdAndUpdate(userId, updateData, { new: true }).select("-password");
        res.json(user);
    }
    catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ msg: "Server error" });
    }
});
// POST /api/profile/avatar — upload profile picture to Cloudinary
router.post("/avatar", authMiddleware_1.authenticate, upload.single("avatar"), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ msg: "No file uploaded" });
            return;
        }
        // Upload buffer to Cloudinary
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary_1.default.uploader.upload_stream({
                folder: "movie-tracker/avatars",
                transformation: [
                    { width: 300, height: 300, crop: "fill", gravity: "face" },
                    { quality: "auto", fetch_format: "auto" },
                ],
                public_id: `user_${req.user.id}`,
                overwrite: true,
            }, (error, result) => {
                if (error)
                    reject(error);
                else
                    resolve(result);
            });
            stream.end(req.file.buffer);
        });
        const user = await user_1.default.findByIdAndUpdate(req.user.id, { avatar: result.secure_url }, { new: true }).select("-password");
        res.json({ msg: "Avatar uploaded successfully", user });
    }
    catch (error) {
        console.error("Error uploading avatar:", error);
        res.status(500).json({ msg: "Failed to upload avatar" });
    }
});
// DELETE /api/profile/avatar — remove profile picture
router.delete("/avatar", authMiddleware_1.authenticate, async (req, res) => {
    try {
        // Delete from Cloudinary
        try {
            await cloudinary_1.default.uploader.destroy(`movie-tracker/avatars/user_${req.user.id}`);
        }
        catch {
            // Ignore Cloudinary deletion errors
        }
        const user = await user_1.default.findByIdAndUpdate(req.user.id, { avatar: "" }, { new: true }).select("-password");
        res.json({ msg: "Avatar removed", user });
    }
    catch (error) {
        console.error("Error removing avatar:", error);
        res.status(500).json({ msg: "Server error" });
    }
});
// GET /api/profile/stats — get user statistics
router.get("/stats", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        // Groups joined
        const groupsJoined = await Groups_1.default.countDocuments({ members: userId });
        // Movies in watchlist
        const user = await user_1.default.findById(userId);
        const moviesWatched = user?.watchlist?.length || 0;
        // Polls voted in
        const pollsVoted = await Poll_1.default.countDocuments({
            "votes.userId": userId,
        });
        // Polls created
        const pollsCreated = await Poll_1.default.countDocuments({ creator: userId });
        res.json({
            groupsJoined,
            moviesWatched,
            pollsVoted,
            pollsCreated,
        });
    }
    catch (error) {
        console.error("Error fetching stats:", error);
        res.status(500).json({ msg: "Server error" });
    }
});
// POST /api/profile/complete-onboarding — mark onboarding as done
router.post("/complete-onboarding", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const user = await user_1.default.findByIdAndUpdate(req.user.id, { firstLogin: false }, { new: true }).select("-password");
        res.json({ msg: "Onboarding completed", user });
    }
    catch (error) {
        console.error("Error completing onboarding:", error);
        res.status(500).json({ msg: "Server error" });
    }
});
exports.default = router;
