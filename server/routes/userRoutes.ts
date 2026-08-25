import express, { Request, Response } from "express";
import { authenticate } from "../middleware/authMiddleware";
import User from "../models/user";

const router = express.Router();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Name lookup is a contains-match so people can be found by partial name, but
// the term is escaped (an unescaped one allowed regex injection and ReDoS) and
// email is matched exactly — otherwise a one-letter query harvested addresses.
// Email is never echoed back; invitations are sent by user id or by email the
// caller already knows.
router.get("/search", authenticate, async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || "").trim();
    if (query.length < 2) {
      res.json([]);
      return;
    }

    const users = await User.find({
      $or: [
        { name: { $regex: escapeRegex(query), $options: "i" } },
        { email: query.toLowerCase() },
      ],
    })
      .select("_id name avatar")
      .limit(20);

    res.json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
