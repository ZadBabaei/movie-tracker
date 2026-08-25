import express, { Request, Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { authenticate } from "../middleware/authMiddleware";
import User from "../models/user";
import Group from "../models/Groups";
import Movie from "../models/movie";
import Poll from "../models/Poll";
import cloudinary from "../utils/cloudinary";
import { hasAdminAccess } from "../middleware/adminMiddleware";
import { uploadLimiter } from "../middleware/rateLimits";

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ActivityType = "watchlist" | "group" | "poll-vote" | "poll-created" | "profile";

interface ProfileStats {
  groupsJoined: number;
  moviesWatched: number;
  pollsVoted: number;
  pollsCreated: number;
}

interface RecentActivity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  createdAt: string;
  icon?: string;
}

const toIsoString = (value?: Date | string | null) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const getProfileStats = async (userId: string): Promise<ProfileStats> => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const [groupsJoined, watchedMovieCounts, pollsVoted, pollsCreated] = await Promise.all([
    Group.countDocuments({ members: userId }),
    Group.aggregate<{ count: number }>([
      { $match: { members: userObjectId } },
      { $unwind: "$movies" },
      { $group: { _id: "$movies.movieId" } },
      { $count: "count" },
    ]),
    Poll.countDocuments({ "votes.userId": userId }),
    Poll.countDocuments({ creator: userId }),
  ]);

  return {
    groupsJoined,
    moviesWatched: watchedMovieCounts[0]?.count ?? 0,
    pollsVoted,
    pollsCreated,
  };
};

interface WatchedMovieSummary {
  _id: mongoose.Types.ObjectId;
  title: string;
  poster?: string;
  imdbID?: string;
  vote_average?: number;
  lastWatchedAt?: Date;
  timesWatched: number;
}

// Every movie logged in any group the user belongs to, deduplicated by movie
// so rewatches (or the same film in several groups) count once.
const getWatchedMovies = async (userId: string): Promise<WatchedMovieSummary[]> => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  return Group.aggregate<WatchedMovieSummary>([
    { $match: { members: userObjectId } },
    { $unwind: "$movies" },
    {
      $group: {
        _id: "$movies.movieId",
        lastWatchedAt: { $max: "$movies.watchedDate" },
        timesWatched: { $sum: 1 },
      },
    },
    { $lookup: { from: "movies", localField: "_id", foreignField: "_id", as: "movie" } },
    { $unwind: "$movie" },
    {
      $project: {
        _id: "$movie._id",
        title: "$movie.title",
        poster: "$movie.poster",
        imdbID: "$movie.imdbID",
        vote_average: "$movie.vote_average",
        lastWatchedAt: 1,
        timesWatched: 1,
      },
    },
    { $sort: { lastWatchedAt: -1 } },
  ]);
};

const getRecentActivity = async (userId: string, watchlistIds: any[] = []): Promise<RecentActivity[]> => {
  const [watchlistMovies, groups, votedPolls, createdPolls, user] = await Promise.all([
    watchlistIds.length
      ? Movie.find({ _id: { $in: watchlistIds } })
          .select("title createdAt")
          .sort({ createdAt: -1 })
          .limit(4)
          .lean()
      : [],
    Group.find({ members: userId })
      .select("name creator createdAt")
      .sort({ createdAt: -1 })
      .limit(4)
      .lean(),
    Poll.find({ "votes.userId": userId })
      .select("name createdAt")
      .sort({ createdAt: -1 })
      .limit(4)
      .lean(),
    Poll.find({ creator: userId })
      .select("name createdAt")
      .sort({ createdAt: -1 })
      .limit(4)
      .lean(),
    User.findById(userId).select("createdAt updatedAt").lean(),
  ]);

  const activities: RecentActivity[] = [
    ...watchlistMovies.map((movie: any) => ({
      id: `watchlist-${movie._id}`,
      type: "watchlist" as ActivityType,
      title: `Added ${movie.title || "a movie"} to your watchlist`,
      description: "Movies queued up and ready to roll",
      createdAt: toIsoString(movie.createdAt),
      icon: "film",
    })),
    ...groups.map((group: any) => ({
      id: `group-${group._id}`,
      type: "group" as ActivityType,
      title: `Joined ${group.name || "a movie group"}`,
      description: "Connected with fellow film lovers",
      createdAt: toIsoString(group.createdAt),
      icon: "users",
    })),
    ...votedPolls.map((poll: any) => ({
      id: `poll-vote-${poll._id}`,
      type: "poll-vote" as ActivityType,
      title: `Voted in ${poll.name || "a group poll"}`,
      description: "Had your say on what to watch next",
      createdAt: toIsoString(poll.createdAt),
      icon: "poll",
    })),
    ...createdPolls.map((poll: any) => ({
      id: `poll-created-${poll._id}`,
      type: "poll-created" as ActivityType,
      title: `Created ${poll.name || "a group poll"}`,
      description: "Planned movie nights with friends",
      createdAt: toIsoString(poll.createdAt),
      icon: "chart",
    })),
  ];

  if (user?.createdAt) {
    activities.push({
      id: `profile-${userId}`,
      type: "profile",
      title: "Created your profile",
      description: "Started tracking movie nights with your groups",
      createdAt: toIsoString(user.createdAt),
      icon: "star",
    });
  }

  return activities
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);
};

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

