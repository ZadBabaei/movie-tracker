"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_1 = __importDefault(require("../models/user"));
const router = express_1.default.Router();
router.get("/all", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ msg: "Unauthorized: No token provided" });
            return;
        }
        const token = authHeader.split(" ")[1];
        jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const users = await user_1.default.find().select("_id name email");
        res.json(users);
    }
    catch (error) {
        console.error("Error fetching users:", error);
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
        const q = req.query.q;
        if (!q) {
            res.json([]);
            return;
        }
        const regex = new RegExp(q, "i");
        const users = await user_1.default.find({
            $or: [{ name: regex }, { email: regex }],
        })
            .select("_id name email")
            .limit(20);
        res.json(users);
    }
    catch (error) {
        console.error("Error searching users:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
exports.default = router;
