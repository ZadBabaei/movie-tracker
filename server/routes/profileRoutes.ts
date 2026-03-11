import express, { Request, Response } from "express";
import multer from "multer";
import { authenticate } from "../middleware/authMiddleware";
import User from "../models/user";
import Group from "../models/Groups";
import Poll from "../models/Poll";
import cloudinary from "../utils/cloudinary";

const router = express.Router();

// Multer: store in memory buffer (we upload to Cloudinary, not disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// GET /api/profile — get current user profile
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.id).select("-password");
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }
    res.json(user);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// PUT /api/profile — update profile (name, email)
router.put("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { name, email } = req.body;
    const userId = req.user!.id;

    const updateData: any = {};
    if (name?.trim()) updateData.name = name.trim();
    if (email?.trim()) {
      // Check if email is taken by another user
      const existing = await User.findOne({ email: email.trim(), _id: { $ne: userId } });
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

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select("-password");
    res.json(user);
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// POST /api/profile/avatar — upload profile picture to Cloudinary
router.post("/avatar", authenticate, upload.single("avatar"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ msg: "No file uploaded" });
      return;
    }

    // Upload buffer to Cloudinary
    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "movie-tracker/avatars",
          transformation: [
            { width: 300, height: 300, crop: "fill", gravity: "face" },
            { quality: "auto", fetch_format: "auto" },
          ],
          public_id: `user_${req.user!.id}`,
          overwrite: true,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file!.buffer);
    });

    const user = await User.findByIdAndUpdate(
      req.user!.id,
      { avatar: result.secure_url },
      { new: true }
    ).select("-password");

    res.json({ msg: "Avatar uploaded successfully", user });
  } catch (error) {
    console.error("Error uploading avatar:", error);
    res.status(500).json({ msg: "Failed to upload avatar" });
  }
});

// DELETE /api/profile/avatar — remove profile picture
router.delete("/avatar", authenticate, async (req: Request, res: Response) => {
  try {
    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(`movie-tracker/avatars/user_${req.user!.id}`);
    } catch {
      // Ignore Cloudinary deletion errors
    }

    const user = await User.findByIdAndUpdate(
      req.user!.id,
      { avatar: "" },
      { new: true }
    ).select("-password");

    res.json({ msg: "Avatar removed", user });
  } catch (error) {
    console.error("Error removing avatar:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// GET /api/profile/stats — get user statistics
router.get("/stats", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Groups joined
    const groupsJoined = await Group.countDocuments({ members: userId });

    // Movies in watchlist
    const user = await User.findById(userId);
    const moviesWatched = user?.watchlist?.length || 0;

    // Polls voted in
    const pollsVoted = await Poll.countDocuments({
      "votes.userId": userId,
    });

    // Polls created
    const pollsCreated = await Poll.countDocuments({ creator: userId });

    res.json({
      groupsJoined,
      moviesWatched,
      pollsVoted,
      pollsCreated,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// POST /api/profile/complete-onboarding — mark onboarding as done
router.post("/complete-onboarding", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user!.id,
      { firstLogin: false },
      { new: true }
    ).select("-password");

    res.json({ msg: "Onboarding completed", user });
  } catch (error) {
    console.error("Error completing onboarding:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
