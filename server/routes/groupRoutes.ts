import express, { Request, Response } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { StreamChat } from "stream-chat";
import Group from "../models/Groups";
import Movie from "../models/movie";

import User from "../models/user";
import InvitationLink from "../models/InvitationLink";
import { authenticate } from "../middleware/authMiddleware";
import { getIO } from "../socket";
import { sendGroupInviteEmail } from "../utils/emailService";
import { getDefaultAvatarUrl } from "../utils/avatar";

const router = express.Router();
const objectIdPattern = /^[a-f\d]{24}$/i;

const slugifyGroupName = (value: string) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    || "group";

const buildUniqueGroupSlug = async (groupName: string, excludeGroupId?: string) => {
  const baseSlug = slugifyGroupName(groupName);

  for (let suffix = 0; suffix < 5000; suffix += 1) {
    const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const existing = await Group.findOne({ slug }).select("_id").lean();
    if (!existing || String(existing._id) === excludeGroupId) {
      return slug;
    }
  }

  throw new Error("Could not generate a unique group slug.");
};

const ensureGroupSlug = async (group: any) => {
  if (group?.slug) return group;
  group.slug = await buildUniqueGroupSlug(group.name, group._id?.toString());
  // Legacy groups may hold plain-ObjectId movie entries that fail full
  // validation; only the slug is being written here.
  await group.save({ validateModifiedOnly: true });
  return group;
};

const ensureGroupSlugs = async (groups: any[]) => Promise.all(groups.map((group) => ensureGroupSlug(group)));

const findGroupBySlugOrId = async (slugOrId: string) => {
  if (objectIdPattern.test(slugOrId)) {
    const byId = await Group.findById(slugOrId);
    if (byId) return ensureGroupSlug(byId);
  }

  const bySlug = await Group.findOne({ slug: slugOrId });
  if (bySlug) return ensureGroupSlug(bySlug);

  return null;
};

const upsertUserToStream = async (user: { _id: any; name?: string; email?: string; avatar?: string }) => {
  const apiKey = process.env.STREAM_API_KEY?.trim();
  const apiSecret = process.env.STREAM_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return;

  try {
    const chatClient = StreamChat.getInstance(apiKey, apiSecret);
    await chatClient.upsertUser({
      id: user._id.toString(),
      name: user.name || user.email || "Unknown user",
      image: user.avatar || getDefaultAvatarUrl(user.name, user.email),
    });
  } catch (err) {
    console.error("Failed to upsert user to Stream Chat:", err);
  }
};

