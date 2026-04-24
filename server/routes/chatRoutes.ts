import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { StreamChat } from "stream-chat";
import User from "../models/user";
import Group from "../models/Groups";

const router = express.Router();

router.post("/token", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ msg: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string;
      name: string;
    };

    const userId = decoded.id;
    const userName = decoded.name;

    const { groupId } = req.body;
    if (!groupId) {
      res.status(400).json({ msg: "Group ID is required." });
      return;
    }

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found." });
      return;
    }

    const groupMembers = await User.find({ _id: { $in: group.members } })
      .select("_id name avatar")
      .lean();

    const chatClient = StreamChat.getInstance(
      process.env.STREAM_API_KEY as string,
      process.env.STREAM_API_SECRET as string
    );

    const chatToken = chatClient.createToken(userId);
    await chatClient.upsertUser({ id: userId, name: userName });

    // Upsert all group members so Stream Chat knows about them before channel creation
    await chatClient.upsertUsers(
      groupMembers.map((m) => ({
        id: (m._id as any).toString(),
        name: m.name,
        image: m.avatar || undefined,
      }))
    );

    res.json({
      token: chatToken,
      apiKey: process.env.STREAM_API_KEY,
      userId,
      name: userName,
      groupMembers,
    });
  } catch (error) {
    console.error("Error in /api/chat/token:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

// GET /api/chat/unread-info — lightweight token for navbar unread counts
router.get("/unread-info", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ msg: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string;
      name: string;
    };

    const chatClient = StreamChat.getInstance(
      process.env.STREAM_API_KEY as string,
      process.env.STREAM_API_SECRET as string
    );

    const chatToken = chatClient.createToken(decoded.id);
    await chatClient.upsertUser({ id: decoded.id, name: decoded.name });

    res.json({
      chatToken,
      apiKey: process.env.STREAM_API_KEY,
      userId: decoded.id,
      name: decoded.name,
    });
  } catch (error) {
    console.error("Error in /api/chat/unread-info:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

export default router;
