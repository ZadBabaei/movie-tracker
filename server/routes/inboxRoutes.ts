import express, { Request, Response } from "express";
import mongoose from "mongoose";
import Group from "../models/Groups";
import { readBearerToken, verifyAuthToken } from "../utils/authToken";

const router = express.Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const token = readBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ msg: "Unauthorized: No token provided" });
      return;
    }

    let decoded;
    try {
      decoded = verifyAuthToken(token);
    } catch {
      res.status(401).json({ msg: "Unauthorized: Invalid token" });
      return;
    }

    const userId = new mongoose.Types.ObjectId(decoded.id);

    const groups = await Group.find({
      pendingInvitations: { $elemMatch: { userId } },
    })
      .select("name _id pendingInvitations")
      .lean();

    const formattedInvites = groups.map((group) => {
      const invitation = group.pendingInvitations.find(
        (inv) => inv.userId.toString() === userId.toString()
      );
      return {
        _id: group._id,
        type: "invitation",
        content: `${invitation?.inviterName || "Someone"} invited you to join '${group.name}'!`,
      };
    });

    res.json(formattedInvites);
  } catch (error) {
    console.error("Error fetching inbox messages:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