const getAppUrl = () =>
  (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

const getEmailDomain = (email: string) => {
  const domain = String(email || "").split("@")[1];
  return domain || "missing";
};

const dedupeGroupMembers = async (groupId: mongoose.Types.ObjectId | string) => {
  const group = await Group.findById(groupId);
  if (!group) return null;

  const seen = new Set<string>();
  const uniqueMembers = group.members.filter((memberId) => {
    const id = memberId.toString();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  if (uniqueMembers.length !== group.members.length) {
    group.members = uniqueMembers as any;
    await group.save();
  }

  return group;
};

const getRatingSummary = (historyItem: any, currentUserId: string) => {
  const ratings = Array.isArray(historyItem?.ratings) ? historyItem.ratings : [];
  const validRatings = ratings
    .map((entry: any) => ({
      userId: entry.userId?._id?.toString?.() || entry.userId?.toString?.() || String(entry.userId || ""),
      name: entry.userId?.name || "Group member",
      avatar: entry.userId?.avatar || "",
      rating: Number(entry.rating),
    }))
    .filter((entry: any) => Number.isFinite(entry.rating) && entry.rating >= 1 && entry.rating <= 10);

  const ratingCount = validRatings.length;
  const averageRating = ratingCount
    ? Number((validRatings.reduce((sum: number, entry: any) => sum + entry.rating, 0) / ratingCount).toFixed(1))
    : null;
  const currentUserRating = validRatings.find((entry: any) => entry.userId === currentUserId)?.rating ?? null;

  return { averageRating, ratingCount, currentUserRating, ratings: validRatings };
};

const withRatingSummaries = (groupObject: any, currentUserId: string) => ({
  ...groupObject,
  movies: (groupObject.movies || []).map((historyItem: any) => ({
    ...historyItem,
    ...getRatingSummary(historyItem, currentUserId),
  })),
});

router.get("/mine", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const groups = await Group.find({ members: userId })
      .populate("members", "name email avatar")
      .populate("creator", "_id name")
      .sort({ createdAt: -1 });
    const groupsWithSlugs = await ensureGroupSlugs(groups);
    res.json(groupsWithSlugs);
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
    const groupName = String(req.body?.groupName || "").trim();
    if (!groupName) {
      res.status(400).json({ msg: "Group name required." });
      return;
    }

    const group = new Group({
      name: groupName,
      slug: await buildUniqueGroupSlug(groupName),
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

router.get("/slug/:slug", authenticate, async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const group = await findGroupBySlugOrId(slug);

    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    res.json({ _id: group._id, slug: group.slug, name: group.name });
  } catch (error) {
    console.error("Error fetching group by slug:", error);
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
      await Group.updateOne(
        { _id: group._id },
        {
          $addToSet: { members: userId },
          $pull: { pendingInvitations: { userId } },
        }
      );
      const acceptingUser = await User.findById(userId).lean();
      if (acceptingUser) await upsertUserToStream(acceptingUser);
    } else {
      await Group.updateOne(
        { _id: group._id },
        { $pull: { pendingInvitations: { userId } } }
      );
    }

    const updatedGroup = await dedupeGroupMembers(group.id);
    res.json({ msg: `You have ${response}ed the invitation.`, group: updatedGroup || group });
  } catch (error) {
    console.error("Error responding to invitation:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const groupHandle = String(req.params.id || "").trim();

    // First fetch to migrate old plain-ObjectId movie entries
    const rawGroup = await findGroupBySlugOrId(groupHandle);
    if (!rawGroup) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    let needsSave = false;
    const seenMembers = new Set<string>();
    rawGroup.members = rawGroup.members.filter((memberId) => {
      const id = memberId.toString();
      if (seenMembers.has(id)) {
        needsSave = true;
        return false;
      }
      seenMembers.add(id);
      return true;
    }) as any;

    rawGroup.movies = rawGroup.movies.map((m: any) => {
      if (m.movieId) return m;
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
    }) as any;
    if (needsSave) await rawGroup.save();

    // Now fetch with populate
    const group = await Group.findById(rawGroup._id)
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

    const hasActivePoll = await group!.hasActivePoll();
    res.json(withRatingSummaries({ ...group!.toObject(), hasActivePoll }, req.user!.id));
  } catch (error) {
    console.error("Error fetching group:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/:id/add-movie", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.id);
    const groupId = req.params.id;
    const {
      movie,
      watchedAt,
      watchedDate,
      watchedLocation,
      watchedWhere,
      watchedWith,
      watchedNotes,
    } = req.body;

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
      ? watchedWith.filter((memberId: string) => mongoose.Types.ObjectId.isValid(memberId))
      : [];
    const groupMemberIds = new Set(group.members.map((memberId) => memberId.toString()));
    const validWatchedWith = watchedWithIds.filter((memberId: string) => groupMemberIds.has(memberId));
    const watchedWithPayload = validWatchedWith.length ? validWatchedWith : [userId.toString()];
    const locationPayload = String(watchedLocation ?? watchedWhere ?? "").trim();
    const notesPayload = String(watchedNotes ?? "").trim();

    // Migrate old plain-ObjectId entries to subdocument format
    group.movies = group.movies.map((m: any) => {
      if (m.movieId) return m; // already new format
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
    }) as any;

    const alreadyInGroup = group.movies.some(
      (m: any) => (m.movieId || m).toString() === existingMovie!._id.toString()
    );
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

router.post("/:groupId/history/:historyItemId/rating", authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = String(req.params.groupId);
    const historyItemId = String(req.params.historyItemId);
    const userId = req.user!.id;
    const rating = Number(req.body?.rating);

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(historyItemId)) {
      res.status(400).json({ msg: "Invalid history item." });
      return;
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      res.status(400).json({ msg: "Rating must be a whole number from 1 to 10." });
      return;
    }

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const isMember = group.members.some((memberId) => memberId.toString() === userId);
    if (!isMember) {
      res.status(403).json({ msg: "Only group members can rate watched movies." });
      return;
    }

    const historyItem = (group.movies as any).id(historyItemId);
    if (!historyItem) {
      res.status(404).json({ msg: "History item not found." });
      return;
    }

    if (!Array.isArray(historyItem.ratings)) historyItem.ratings = [];

    const now = new Date();
    const existingRating = historyItem.ratings.find(
      (entry: any) => entry.userId?.toString() === userId
    );

    if (existingRating) {
      existingRating.rating = rating;
      existingRating.updatedAt = now;
    } else {
      historyItem.ratings.push({
        userId: new mongoose.Types.ObjectId(userId),
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

    const updatedHistoryItem = (group.movies as any).id(historyItemId) || historyItem;
    const summary = getRatingSummary(updatedHistoryItem, userId);
    getIO().to(groupId).emit("group:history_rating_updated", {
      historyItemId,
      ...summary,
    });

    res.json({
      msg: "Rating saved",
      historyItemId,
      ...summary,
    });
  } catch (error) {
    console.error("Error rating history item:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.patch("/:groupId/history/:historyItemId", authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = String(req.params.groupId);
    const historyItemId = String(req.params.historyItemId);
    const userId = req.user!.id;
    const {
      watchedAt,
      watchedDate,
      watchedLocation,
      watchedWhere,
      watchedWith,
      watchedNotes,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(historyItemId)) {
      res.status(400).json({ msg: "Invalid history item." });
      return;
    }

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const isMember = group.members.some((memberId) => memberId.toString() === userId);
    if (!isMember) {
      res.status(403).json({ msg: "Only group members can edit watch history items." });
      return;
    }

    const historyItem = (group.movies as any).id(historyItemId);
    if (!historyItem) {
      res.status(404).json({ msg: "History item not found." });
      return;
    }

    const parsedWatchedAt = watchedAt || watchedDate ? new Date(watchedAt || watchedDate) : null;
    if (!parsedWatchedAt || Number.isNaN(parsedWatchedAt.getTime())) {
      res.status(400).json({ msg: "Invalid watched date." });
      return;
    }

    const watchedWithIds = Array.isArray(watchedWith)
      ? watchedWith.filter((memberId: string) => mongoose.Types.ObjectId.isValid(memberId))
      : [];
    const groupMemberIds = new Set(group.members.map((memberId) => memberId.toString()));
    const validWatchedWith = watchedWithIds.filter((memberId: string) => groupMemberIds.has(memberId));
    if (validWatchedWith.length === 0) {
      res.status(400).json({ msg: "Select at least one person who watched." });
      return;
    }

    const locationPayload = String(watchedLocation ?? watchedWhere ?? "").trim();
    const notesPayload = String(watchedNotes ?? "").trim();

    historyItem.watchedAt = parsedWatchedAt;
    historyItem.watchedDate = parsedWatchedAt;
    historyItem.watchedLocation = locationPayload;
    historyItem.watchedWhere = locationPayload;
    historyItem.watchedWith = validWatchedWith as any;
    historyItem.watchedNotes = notesPayload;

    await group.save();
    await group.populate({ path: "movies.watchedWith", select: "_id name avatar" });

    const updatedHistoryItem = (group.movies as any).id(historyItemId) || historyItem;
    getIO().to(groupId).emit("group:history_updated", { historyItemId });
    res.json({ msg: "History item updated", historyItem: updatedHistoryItem });
  } catch (error) {
    console.error("Error updating history item:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.delete("/:groupId/history/:historyItemId", authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = String(req.params.groupId);
    const historyItemId = String(req.params.historyItemId);
    const userId = req.user!.id;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(historyItemId)) {
      res.status(400).json({ msg: "Invalid history item." });
      return;
    }

    const group = await Group.findById(groupId);
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
    group.movies = group.movies.filter((historyItem: any) => {
      const itemId = historyItem._id?.toString();
      return itemId !== historyItemId;
    }) as any;

    if (group.movies.length === beforeCount) {
      res.status(404).json({ msg: "History item not found." });
      return;
    }

    await group.save();
    getIO().to(groupId).emit("group:history_deleted", { historyItemId });
    res.json({ msg: "History item deleted", historyItemId, movies: group.movies });
  } catch (error) {
    console.error("Error deleting history item:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.delete("/:groupId/remove-movie/:movieId", authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = String(req.params.groupId);
    const movieId = String(req.params.movieId);
    const requesterId = req.user!.id;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(movieId)) {
      res.status(400).json({ msg: "Invalid group or movie id." });
      return;
    }

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const isMember = group.members.some((memberId) => memberId.toString() === requesterId);
    if (!isMember) {
      res.status(403).json({ msg: "Only group members can remove watched movies." });
      return;
    }

    if (group.creator.toString() !== requesterId) {
      res.status(403).json({ msg: "Only the group admin can remove watched movies." });
      return;
    }

    const beforeCount = group.movies.length;
    group.movies = group.movies.filter(
      (m: any) => (m.movieId || m).toString() !== movieId
    ) as any;

    if (group.movies.length === beforeCount) {
      res.status(404).json({ msg: "Movie not found in group history." });
      return;
    }

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

    res.json({
      url: `${getAppUrl()}/invite/${link.token}`,
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

    const group = await ensureGroupSlug(link.groupId as any);
    res.json({ groupId: group._id, groupSlug: group.slug, groupName: group.name, valid: true });
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

    const group = await ensureGroupSlug(link.groupId as any);

    // Check for auth header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ msg: "auth required", groupId: group._id, groupSlug: group.slug, groupName: group.name });
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    } catch {
      res.status(401).json({ msg: "auth required", groupId: group._id, groupSlug: group.slug, groupName: group.name });
      return;
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(401).json({ msg: "auth required", groupId: group._id, groupSlug: group.slug, groupName: group.name });
      return;
    }

    const fullGroup = await dedupeGroupMembers(group._id);
    if (!fullGroup) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const addResult = await Group.updateOne(
      { _id: fullGroup._id },
      { $addToSet: { members: user._id } }
    );
    const joined = addResult.modifiedCount > 0;

    if (joined) {
      link.uses += 1;
      await link.save();
      await upsertUserToStream(user);
    }

    await dedupeGroupMembers(fullGroup.id);
    const hydratedGroup = await ensureGroupSlug(fullGroup);
    res.json({ joined, alreadyMember: !joined, groupId: hydratedGroup._id, groupSlug: hydratedGroup.slug });
  } catch (error) {
    console.error("Error joining by link:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/invite-by-email", authenticate, async (req: Request, res: Response) => {
  try {
    const { groupId, inviterName } = req.body;
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!email) {
      res.status(400).json({ msg: "Email is required." });
      return;
    }

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
      res.json({ method: "in-app", msg: "In-app invitation sent." });
      return;
    }

    // User not found — generate invite link and try to email it
    const link = new InvitationLink({
      groupId: group._id,
      createdBy: req.user!.id,
    });
    await link.save();

    const inviteUrl = `${getAppUrl()}/invite/${link.token}`;

    try {
      await sendGroupInviteEmail(email, inviterName, group.name, inviteUrl);
      res.json({ method: "email", msg: "Email invitation sent.", inviteUrl, expiresAt: link.expiresAt });
    } catch (error) {
      console.error("Invite email delivery failed; returning manual link fallback:", {
        recipientDomain: getEmailDomain(email),
        name: (error as Error).name,
        message: (error as Error).message,
      });
      res.json({
        method: "link-fallback",
        msg: "Email could not be sent. Use this invite link instead.",
        inviteUrl,
        expiresAt: link.expiresAt,
      });
    }
  } catch (error) {
    console.error("Error inviting by email:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

// ─── Favorite groups ─────────────────────────────────────────────────────────

router.get("/favorites/list", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.id).populate("favoriteGroups", "name slug");
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }
    const favorites = await ensureGroupSlugs((user.favoriteGroups || []) as any[]);
    res.json(favorites);
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
