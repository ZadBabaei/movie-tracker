import express, { Request, Response } from "express";
import mongoose from "mongoose";
import { authenticate } from "../middleware/authMiddleware";
import { isGroupMember } from "../middleware/groupAccess";
import Group from "../models/Groups";
import Movie from "../models/movie";
import User from "../models/user";
import WatchHistoryEntry from "../models/WatchHistoryEntry";
import { getIO } from "../socket";
import { serializeHistoryEntry, syncLegacyGroupHistory } from "../utils/watchHistory";

const router = express.Router();
const POPULATE = [
  { path: "movieId", select: "title imdbID poster vote_average" },
  { path: "groupId", select: "name slug" },
  { path: "createdBy", select: "name avatar" },
  { path: "participants", select: "name avatar" },
  { path: "ratings.userId", select: "name avatar" },
];

const parseDate = (value: unknown): Date | null => {
  const date = value ? new Date(String(value)) : new Date();
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseLimit = (value: unknown) => Math.min(Math.max(Number(value) || 48, 1), 100);

const buildSearchMovieIds = async (search: unknown) => {
  const query = String(search || "").trim();
  if (!query) return null;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const movies = await Movie.find({ title: { $regex: safe, $options: "i" } }).select("_id").limit(200).lean();
  return movies.map((movie) => movie._id);
};

const readEntries = async (req: Request, res: Response, baseQuery: Record<string, unknown>) => {
  const userId = req.user!.id;
  const limit = parseLimit(req.query.limit);
  const query: Record<string, any> = { ...baseQuery };
  const movieIds = await buildSearchMovieIds(req.query.search);
  if (movieIds) query.movieId = { $in: movieIds };

  const year = Number(req.query.year);
  if (Number.isInteger(year) && year >= 1900 && year <= 2200) {
    query.watchedAt = { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) };
  }
  if (String(req.query.rated || "") === "true") query["ratings.0"] = { $exists: true };

  const cursor = String(req.query.cursor || "");
  if (cursor && mongoose.Types.ObjectId.isValid(cursor) && !query.watchedAt) {
    const cursorEntry = await WatchHistoryEntry.findById(cursor).select("watchedAt _id").lean();
    if (cursorEntry) {
      query.$or = [
        { watchedAt: { $lt: cursorEntry.watchedAt } },
        { watchedAt: cursorEntry.watchedAt, _id: { $lt: cursorEntry._id } },
      ];
    }
  }

  const total = await WatchHistoryEntry.countDocuments(query);
  const documents = await WatchHistoryEntry.find(query)
    .sort({ watchedAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate(POPULATE)
    .lean();
  const hasMore = documents.length > limit;
  const page = documents.slice(0, limit);
  let items = page.map((entry) => serializeHistoryEntry(entry, userId));
  const sort = String(req.query.sort || "recent");
  if (sort === "title") items = items.sort((a, b) => a.movie.title.localeCompare(b.movie.title));
  if (sort === "rating") items = items.sort((a, b) => (b.averageRating ?? -1) - (a.averageRating ?? -1));

  res.json({
    items,
    nextCursor: hasMore ? page[page.length - 1]?._id?.toString() || null : null,
    stats: {
      total,
      latestWatchedAt: items[0]?.watchedAt || null,
    },
  });
};

router.get("/personal", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const legacyGroups = await Group.find({ "movies.watchedWith": userId }).select("_id").lean();
    if (legacyGroups.length) await syncLegacyGroupHistory(legacyGroups.map((group) => group._id));
    await readEntries(req, res, { participants: new mongoose.Types.ObjectId(userId) });
  } catch (error) {
    console.error("Error fetching personal watch history:", error);
    res.status(500).json({ msg: "Failed to fetch watch history" });
  }
});

