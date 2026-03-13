import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/user";

const router = express.Router();

router.get("/all", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ msg: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET as string);

    const users = await User.find().select("_id name email");
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.get("/search", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ msg: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET as string);

    const q = req.query.q as string;
    if (!q) {
      res.json([]);
      return;
    }

    const regex = new RegExp(q, "i");
    const users = await User.find({
      $or: [{ name: regex }, { email: regex }],
    })
      .select("_id name email")
      .limit(20);

    res.json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

export default router;
