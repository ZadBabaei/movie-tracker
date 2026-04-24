import express, { Request, Response } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Group from "../models/Groups";
import Movie from "../models/movie";

import User from "../models/user";
import InvitationLink from "../models/InvitationLink";
import { authenticate } from "../middleware/authMiddleware";
import { getIO } from "../socket";
import { sendGroupInviteEmail } from "../utils/emailService";

const router = express.Router();

router.get("/mine", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const groups = await Group.find({ members: userId })
      .populate("members", "name email avatar")
      .populate("creator", "_id name")
      .sort({ createdAt: -1 });
    res.json(groups);
  } catch (err) {
    console.error("Error fetching user groups:", err);
    res.status(500).json({ msg: "Failed to fetch groups." });
  }
});

router.post("/:id/leave", authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = req.params.id;
    const userId = req.user!.id;

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found." });
      return;
    }

    group.members = group.members.filter((memberId) => memberId.toString() !== userId);

    if (group.members.length === 0) {
      await Group.findByIdAndDelete(groupId);
      res.json({ msg: "You left the group. Group deleted because it was empty." });
      return;
    }

    await group.save();
    res.json({ msg: "You left the group." });
  } catch (err) {
    console.error("Error leaving group:", err);
    res.status(500).json({ msg: "Failed to leave group." });
  }
});