router.get("/group/:groupId", authenticate, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      res.status(400).json({ msg: "Invalid group id." });
      return;
    }
    const group = await Group.findById(groupId).select("members creator").lean();
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }
    if (!isGroupMember(group, req.user!.id)) {
      res.status(403).json({ msg: "Only group members can view this history." });
      return;
    }
    await syncLegacyGroupHistory([groupId]);
    await readEntries(req, res, { groupId: new mongoose.Types.ObjectId(groupId) });
  } catch (error) {
    console.error("Error fetching group watch history:", error);
    res.status(500).json({ msg: "Failed to fetch group watch history" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const requestedMovieId = String(req.body?.movieId || "");
    const scope = req.body?.scope === "group" ? "group" : "personal";
    const groupId = String(req.body?.groupId || "");
    let movie;

    if (requestedMovieId) {
      if (!mongoose.Types.ObjectId.isValid(requestedMovieId)) {
        res.status(400).json({ msg: "Invalid movie id." });
        return;
      }
      movie = await Movie.findById(requestedMovieId);
      if (!movie) {
        res.status(404).json({ msg: "Movie not found" });
        return;
      }
    } else {
      const rawMovie = req.body?.movie;
      const imdbID = String(rawMovie?.imdbID || "").trim();
      const title = String(rawMovie?.title || "").trim();
      if (!imdbID || !title || imdbID.length > 64 || title.length > 300) {
        res.status(400).json({ msg: "Invalid movie data" });
        return;
      }

      movie = await Movie.findOne({ imdbID });
      if (!movie) {
        try {
          movie = await Movie.create({
            title,
            imdbID,
            poster: rawMovie.poster_path,
            vote_average: Number(rawMovie.vote_average) || 0,
            addedBy: userId,
          });
        } catch (error: any) {
          if (error?.code !== 11000) throw error;
          movie = await Movie.findOne({ imdbID });
          if (!movie) throw error;
        }
      }
    }
    const movieId = movie._id.toString();
    const watchedAt = parseDate(req.body?.watchedAt || req.body?.watchedDate);
    if (!watchedAt) {
      res.status(400).json({ msg: "Invalid watched date." });
      return;
    }

    let group: any = null;
    let participants = [new mongoose.Types.ObjectId(userId)];
    let legacyHistoryItemId: mongoose.Types.ObjectId | undefined;
    if (scope === "group") {
      if (!mongoose.Types.ObjectId.isValid(groupId)) {
        res.status(400).json({ msg: "A valid group is required." });
        return;
      }
      group = await Group.findById(groupId);
      if (!group) {
        res.status(404).json({ msg: "Group not found" });
        return;
      }
      if (!isGroupMember(group, userId)) {
        res.status(403).json({ msg: "Only group members can add watched movies." });
        return;
      }
      const memberIds = new Set(group.members.map((member: any) => member.toString()));
      const requested = Array.isArray(req.body?.participants || req.body?.watchedWith)
        ? (req.body.participants || req.body.watchedWith).map(String)
        : [];
      if (requested.some((id: string) => !mongoose.Types.ObjectId.isValid(id) || !memberIds.has(id))) {
        res.status(400).json({ msg: "Participants can only include group members." });
        return;
      }
      const participantIds = requested.length ? requested : [userId];
      participants = participantIds.map((id: string) => new mongoose.Types.ObjectId(id));

      const legacyEntry = {
        movieId: movie._id,
        watchedDate: watchedAt,
        watchedAt,
        watchedWhere: String(req.body?.watchedLocation || req.body?.watchedWhere || "").trim(),
        watchedLocation: String(req.body?.watchedLocation || req.body?.watchedWhere || "").trim(),
        watchedWith: participants,
        watchedNotes: String(req.body?.watchedNotes || "").trim(),
        ratings: [],
      };
      group.movies.push(legacyEntry as any);
      legacyHistoryItemId = (group.movies[group.movies.length - 1] as any)._id;
      await group.save();
    }

    let entry;
    try {
      entry = await WatchHistoryEntry.create({
        movieId: movie._id,
        scope,
        groupId: scope === "group" ? group._id : undefined,
        createdBy: userId,
        participants,
        watchedAt,
        watchedLocation: String(req.body?.watchedLocation || req.body?.watchedWhere || "").trim(),
        watchedNotes: String(req.body?.watchedNotes || "").trim(),
        legacyGroupId: scope === "group" ? group._id : undefined,
        legacyHistoryItemId,
      });
    } catch (error) {
      if (group && legacyHistoryItemId) {
        await Group.updateOne({ _id: group._id }, { $pull: { movies: { _id: legacyHistoryItemId } } });
      }
      throw error;
    }

    const source = String(req.body?.source || "");
    try {
      if (source === "personal") {
        await User.updateOne({ _id: userId }, { $pull: { watchlist: movie._id } });
      } else if (source === "group" && group) {
        group.watchlist = group.watchlist.filter((item: any) => item.movieId.toString() !== movieId);
        await group.save();
        getIO().to(groupId).emit("group:watchlist_updated", { groupId });
      }
    } catch (error) {
      await entry.deleteOne();
      if (group && legacyHistoryItemId) {
        await Group.updateOne({ _id: group._id }, { $pull: { movies: { _id: legacyHistoryItemId } } });
      }
      throw error;
    }

    await entry.populate(POPULATE);
    if (group) getIO().to(groupId).emit("group:history_updated", { historyEntryId: entry._id.toString() });
    res.status(201).json({ msg: "Watch history entry created", entry: serializeHistoryEntry(entry.toObject(), userId) });
  } catch (error) {
    console.error("Error creating watch history entry:", error);
    res.status(500).json({ msg: "Failed to create watch history entry" });
  }
});

const loadAuthorizedEntry = async (req: Request, res: Response, action: string) => {
  const entryId = String(req.params.historyEntryId || "");
  if (!mongoose.Types.ObjectId.isValid(entryId)) {
    res.status(400).json({ msg: "Invalid history entry." });
    return null;
  }
  const entry = await WatchHistoryEntry.findById(entryId);
  if (!entry) {
    res.status(404).json({ msg: "History entry not found." });
    return null;
  }
  const userId = req.user!.id;
  if (entry.scope === "personal") {
    if (entry.createdBy.toString() !== userId) {
      res.status(403).json({ msg: `Only the owner can ${action} this history entry.` });
      return null;
    }
    return entry;
  }
  const group = await Group.findById(entry.groupId).select("members creator").lean();
  if (!group || !isGroupMember(group, userId)) {
    res.status(403).json({ msg: `Only group members can ${action} this history entry.` });
    return null;
  }
  return entry;
};