// The multer fileFilter only sees the client-supplied Content-Type, so the
// bytes are checked here before anything is forwarded to Cloudinary.
const looksLikeImage = (buffer: Buffer) => {
  if (buffer.length < 12) return false;
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString("ascii");

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 && ascii(1, 4) === "PNG" && buffer[4] === 0x0d && buffer[5] === 0x0a;
  const isGif = ascii(0, 4) === "GIF8";
  const isWebp = ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";

  return isJpeg || isPng || isGif || isWebp;
};

// multer reports oversize/wrong-type uploads as errors; translate them into a
// 400 rather than letting them surface as a generic server error.
const uploadAvatar = (req: Request, res: Response, next: express.NextFunction) =>
  upload.single("avatar")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    const code = (err as { code?: string }).code;
    res.status(400).json({
      msg:
        code === "LIMIT_FILE_SIZE"
          ? "Image must be smaller than 5MB."
          : "Only image files are allowed.",
    });
  });

// GET /api/profile — get current user profile
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.id).select(
      "-password -passwordResetToken -passwordResetExpires -__v"
    );
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }
    res.json({ ...user.toObject(), isAdmin: hasAdminAccess(user) });
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
      // Every auth lookup treats email case-insensitively, so the uniqueness
      // check has to as well — otherwise two accounts can share an address and
      // sign-in resolves to whichever document Mongo happens to return first.
      const normalizedEmail = String(email).trim().toLowerCase();

      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        res.status(400).json({ msg: "Please enter a valid email address" });
        return;
      }

      const existing = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: userId },
      });
      if (existing) {
        res.status(400).json({ msg: "Email already in use" });
        return;
      }
      updateData.email = normalizedEmail;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ msg: "No fields to update" });
      return;
    }

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select(
      "-password -passwordResetToken -passwordResetExpires -__v"
    );
    res.json(user ? { ...user.toObject(), isAdmin: hasAdminAccess(user) } : user);
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// POST /api/profile/avatar — upload profile picture to Cloudinary
router.post("/avatar", authenticate, uploadLimiter, uploadAvatar, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ msg: "No file uploaded" });
      return;
    }

    if (!looksLikeImage(req.file.buffer)) {
      res.status(400).json({ msg: "That file is not a valid JPEG, PNG, GIF or WebP image." });
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

// GET /api/profile/dashboard — consolidated profile, stats, and recent activity
router.get("/dashboard", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await User.findById(userId)
      .select("_id name email avatar firstLogin createdAt watchlist role")
      .lean();

    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    const [stats, recentActivity, watchedMovies] = await Promise.all([
      getProfileStats(userId),
      getRecentActivity(userId, user.watchlist || []),
      getWatchedMovies(userId),
    ]);

    res.json({
      user: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        avatar: user.avatar || "",
        firstLogin: user.firstLogin,
        createdAt: user.createdAt ? toIsoString(user.createdAt) : undefined,
        isAdmin: hasAdminAccess(user),
      },
      stats,
      recentActivity,
      watchedMovies,
    });
  } catch (error) {
    console.error("Error fetching profile dashboard:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// GET /api/profile/stats — get user statistics
router.get("/stats", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await getProfileStats(userId);
    res.json(stats);
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
