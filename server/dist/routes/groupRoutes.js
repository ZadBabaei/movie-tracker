"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Groups_1 = __importDefault(require("../models/Groups"));
const movie_1 = __importDefault(require("../models/movie"));
const user_1 = __importDefault(require("../models/user"));
const InvitationLink_1 = __importDefault(require("../models/InvitationLink"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const socket_1 = require("../socket");
const emailService_1 = require("../utils/emailService");
const router = express_1.default.Router();
const dedupeGroupMembers = async (groupId) => {
    const group = await Groups_1.default.findById(groupId);
    if (!group)
        return null;
    const seen = new Set();
    const uniqueMembers = group.members.filter((memberId) => {
        const id = memberId.toString();
        if (seen.has(id))
            return false;
        seen.add(id);
        return true;
    });
    if (uniqueMembers.length !== group.members.length) {
        group.members = uniqueMembers;
        await group.save();
    }
    return group;
};
const getRatingSummary = (historyItem, currentUserId) => {
    const ratings = Array.isArray(historyItem?.ratings) ? historyItem.ratings : [];
    const validRatings = ratings
        .map((entry) => ({
        userId: entry.userId?._id?.toString?.() || entry.userId?.toString?.() || String(entry.userId || ""),
        name: entry.userId?.name || "Group member",
        avatar: entry.userId?.avatar || "",
        rating: Number(entry.rating),
    }))
        .filter((entry) => Number.isFinite(entry.rating) && entry.rating >= 1 && entry.rating <= 10);
    const ratingCount = validRatings.length;
    const averageRating = ratingCount
        ? Number((validRatings.reduce((sum, entry) => sum + entry.rating, 0) / ratingCount).toFixed(1))
        : null;
    const currentUserRating = validRatings.find((entry) => entry.userId === currentUserId)?.rating ?? null;
    return { averageRating, ratingCount, currentUserRating, ratings: validRatings };
};
const withRatingSummaries = (groupObject, currentUserId) => ({
    ...groupObject,
    movies: (groupObject.movies || []).map((historyItem) => ({
        ...historyItem,
        ...getRatingSummary(historyItem, currentUserId),
    })),
});
router.get("/mine", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const groups = await Groups_1.default.find({ members: userId })
            .populate("members", "name email avatar")
            .populate("creator", "_id name")
            .sort({ createdAt: -1 });
        res.json(groups);
    }
    catch (err) {
        console.error("Error fetching user groups:", err);
        res.status(500).json({ msg: "Failed to fetch groups." });
    }
});
router.post("/:id/leave", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const groupId = req.params.id;
        const userId = req.user.id;
        const group = await Groups_1.default.findById(groupId);
        if (!group) {
            res.status(404).json({ msg: "Group not found." });
            return;
        }
        group.members = group.members.filter((memberId) => memberId.toString() !== userId);
        if (group.members.length === 0) {
            await Groups_1.default.findByIdAndDelete(groupId);
            res.json({ msg: "You left the group. Group deleted because it was empty." });
            return;
        }
        await group.save();
        res.json({ msg: "You left the group." });
    }
    catch (err) {
        console.error("Error leaving group:", err);
        res.status(500).json({ msg: "Failed to leave group." });
    }
});
router.post("/create", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { groupName } = req.body;
        if (!groupName) {
            res.status(400).json({ msg: "Group name required." });
            return;
        }
        const existing = await Groups_1.default.findOne({ name: groupName });
        if (existing) {
            res.status(400).json({ msg: "Group already exists." });
            return;
        }
        const group = new Groups_1.default({
            name: groupName,
            members: [userId],
            pendingInvitations: [],
            creator: userId,
        });
        await group.save();
        res.json({ msg: "Group created", group });
    }
    catch (error) {
        console.error("Error creating group:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.post("/invite", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const { groupId, members, inviterName } = req.body;
        const group = await Groups_1.default.findById(groupId);
        if (!group) {
            res.status(404).json({ msg: "Group not found." });
            return;
        }
        if (!group.pendingInvitations)
            group.pendingInvitations = [];
        const existingMemberIds = group.members.map((m) => m.toString());
        const existingPendingIds = group.pendingInvitations.map((inv) => inv.userId.toString());
        const newMembers = members.filter((memberId) => !existingMemberIds.includes(memberId) && !existingPendingIds.includes(memberId));
        if (newMembers.length === 0) {
            res.status(400).json({ msg: "All users are already members or have pending invitations." });
            return;
        }
        const invitations = newMembers.map((memberId) => ({
            userId: new mongoose_1.default.Types.ObjectId(memberId),
            inviterName,
        }));
        group.pendingInvitations.push(...invitations);
        await group.save();
        res.status(200).json({ msg: "Invitations sent successfully!", group });
    }
    catch (error) {
        console.error("Error sending invitations:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.post("/respond", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const userId = new mongoose_1.default.Types.ObjectId(req.user.id);
        const { groupId, response } = req.body;
        if (!groupId || !["accept", "decline"].includes(response)) {
            res.status(400).json({ msg: "Invalid request." });
            return;
        }
        const group = await Groups_1.default.findById(groupId);
        if (!group) {
            res.status(404).json({ msg: "Group not found." });
            return;
        }
        if (!Array.isArray(group.pendingInvitations))
            group.pendingInvitations = [];
        if (response === "accept") {
            await Groups_1.default.updateOne({ _id: group._id }, {
                $addToSet: { members: userId },
                $pull: { pendingInvitations: { userId } },
            });
        }
        else {
            await Groups_1.default.updateOne({ _id: group._id }, { $pull: { pendingInvitations: { userId } } });
        }
        const updatedGroup = await dedupeGroupMembers(group.id);
        res.json({ msg: `You have ${response}ed the invitation.`, group: updatedGroup || group });
    }
    catch (error) {
        console.error("Error responding to invitation:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.get("/:id", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const groupId = req.params.id;
        // First fetch to migrate old plain-ObjectId movie entries
        const rawGroup = await Groups_1.default.findById(groupId);
        if (!rawGroup) {
            res.status(404).json({ msg: "Group not found" });
            return;
        }
        let needsSave = false;
        const seenMembers = new Set();
        rawGroup.members = rawGroup.members.filter((memberId) => {
            const id = memberId.toString();
            if (seenMembers.has(id)) {
                needsSave = true;
                return false;
            }
            seenMembers.add(id);
            return true;
        });
        rawGroup.movies = rawGroup.movies.map((m) => {
            if (m.movieId)
                return m;
            needsSave = true;
            return {
                movieId: m,
                watchedDate: new Date(),
                watchedAt: new Date(),
                watchedWhere: "",
                watchedLocation: "",
                watchedWith: [],
                watchedNotes: "",
                ratings: [],
            };
        });
        if (needsSave)
            await rawGroup.save();
        // Now fetch with populate
        const group = await Groups_1.default.findById(groupId)
            .populate("members", "_id name email avatar")
            .populate("creator", "_id name")
            .populate({
            path: "movies.movieId",
            select: "title imdbID poster vote_average",
        })
            .populate({
            path: "movies.watchedWith",
            select: "_id name avatar",
        })
            .populate({
            path: "movies.ratings.userId",
            select: "_id name avatar",
        })
            .populate({
            path: "currentPoll",
            populate: { path: "votes.userId", select: "name" },
        });
        const hasActivePoll = await group.hasActivePoll();
        res.json(withRatingSummaries({ ...group.toObject(), hasActivePoll }, req.user.id));
    }
    catch (error) {
        console.error("Error fetching group:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.post("/:id/add-movie", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const userId = new mongoose_1.default.Types.ObjectId(req.user.id);
        const groupId = req.params.id;
        const { movie, watchedAt, watchedDate, watchedLocation, watchedWhere, watchedWith, watchedNotes, } = req.body;
        if (!movie || !movie.imdbID || !movie.title) {
            res.status(400).json({ msg: "Invalid movie data" });
            return;
        }
        let existingMovie = await movie_1.default.findOne({ imdbID: movie.imdbID });
        if (!existingMovie) {
            existingMovie = new movie_1.default({
                title: movie.title,
                imdbID: movie.imdbID,
                poster: movie.poster_path,
                vote_average: movie.vote_average || 0,
                addedBy: userId,
            });
            await existingMovie.save();
        }
        const group = await Groups_1.default.findById(groupId);
        if (!group) {
            res.status(404).json({ msg: "Group not found" });
            return;
        }
        if (!group.members.some((memberId) => memberId.toString() === userId.toString())) {
            res.status(403).json({ msg: "Only group members can add watched movies." });
            return;
        }
        const parsedWatchedAt = watchedAt || watchedDate ? new Date(watchedAt || watchedDate) : new Date();
        if (Number.isNaN(parsedWatchedAt.getTime())) {
            res.status(400).json({ msg: "Invalid watched date." });
            return;
        }
        const watchedWithIds = Array.isArray(watchedWith)
            ? watchedWith.filter((memberId) => mongoose_1.default.Types.ObjectId.isValid(memberId))
            : [];
        const groupMemberIds = new Set(group.members.map((memberId) => memberId.toString()));
        const validWatchedWith = watchedWithIds.filter((memberId) => groupMemberIds.has(memberId));
        const watchedWithPayload = validWatchedWith.length ? validWatchedWith : [userId.toString()];
        const locationPayload = String(watchedLocation ?? watchedWhere ?? "").trim();
        const notesPayload = String(watchedNotes ?? "").trim();
        // Migrate old plain-ObjectId entries to subdocument format
        group.movies = group.movies.map((m) => {
            if (m.movieId)
                return m; // already new format
            return {
                movieId: m,
                watchedDate: new Date(),
                watchedAt: new Date(),
                watchedWhere: "",
                watchedLocation: "",
                watchedWith: [],
                watchedNotes: "",
                ratings: [],
            };
        });
        const alreadyInGroup = group.movies.some((m) => (m.movieId || m).toString() === existingMovie._id.toString());
        if (!alreadyInGroup) {
            group.movies.push({
                movieId: existingMovie._id,
                watchedDate: parsedWatchedAt,
                watchedAt: parsedWatchedAt,
                watchedWhere: locationPayload,
                watchedLocation: locationPayload,
                watchedWith: watchedWithPayload,
                watchedNotes: notesPayload,
                ratings: [],
            });
        }
        await group.save();
        (0, socket_1.getIO)().to(groupId).emit("group:movie_added", { movie: existingMovie });
        res.json({ msg: "Movie added", movie: existingMovie });
    }
    catch (error) {
        console.error("Error adding movie:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.post("/:groupId/history/:historyItemId/rating", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const groupId = String(req.params.groupId);
        const historyItemId = String(req.params.historyItemId);
        const userId = req.user.id;
        const rating = Number(req.body?.rating);
        if (!mongoose_1.default.Types.ObjectId.isValid(groupId) || !mongoose_1.default.Types.ObjectId.isValid(historyItemId)) {
            res.status(400).json({ msg: "Invalid history item." });
            return;
        }
        if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
            res.status(400).json({ msg: "Rating must be a whole number from 1 to 10." });
            return;
        }
        const group = await Groups_1.default.findById(groupId);
        if (!group) {
            res.status(404).json({ msg: "Group not found" });
            return;
        }
        const isMember = group.members.some((memberId) => memberId.toString() === userId);
        if (!isMember) {
            res.status(403).json({ msg: "Only group members can rate watched movies." });
            return;
        }
        const historyItem = group.movies.id(historyItemId);
        if (!historyItem) {
            res.status(404).json({ msg: "History item not found." });
            return;
        }
        if (!Array.isArray(historyItem.ratings))
            historyItem.ratings = [];
        const now = new Date();
        const existingRating = historyItem.ratings.find((entry) => entry.userId?.toString() === userId);
        if (existingRating) {
            existingRating.rating = rating;
            existingRating.updatedAt = now;
        }
        else {
            historyItem.ratings.push({
                userId: new mongoose_1.default.Types.ObjectId(userId),
                rating,
                createdAt: now,
                updatedAt: now,
            });
        }
        await group.save();
        await group.populate({
            path: "movies.ratings.userId",
            select: "_id name avatar",
        });
        const updatedHistoryItem = group.movies.id(historyItemId) || historyItem;
        const summary = getRatingSummary(updatedHistoryItem, userId);
        (0, socket_1.getIO)().to(groupId).emit("group:history_rating_updated", {
            historyItemId,
            ...summary,
        });
        res.json({
            msg: "Rating saved",
            historyItemId,
            ...summary,
        });
    }
    catch (error) {
        console.error("Error rating history item:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.delete("/:groupId/history/:historyItemId", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const groupId = String(req.params.groupId);
        const historyItemId = String(req.params.historyItemId);
        const userId = req.user.id;
        if (!mongoose_1.default.Types.ObjectId.isValid(groupId) || !mongoose_1.default.Types.ObjectId.isValid(historyItemId)) {
            res.status(400).json({ msg: "Invalid history item." });
            return;
        }
        const group = await Groups_1.default.findById(groupId);
        if (!group) {
            res.status(404).json({ msg: "Group not found" });
            return;
        }
        const isMember = group.members.some((memberId) => memberId.toString() === userId);
        if (!isMember) {
            res.status(403).json({ msg: "Only group members can delete watch history items." });
            return;
        }
        const beforeCount = group.movies.length;
        group.movies = group.movies.filter((historyItem) => {
            const itemId = historyItem._id?.toString();
            return itemId !== historyItemId;
        });
        if (group.movies.length === beforeCount) {
            res.status(404).json({ msg: "History item not found." });
            return;
        }
        await group.save();
        (0, socket_1.getIO)().to(groupId).emit("group:history_deleted", { historyItemId });
        res.json({ msg: "History item deleted", historyItemId, movies: group.movies });
    }
    catch (error) {
        console.error("Error deleting history item:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.delete("/:groupId/remove-movie/:movieId", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const { groupId, movieId } = req.params;
        const group = await Groups_1.default.findById(groupId);
        if (!group) {
            res.status(404).json({ msg: "Group not found" });
            return;
        }
        group.movies = group.movies.filter((m) => (m.movieId || m).toString() !== movieId);
        await group.save();
        res.json({ msg: "Movie removed from group" });
    }
    catch (error) {
        console.error("Error removing movie:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
// ─── Admin: remove member ─────────────────────────────────────────────────────
router.delete("/:id/remove-member/:memberId", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const group = await Groups_1.default.findById(req.params.id);
        if (!group) {
            res.status(404).json({ msg: "Group not found" });
            return;
        }
        const requesterId = req.user.id;
        if (group.creator.toString() !== requesterId) {
            res.status(403).json({ msg: "Only the group admin can remove members." });
            return;
        }
        const memberId = req.params.memberId;
        if (memberId === requesterId) {
            res.status(400).json({ msg: "Admin cannot remove themselves. Use leave instead." });
            return;
        }
        const memberExists = group.members.some((m) => m.toString() === memberId);
        if (!memberExists) {
            res.status(404).json({ msg: "User is not a member of this group." });
            return;
        }
        group.members = group.members.filter((m) => m.toString() !== memberId);
        await group.save();
        res.json({ msg: "Member removed successfully." });
    }
    catch (error) {
        console.error("Error removing member:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
// ─── Invitation link endpoints ───────────────────────────────────────────────
router.post("/:id/invite-link", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const group = await Groups_1.default.findById(req.params.id);
        if (!group) {
            res.status(404).json({ msg: "Group not found" });
            return;
        }
        const userId = req.user.id;
        if (!group.members.some((m) => m.toString() === userId)) {
            res.status(403).json({ msg: "You are not a member of this group" });
            return;
        }
        const link = new InvitationLink_1.default({
            groupId: group._id,
            createdBy: userId,
        });
        await link.save();
        const APP_URL = process.env.APP_URL || "http://localhost:3000";
        res.json({
            url: `${APP_URL}/invite/${link.token}`,
            token: link.token,
            expiresAt: link.expiresAt,
        });
    }
    catch (error) {
        console.error("Error generating invite link:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.get("/join-by-link/:token", async (req, res) => {
    try {
        const link = await InvitationLink_1.default.findOne({
            token: req.params.token,
            expiresAt: { $gt: new Date() },
        }).populate("groupId", "name");
        if (!link) {
            res.status(410).json({ msg: "expired or invalid" });
            return;
        }
        const group = link.groupId;
        res.json({ groupId: group._id, groupName: group.name, valid: true });
    }
    catch (error) {
        console.error("Error validating invite link:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.post("/join-by-link/:token", async (req, res) => {
    try {
        const link = await InvitationLink_1.default.findOne({
            token: req.params.token,
            expiresAt: { $gt: new Date() },
        }).populate("groupId", "name");
        if (!link) {
            res.status(410).json({ msg: "expired or invalid" });
            return;
        }
        const group = link.groupId;
        // Check for auth header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ msg: "auth required", groupId: group._id, groupName: group.name });
            return;
        }
        const token = authHeader.split(" ")[1];
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        }
        catch {
            res.status(401).json({ msg: "auth required", groupId: group._id, groupName: group.name });
            return;
        }
        const user = await user_1.default.findById(decoded.id);
        if (!user) {
            res.status(401).json({ msg: "auth required", groupId: group._id, groupName: group.name });
            return;
        }
        const fullGroup = await dedupeGroupMembers(group._id);
        if (!fullGroup) {
            res.status(404).json({ msg: "Group not found" });
            return;
        }
        const addResult = await Groups_1.default.updateOne({ _id: fullGroup._id }, { $addToSet: { members: user._id } });
        const joined = addResult.modifiedCount > 0;
        if (joined) {
            link.uses += 1;
            await link.save();
        }
        await dedupeGroupMembers(fullGroup.id);
        res.json({ joined, alreadyMember: !joined, groupId: fullGroup._id });
    }
    catch (error) {
        console.error("Error joining by link:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.post("/invite-by-email", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const { groupId, email, inviterName } = req.body;
        const group = await Groups_1.default.findById(groupId);
        if (!group) {
            res.status(404).json({ msg: "Group not found" });
            return;
        }
        const existingUser = await user_1.default.findOne({ email });
        if (existingUser) {
            const uid = existingUser._id.toString();
            if (group.members.some((m) => m.toString() === uid)) {
                res.status(400).json({ msg: "User is already a member of this group." });
                return;
            }
            if (!group.pendingInvitations)
                group.pendingInvitations = [];
            const alreadyPending = group.pendingInvitations.some((inv) => inv.userId.toString() === uid);
            if (alreadyPending) {
                res.status(400).json({ msg: "User already has a pending invitation." });
                return;
            }
            group.pendingInvitations.push({
                userId: existingUser._id,
                inviterName,
            });
            await group.save();
            res.json({ method: "in-app" });
            return;
        }
        // User not found — generate invite link and try to email it
        const link = new InvitationLink_1.default({
            groupId: group._id,
            createdBy: req.user.id,
        });
        await link.save();
        const APP_URL = process.env.APP_URL || "http://localhost:3000";
        const inviteUrl = `${APP_URL}/invite/${link.token}`;
        try {
            await (0, emailService_1.sendGroupInviteEmail)(email, inviterName, group.name, inviteUrl);
            res.json({ method: "email" });
        }
        catch {
            res.json({ method: "link-fallback", inviteUrl });
        }
    }
    catch (error) {
        console.error("Error inviting by email:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
// ─── Favorite groups ─────────────────────────────────────────────────────────
router.get("/favorites/list", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const user = await user_1.default.findById(req.user.id).populate("favoriteGroups", "name");
        if (!user) {
            res.status(404).json({ msg: "User not found" });
            return;
        }
        res.json(user.favoriteGroups || []);
    }
    catch (error) {
        console.error("Error fetching favorite groups:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
router.post("/favorite/:groupId", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const user = await user_1.default.findById(req.user.id);
        if (!user) {
            res.status(404).json({ msg: "User not found" });
            return;
        }
        if (!user.favoriteGroups)
            user.favoriteGroups = [];
        const groupId = req.params.groupId;
        const index = user.favoriteGroups.findIndex((id) => id.toString() === groupId);
        if (index > -1) {
            // Remove from favorites
            user.favoriteGroups.splice(index, 1);
            await user.save();
            res.json({ favorited: false, favoriteGroups: user.favoriteGroups });
        }
        else {
            // Add to favorites (max 2)
            if (user.favoriteGroups.length >= 2) {
                res.status(400).json({ msg: "You can only have 2 favorite groups. Unfavorite one first." });
                return;
            }
            user.favoriteGroups.push(new mongoose_1.default.Types.ObjectId(groupId));
            await user.save();
            res.json({ favorited: true, favoriteGroups: user.favoriteGroups });
        }
    }
    catch (error) {
        console.error("Error toggling favorite group:", error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
});
exports.default = router;