router.patch("/:historyEntryId", authenticate, async (req, res) => {
  try {
    const entry = await loadAuthorizedEntry(req, res, "edit");
    if (!entry) return;
    const watchedAt = parseDate(req.body?.watchedAt || req.body?.watchedDate);
    if (!watchedAt) {
      res.status(400).json({ msg: "Invalid watched date." });
      return;
    }
    if (entry.scope === "group" && Array.isArray(req.body?.participants || req.body?.watchedWith)) {
      const group = await Group.findById(entry.groupId).select("members").lean();
      const memberIds = new Set(group?.members.map((member) => member.toString()) || []);
      const ids = (req.body.participants || req.body.watchedWith).map(String);
      if (!ids.length || ids.some((id: string) => !mongoose.Types.ObjectId.isValid(id) || !memberIds.has(id))) {
        res.status(400).json({ msg: "Select valid group participants." });
        return;
      }
      entry.participants = ids.map((id: string) => new mongoose.Types.ObjectId(id));
    }
    entry.watchedAt = watchedAt;
    entry.watchedLocation = String(req.body?.watchedLocation || req.body?.watchedWhere || "").trim();
    entry.watchedNotes = String(req.body?.watchedNotes || "").trim();
    await entry.save();

    if (entry.legacyGroupId && entry.legacyHistoryItemId) {
      const group = await Group.findById(entry.legacyGroupId);
      const legacy = (group?.movies as any)?.id(entry.legacyHistoryItemId);
      if (group && legacy) {
        legacy.watchedAt = watchedAt;
        legacy.watchedDate = watchedAt;
        legacy.watchedLocation = entry.watchedLocation;
        legacy.watchedWhere = entry.watchedLocation;
        legacy.watchedNotes = entry.watchedNotes;
        legacy.watchedWith = entry.participants;
        await group.save();
      }
    }
    await entry.populate(POPULATE);
    if (entry.groupId) getIO().to(entry.groupId.toString()).emit("group:history_updated", { historyEntryId: entry._id.toString() });
    res.json({ msg: "History entry updated", entry: serializeHistoryEntry(entry.toObject(), req.user!.id) });
  } catch (error) {
    console.error("Error updating watch history entry:", error);
    res.status(500).json({ msg: "Failed to update watch history entry" });
  }
});

router.delete("/:historyEntryId", authenticate, async (req, res) => {
  try {
    const entry = await loadAuthorizedEntry(req, res, "delete");
    if (!entry) return;
    if (entry.legacyGroupId && entry.legacyHistoryItemId) {
      await Group.updateOne({ _id: entry.legacyGroupId }, { $pull: { movies: { _id: entry.legacyHistoryItemId } } });
    }
    await entry.deleteOne();
    if (entry.groupId) getIO().to(entry.groupId.toString()).emit("group:history_deleted", { historyEntryId: entry._id.toString() });
    res.json({ msg: "History entry deleted", historyEntryId: entry._id.toString() });
  } catch (error) {
    console.error("Error deleting watch history entry:", error);
    res.status(500).json({ msg: "Failed to delete watch history entry" });
  }
});

router.put("/:historyEntryId/rating", authenticate, async (req, res) => {
  try {
    const entry = await loadAuthorizedEntry(req, res, "rate");
    if (!entry) return;
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      res.status(400).json({ msg: "Rating must be a whole number from 1 to 10." });
      return;
    }
    const userId = req.user!.id;
    const now = new Date();
    const existing = entry.ratings.find((item) => item.userId.toString() === userId);
    if (existing) {
      existing.rating = rating;
      existing.updatedAt = now;
    } else {
      entry.ratings.push({ userId: new mongoose.Types.ObjectId(userId), rating, createdAt: now, updatedAt: now });
    }
    await entry.save();
    if (entry.legacyGroupId && entry.legacyHistoryItemId) {
      const group = await Group.findById(entry.legacyGroupId);
      const legacy = (group?.movies as any)?.id(entry.legacyHistoryItemId);
      if (group && legacy) {
        if (!Array.isArray(legacy.ratings)) legacy.ratings = [];
        const oldRating = legacy.ratings.find((item: any) => item.userId?.toString() === userId);
        if (oldRating) {
          oldRating.rating = rating;
          oldRating.updatedAt = now;
        } else {
          legacy.ratings.push({ userId, rating, createdAt: now, updatedAt: now });
        }
        await group.save();
      }
    }
    await entry.populate(POPULATE);
    const serialized = serializeHistoryEntry(entry.toObject(), userId);
    if (entry.groupId) getIO().to(entry.groupId.toString()).emit("group:history_rating_updated", { historyEntryId: entry._id.toString(), ...serialized });
    res.json({ msg: "Rating saved", entry: serialized });
  } catch (error) {
    console.error("Error rating watch history entry:", error);
    res.status(500).json({ msg: "Failed to rate watch history entry" });
  }
});

export default router;
