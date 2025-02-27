const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
require("dotenv").config();

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

    // Extract token from headers
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    // ✅ Extract the token correctly
    const token = authHeader.split(" ")[1];

    // ✅ Verify Token using correct secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token Decoded:", decoded);

    // Fetch user from database
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    console.log("✅ User Data Retrieved:", user);
    res.json(user);
  } catch (error) {
    console.error("❌ Error in /me route:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
