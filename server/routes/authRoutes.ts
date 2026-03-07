import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/user";
import Group from "../models/Groups";

const router = express.Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ msg: "Please fill in all fields" });
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      res.status(400).json({ msg: "Email already in use" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    const savedUser = await newUser.save();

    res.json({ msg: "Signup successful", user: savedUser });
  } catch (error) {
    console.error("Error in register route:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      res.status(400).json({ msg: "Invalid credentials" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(400).json({ msg: "Invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { id: user._id, name: user.name },
      process.env.JWT_SECRET as string,
      { expiresIn: "24h" }
    );

    res.json({ token, user: { name: user.name, email: user.email } });
  } catch (error) {
    console.error("Error in login route:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/me", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ msg: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    res.json({ name: user.name, email: user.email });
  } catch (error) {
    console.error("Error in /me route:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/groups", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ msg: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    const userId = new mongoose.Types.ObjectId(decoded.id);
    const userGroups = await Group.find({ members: userId });

    res.json(userGroups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/groups/create", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ msg: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET as string);

    const { name, members } = req.body;
    if (!name || members.length === 0) {
      res.status(400).json({ msg: "Group name and members are required" });
      return;
    }

    const memberIds = members.map((id: string) => new mongoose.Types.ObjectId(id));
    const newGroup = new Group({ name, members: memberIds });
    await newGroup.save();

    res.json(newGroup);
  } catch (error) {
    console.error("Error creating group:", error);
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

    const { query } = req.query as { query: string };
    if (!query) {
      res.json([]);
      return;
    }

    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    })
      .select("_id name email")
      .limit(10);

    res.json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

export default router;