router.post("/create", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { groupName } = req.body;
    if (!groupName) {
      res.status(400).json({ msg: "Group name required." });
      return;
    }

    const existing = await Group.findOne({ name: groupName });
    if (existing) {
      res.status(400).json({ msg: "Group already exists." });
      return;
    }

    const group = new Group({
      name: groupName,
      members: [userId],
      pendingInvitations: [],
      creator: userId,
    });

    await group.save();
    res.json({ msg: "Group created", group });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/invite", authenticate, async (req: Request, res: Response) => {
  try {
    const { groupId, members, inviterName } = req.body;
    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found." });
      return;
    }

    if (!group.pendingInvitations) group.pendingInvitations = [];

    const existingMemberIds = group.members.map((m) => m.toString());
    const existingPendingIds = group.pendingInvitations.map((inv) => inv.userId.toString());

    const newMembers = members.filter((memberId: string) =>
      !existingMemberIds.includes(memberId) && !existingPendingIds.includes(memberId)
    );

    if (newMembers.length === 0) {
      res.status(400).json({ msg: "All users are already members or have pending invitations." });
      return;
    }

    const invitations = newMembers.map((memberId: string) => ({
      userId: new mongoose.Types.ObjectId(memberId),
      inviterName,
    }));

    group.pendingInvitations.push(...invitations);

    await group.save();
    res.status(200).json({ msg: "Invitations sent successfully!", group });
  } catch (error) {
    console.error("Error sending invitations:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/respond", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.id);
    const { groupId, response } = req.body;

    if (!groupId || !["accept", "decline"].includes(response)) {
      res.status(400).json({ msg: "Invalid request." });
      return;
    }

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found." });
      return;
    }

    if (!Array.isArray(group.pendingInvitations)) group.pendingInvitations = [];

    if (response === "accept") {
      const alreadyMember = group.members.some((m) => m.toString() === userId.toString());
      if (!alreadyMember) {
        group.members.push(userId);
      }
    }

    group.pendingInvitations = group.pendingInvitations.filter(
      (inv) => inv.userId.toString() !== userId.toString()
    );

    await group.save();
    res.json({ msg: `You have ${response}ed the invitation.`, group });
  } catch (error) {
    console.error("Error responding to invitation:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = req.params.id;

    // First fetch to migrate old plain-ObjectId movie entries
    const rawGroup = await Group.findById(groupId);
    if (!rawGroup) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    let needsSave = false;
    rawGroup.movies = rawGroup.movies.map((m: any) => {
      if (m.movieId) return m;
      needsSave = true;
      return { movieId: m, watchedDate: new Date(), watchedWhere: "", watchedWith: [] };
    }) as any;
    if (needsSave) await rawGroup.save();

    // Now fetch with populate
    const group = await Group.findById(groupId)
      .populate("members", "_id name avatar")
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
        path: "currentPoll",
        populate: { path: "votes.userId", select: "name" },
      });

    const hasActivePoll = await group!.hasActivePoll();
    res.json({ ...group!.toObject(), hasActivePoll });
  } catch (error) {
    console.error("Error fetching group:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/:id/add-movie", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.id);
    const groupId = req.params.id;
    const { movie } = req.body;

    if (!movie || !movie.imdbID || !movie.title) {
      res.status(400).json({ msg: "Invalid movie data" });
      return;
    }

    let existingMovie = await Movie.findOne({ imdbID: movie.imdbID });
    if (!existingMovie) {
      existingMovie = new Movie({
        title: movie.title,
        imdbID: movie.imdbID,
        poster: movie.poster_path,
        vote_average: movie.vote_average || 0,
        addedBy: userId,
      });
      await existingMovie.save();
    }

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    // Migrate old plain-ObjectId entries to subdocument format
    group.movies = group.movies.map((m: any) => {
      if (m.movieId) return m; // already new format
      return { movieId: m, watchedDate: new Date(), watchedWhere: "", watchedWith: [] };
    }) as any;

    const alreadyInGroup = group.movies.some(
      (m: any) => (m.movieId || m).toString() === existingMovie!._id.toString()
    );
    if (!alreadyInGroup) {
      group.movies.push({
        movieId: existingMovie._id,
        watchedDate: new Date(),
        watchedWhere: "",
        watchedWith: [userId],
      } as any);
    }
    await group.save();

    getIO().to(groupId).emit("group:movie_added", { movie: existingMovie });
    res.json({ msg: "Movie added", movie: existingMovie });
  } catch (error) {
    console.error("Error adding movie:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.delete("/:groupId/remove-movie/:movieId", authenticate, async (req: Request, res: Response) => {
  try {
    const { groupId, movieId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    group.movies = group.movies.filter(
      (m: any) => (m.movieId || m).toString() !== movieId
    ) as any;
    await group.save();
    res.json({ msg: "Movie removed from group" });
  } catch (error) {
    console.error("Error removing movie:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

// ─── Admin: remove member ─────────────────────────────────────────────────────

router.delete("/:id/remove-member/:memberId", authenticate, async (req: Request, res: Response) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const requesterId = req.user!.id;
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
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

// ─── Invitation link endpoints ───────────────────────────────────────────────

router.post("/:id/invite-link", authenticate, async (req: Request, res: Response) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const userId = req.user!.id;
    if (!group.members.some((m) => m.toString() === userId)) {
      res.status(403).json({ msg: "You are not a member of this group" });
      return;
    }

    const link = new InvitationLink({
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
  } catch (error) {
    console.error("Error generating invite link:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.get("/join-by-link/:token", async (req: Request, res: Response) => {
  try {
    const link = await InvitationLink.findOne({
      token: req.params.token,
      expiresAt: { $gt: new Date() },
    }).populate("groupId", "name");

    if (!link) {
      res.status(410).json({ msg: "expired or invalid" });
      return;
    }

    const group = link.groupId as any;
    res.json({ groupId: group._id, groupName: group.name, valid: true });
  } catch (error) {
    console.error("Error validating invite link:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/join-by-link/:token", async (req: Request, res: Response) => {
  try {
    const link = await InvitationLink.findOne({
      token: req.params.token,
      expiresAt: { $gt: new Date() },
    }).populate("groupId", "name");

    if (!link) {
      res.status(410).json({ msg: "expired or invalid" });
      return;
    }

    const group = link.groupId as any;

    // Check for auth header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ msg: "auth required", groupId: group._id, groupName: group.name });
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    } catch {
      res.status(401).json({ msg: "auth required", groupId: group._id, groupName: group.name });
      return;
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(401).json({ msg: "auth required", groupId: group._id, groupName: group.name });
      return;
    }

    const fullGroup = await Group.findById(group._id);
    if (!fullGroup) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    if (fullGroup.members.some((m) => m.toString() === user._id.toString())) {
      res.json({ alreadyMember: true, groupId: fullGroup._id });
      return;
    }

    fullGroup.members.push(user._id as any);
    await fullGroup.save();

    link.uses += 1;
    await link.save();

    res.json({ joined: true, groupId: fullGroup._id });
  } catch (error) {
    console.error("Error joining by link:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/invite-by-email", authenticate, async (req: Request, res: Response) => {
  try {
    const { groupId, email, inviterName } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      const uid = existingUser._id!.toString();
      if (group.members.some((m) => m.toString() === uid)) {
        res.status(400).json({ msg: "User is already a member of this group." });
        return;
      }
      if (!group.pendingInvitations) group.pendingInvitations = [];
      const alreadyPending = group.pendingInvitations.some((inv) => inv.userId.toString() === uid);
      if (alreadyPending) {
        res.status(400).json({ msg: "User already has a pending invitation." });
        return;
      }
      group.pendingInvitations.push({
        userId: existingUser._id as any,
        inviterName,
      });
      await group.save();
      res.json({ method: "in-app" });
      return;
    }

    // User not found — generate invite link and try to email it
    const link = new InvitationLink({
      groupId: group._id,
      createdBy: req.user!.id,
    });
    await link.save();

    const APP_URL = process.env.APP_URL || "http://localhost:3000";
    const inviteUrl = `${APP_URL}/invite/${link.token}`;

    try {
      await sendGroupInviteEmail(email, inviterName, group.name, inviteUrl);
      res.json({ method: "email" });
    } catch {
      res.json({ method: "link-fallback", inviteUrl });
    }
  } catch (error) {
    console.error("Error inviting by email:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

// ─── Favorite groups ─────────────────────────────────────────────────────────

router.get("/favorites/list", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.id).populate("favoriteGroups", "name");
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }
    res.json(user.favoriteGroups || []);
  } catch (error) {
    console.error("Error fetching favorite groups:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/favorite/:groupId", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    if (!user.favoriteGroups) user.favoriteGroups = [] as any;

    const groupId = req.params.groupId;
    const index = user.favoriteGroups.findIndex((id) => id.toString() === groupId);

    if (index > -1) {
      // Remove from favorites
      user.favoriteGroups.splice(index, 1);
      await user.save();
      res.json({ favorited: false, favoriteGroups: user.favoriteGroups });
    } else {
      // Add to favorites (max 2)
      if (user.favoriteGroups.length >= 2) {
        res.status(400).json({ msg: "You can only have 2 favorite groups. Unfavorite one first." });
        return;
      }
      user.favoriteGroups.push(new mongoose.Types.ObjectId(groupId as string) as any);
      await user.save();
      res.json({ favorited: true, favoriteGroups: user.favoriteGroups });
    }
  } catch (error) {
    console.error("Error toggling favorite group:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

export default router;
