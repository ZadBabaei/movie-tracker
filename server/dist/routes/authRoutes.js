"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mongoose_1 = __importDefault(require("mongoose"));
const user_1 = __importDefault(require("../models/user"));
const Groups_1 = __importDefault(require("../models/Groups"));
const router = express_1.default.Router();
router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            res.status(400).json({ msg: "Please fill in all fields" });
            return;
        }
        const existing = await user_1.default.findOne({ email });
        if (existing) {
            res.status(400).json({ msg: "Email already in use" });
            return;
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const newUser = new user_1.default({ name, email, password: hashedPassword });
        const savedUser = await newUser.save();
        res.json({ msg: "Signup successful", user: savedUser });
    }
    catch (error) {
        console.error("Error in register route:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.post("/login", async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        const user = await user_1.default.findOne({ email });
        if (!user) {
            res.status(400).json({ msg: "Invalid credentials" });
            return;
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            res.status(400).json({ msg: "Invalid credentials" });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id, name: user.name }, process.env.JWT_SECRET, { expiresIn: rememberMe ? "7d" : "24h" });
        res.json({
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar || "",
                firstLogin: user.firstLogin ?? true,
            },
        });
    }
    catch (error) {
        console.error("Error in login route:", error);
        res.status(500).json({ msg: "Server error" });
    }
});
router.get("/me", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ msg: "Unauthorized: No token provided" });
            return;
        }
        const token = authHeader.split(" ")[1];
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const user = await user_1.default.findById(decoded.id).select("-password");
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
    }
    catch (error) {
        console.error("Error in /me route:", error);
        res.status(500).json({ msg: "Server error" });
    }
});
router.get("/groups", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ msg: "Unauthorized: No token provided" });
            return;
        }
        const token = authHeader.split(" ")[1];
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const userId = new mongoose_1.default.Types.ObjectId(decoded.id);
        const userGroups = await Groups_1.default.find({ members: userId });
        res.json(userGroups);
    }
    catch (error) {
        console.error("Error fetching groups:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.post("/groups/create", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ msg: "Unauthorized: No token provided" });
            return;
        }
        const token = authHeader.split(" ")[1];
        jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const { name, members } = req.body;
        if (!name || members.length === 0) {
            res.status(400).json({ msg: "Group name and members are required" });
            return;
        }
        const memberIds = members.map((id) => new mongoose_1.default.Types.ObjectId(id));
        const newGroup = new Groups_1.default({ name, members: memberIds });
        await newGroup.save();
        res.json(newGroup);
    }
    catch (error) {
        console.error("Error creating group:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.get("/search", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ msg: "Unauthorized: No token provided" });
            return;
        }
        const token = authHeader.split(" ")[1];
        jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const { query } = req.query;
        if (!query) {
            res.json([]);
            return;
        }
        const users = await user_1.default.find({
            $or: [
                { name: { $regex: query, $options: "i" } },
                { email: { $regex: query, $options: "i" } },
            ],
        })
            .select("_id name email")
            .limit(10);
        res.json(users);
    }
    catch (error) {
        console.error("Error searching users:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
exports.default = router;
