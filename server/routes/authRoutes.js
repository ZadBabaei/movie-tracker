const express = require('express');
const User = require('../models/User'); // Ensure correct model usage
require('dotenv').config();

const router = express.Router();

// ✅ Signup Route (No Hashing for Testing)
router.post('/register', async (req, res) => {
    try {
        console.log("🔹 Signup API hit with data:", req.body);

        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            console.log("❌ Missing fields");
            return res.status(400).json({ msg: 'Please fill in all fields' });
        }

        // ✅ Check if email already exists
        let user = await User.findOne({ email });
        if (user) {
            console.log("⚠️ User already exists:", user);
            return res.status(400).json({ msg: 'Email already in use' });
        }

        console.log("🔹 Creating new user...");
        const newUser = new User({ name, email, password }); // ⚠️ No Hashing!

        // ✅ Save user to MongoDB
        console.log("🔹 Saving user to MongoDB...");
        const savedUser = await newUser.save();
        console.log("✅ User saved successfully:", savedUser);

        res.json({ msg: 'Signup successful', user: savedUser });

    } catch (error) {
        console.error("❌ Error in register route:", error);
        res.status(500).json({ msg: 'Server error', error: error.message });
    }
});

// ✅ New Login Route (Fix for "Invalid Credentials")
router.post('/login', async (req, res) => {
    try {
        console.log("🔹 Login API hit with data:", req.body);

        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ msg: 'Please fill in all fields' });
        }

        // ✅ Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            console.log("❌ User not found in database");
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        // ✅ Compare plain text passwords (⚠️ Only for Testing!)
        console.log("🔍 Entered Password:", password);
        console.log("🔍 Stored Password in DB:", user.password);

        if (password !== user.password) {
            console.log("❌ Passwords do not match");
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        console.log("✅ Login successful");
        res.json({ msg: 'Login successful', user });

    } catch (error) {
        console.error("❌ Error in login route:", error);
        res.status(500).json({ msg: 'Server error', error: error.message });
    }
});

module.exports = router;
