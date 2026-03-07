import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Group from "../models/Groups";

const router = express.Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ msg: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
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
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

export default router;
