const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
require("dotenv").config();
const Group = require("../models/Groups");
const mongoose = require("mongoose");
const router = express.Router();


// ✅ Signup Route (Now Hashing Passwords)
router.post("/register", async (req, res) => {
  try {
    console.log("🔹 Signup API hit with data:", req.body);

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ msg: "Please fill in all fields" });
    }

    // ✅ Check if email already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: "Email already in use" });
    }

    console.log("🔹 Creating new user...");
    
    // ✅ Hash password before saving
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });

    // ✅ Save user to MongoDB
    const savedUser = await newUser.save();
    console.log("✅ User saved successfully:", savedUser);

    res.json({ msg: "Signup successful", user: savedUser });
  } catch (error) {
    console.error("❌ Error in register route:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// ✅ Login Route (Now Verifies Hashed Password)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("🔹 Login API hit with data:", { email, password });

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    // ✅ Compare hashed passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    // ✅ Generate JWT Token
    const token = jwt.sign({ id: user._id, name: user.name }, process.env.JWT_SECRET, { expiresIn: "1h" });

    console.log("✅ Token Generated:", token);
    res.json({ token, user: { name: user.name, email: user.email } });
  } catch (error) {
    console.error("❌ Error in login route:", error);
    res.status(500).json({ msg: "Server error" });
  }
});


// ✅ Secure Route: Fetch User Data
router.get("/me", async (req, res) => {
  try {
    console.log("🔹 User Info API hit.");

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token Decoded:", decoded);

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    console.log("✅ User Data Retrieved:", user);
    res.json({ name: user.name, email: user.email }); // ✅ Return correct user data
  } catch (error) {
    console.error("❌ Error in /me route:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// ✅ Secure Route: Fetch User Groups
router.get("/groups", async (req, res) => {
  try {
    console.log("🔹 Fetching groups for the user...");

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ No token provided.");
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    console.log("✅ Token Decoded, User ID (Before Conversion):", decoded.id);

    const userId = new mongoose.Types.ObjectId(decoded.id);
    console.log("🔍 Querying MongoDB for groups where members include:", userId);

    const userGroups = await Group.find({ members: userId });

    console.log("✅ Found Groups:", userGroups);
    res.json(userGroups);
  } catch (error) {
    console.error("❌ Error fetching groups:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});


router.post("/groups/create", async (req, res) => {
  try {
    console.log("🔹 Incoming Create Group Request:", req.body);

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { name, members } = req.body;

    if (!name || members.length === 0) {
      return res.status(400).json({ msg: "Group name and members are required" });
    }

    const memberIds = members.map((id) => new mongoose.Types.ObjectId(id));
    const newGroup = new Group({ name, members: memberIds });
    await newGroup.save();

    console.log("✅ Group Created Successfully:", newGroup);
    res.json(newGroup);
  } catch (error) {
    console.error("❌ Error creating group:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});



module.exports = router;
