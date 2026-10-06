import express, { Request, Response } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { userSearchLimiter } from "../middleware/rateLimits";
import User from "../models/user";

const router = express.Router();

// Both /api/users/search and its legacy /api/user/search alias use this handler
// and limiter. Neither email nor display name participates in this query.
router.get("/search", authenticate, userSearchLimiter, async (req: Request, res: Response) => {
  const input = req.query.q;
  if (typeof input !== "string") {
    res.status(400).json({ msg: "Provide a single username query in q" });
    return;
  }
  const query = input.trim().toLowerCase();
  if (query.length < 2 || query.length > 30) {
    res.status(400).json({ msg: "Search query must be between 2 and 30 characters" });
    return;
  }
  if (!/^[a-z0-9_.]+$/.test(query)) {
    res.status(400).json({ msg: "Search usernames using letters, numbers, underscores, or periods" });
    return;
  }

  // For the ASCII username alphabet, [prefix, next-prefix) is exactly a prefix
  // match under simple binary collation. No user-controlled regex is evaluated.
  const upperBound = query.slice(0, -1) + String.fromCharCode(query.charCodeAt(query.length - 1) + 1);
  try {
    const users = await User.find({
      discoverable: true,
      _id: { $ne: req.user!.id },
      username: { $type: "string", $gte: query, $lt: upperBound },
    })
      .select({ username: 1, name: 1, avatar: 1, _id: 0 })
      .collation({ locale: "simple" })
      .sort({ username: 1 })
      .limit(20)
      .maxTimeMS(2000)
      .lean<{ username: string; name: string; avatar?: string }[]>();

    res.json(users.map(user => ({
      username: user.username,
      displayName: user.name,
      ...(user.avatar ? { avatar: user.avatar } : {}),
    })));
  } catch (error) {
    console.error("Error searching discoverable usernames:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
