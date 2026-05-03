import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { OAuth2Client } from "google-auth-library";
import User from "../models/user";
import Group from "../models/Groups";

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const buildAuthToken = (user: any, rememberMe = false) =>
  jwt.sign(
    { id: user._id, name: user.name },
    process.env.JWT_SECRET as string,
    { expiresIn: rememberMe ? "7d" : "24h" }
  );

const buildAuthUser = (user: any) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  avatar: user.avatar || "",
  firstLogin: user.firstLogin ?? true,
});

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
    const newUser = new User({ name, email, password: hashedPassword, provider: "local" });
    const savedUser = await newUser.save();

    res.json({ msg: "Signup successful", user: savedUser });
  } catch (error) {
    console.error("Error in register route:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password, rememberMe } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      res.status(400).json({ msg: "Invalid credentials" });
      return;
    }

    if (!user.password) {
      res.status(400).json({ msg: "Please continue with Google for this account" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(400).json({ msg: "Invalid credentials" });
      return;
    }

    const token = buildAuthToken(user, rememberMe);

    res.json({
      token,
      user: buildAuthUser(user),
    });
  } catch (error) {
    console.error("Error in login route:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.post("/google", async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;

    if (!googleClientId) {
      res.status(500).json({ msg: "Google authentication is not configured" });
      return;
    }

    if (!credential) {
      res.status(400).json({ msg: "Missing Google credential" });
      return;
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      res.status(401).json({ msg: "Invalid Google credential" });
      return;
    }

    if (payload.email_verified === false) {
      res.status(401).json({ msg: "Google email is not verified" });
      return;
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const name = payload.name || email.split("@")[0];
    const picture = payload.picture || "";

    let user = await User.findOne({
      $or: [{ googleId }, { email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } }],
    });

    if (!user) {
      user = await User.create({
        name,
        email,
        avatar: picture,
        provider: "google",
        googleId,
      });
    } else {
      let shouldSave = false;

      if (!user.googleId) {
        user.googleId = googleId;
        shouldSave = true;
      }

      if (!user.provider) {
        user.provider = user.password ? "local" : "google";
        shouldSave = true;
      }

      if (!user.avatar && picture) {
        user.avatar = picture;
        shouldSave = true;
      }

      if (shouldSave) {
        await user.save();
      }
    }

    const token = buildAuthToken(user);

    res.json({
      token,
      user: buildAuthUser(user),
    });
  } catch (error) {
    console.error("Error in Google auth route:", error);
    res.status(401).json({ msg: "Google authentication failed" });
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

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar || "",
      firstLogin: user.firstLogin ?? true,
    });
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
