"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const Groups_1 = __importDefault(require("../models/Groups"));
const router = express_1.default.Router();
router.get("/", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ msg: "Unauthorized: No token provided" });
            return;
        }
        const token = authHeader.split(" ")[1];
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const userId = new mongoose_1.default.Types.ObjectId(decoded.id);
        const groups = await Groups_1.default.find({
            pendingInvitations: { $elemMatch: { userId } },
        })
            .select("name _id pendingInvitations")
            .lean();
        const formattedInvites = groups.map((group) => {
            const invitation = group.pendingInvitations.find((inv) => inv.userId.toString() === userId.toString());
            return {
                _id: group._id,
                type: "invitation",
                content: `${invitation?.inviterName || "Someone"} invited you to join '${group.name}'!`,
            };
        });
        res.json(formattedInvites);
    }
    catch (error) {
        console.error("Error fetching inbox messages:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
exports.default = router;
