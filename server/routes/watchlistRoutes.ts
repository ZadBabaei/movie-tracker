import express, { Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/user";
import Movie from "../models/movie";
import Group from "../models/Groups";
import { authenticate } from "../middleware/authMiddleware";
import { getIO } from "../socket";

const router = express.Router();

// GET /api/watchlist — fetch user's watchlist
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.id).populate("watchlist");
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }
    res.json(user.watchlist);
  } catch (err) {
    console.error("Error fetching watchlist:", err);
    res.status(500).json({ msg: "Failed to fetch watchlist" });
  }
});

// POST /api/watchlist — add movie to watchlist
router.post("/", authenticate, async (req: Request, res: Response) => {
  try {
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
        addedBy: req.user!.id,
      });
      await existingMovie.save();
    }

    const user = await User.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    if (!user.watchlist.some((id) => id.toString() === existingMovie!._id.toString())) {
      user.watchlist.push(existingMovie._id as any);
      await user.save();
    }

    res.json({ msg: "Movie added to watchlist", movie: existingMovie });
  } catch (err) {
    console.error("Error adding to watchlist:", err);
    res.status(500).json({ msg: "Failed to add to watchlist" });
  }
});

// DELETE /api/watchlist/:movieId — remove movie from watchlist
router.delete("/:movieId", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    user.watchlist = user.watchlist.filter(
      (id) => id.toString() !== req.params.movieId
    );
    await user.save();

    res.json({ msg: "Movie removed from watchlist" });
  } catch (err) {
    console.error("Error removing from watchlist:", err);
    res.status(500).json({ msg: "Failed to remove from watchlist" });
  }
});

// POST /api/watchlist/:movieId/mark-watched — move to group's watched list
router.post("/:movieId/mark-watched", authenticate, async (req: Request, res: Response) => {
  try {
    const {
      groupId,
      watchedAt,
      watchedDate,
      watchedLocation,
      watchedWhere,
      watchedWith,
      watchedNotes,
      source,
    } = req.body;
    if (!groupId) {
      res.status(400).json({ msg: "groupId is required" });
      return;
    }
    const groupIdValue = String(groupId);
    const movieId = String(req.params.movieId);
    if (!mongoose.Types.ObjectId.isValid(groupIdValue) || !mongoose.Types.ObjectId.isValid(movieId)) {
      res.status(400).json({ msg: "Invalid group or movie id." });
      return;
    }

    const user = await User.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    const movie = await Movie.findById(movieId);
    if (!movie) {
      res.status(404).json({ msg: "Movie not found" });
      return;
    }

    const group = await Group.findById(groupIdValue);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const userId = req.user!.id;
    const groupMemberIds = new Set(group.members.map((memberId) => memberId.toString()));
    if (!groupMemberIds.has(userId)) {
      res.status(403).json({ msg: "Only group members can add watched movies." });
      return;
    }

    const parsedWatchedAt = watchedAt || watchedDate ? new Date(watchedAt || watchedDate) : new Date();
    if (Number.isNaN(parsedWatchedAt.getTime())) {
      res.status(400).json({ msg: "Invalid watched date." });
      return;
    }

    const watchedWithIds = Array.isArray(watchedWith) ? watchedWith : [];
    const hasInvalidWatchedWith = watchedWithIds.some(
      (memberId: string) => !mongoose.Types.ObjectId.isValid(memberId) || !groupMemberIds.has(memberId)
    );
    if (hasInvalidWatchedWith) {
      res.status(400).json({ msg: "watchedWith can only include group members." });
      return;
    }

    // Migrate old plain-ObjectId entries to subdocument format
    group.movies = group.movies.map((m: any) => {
      if (m.movieId) return m;
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

    // Add movie to group if not already there
    const alreadyInGroup = group.movies.some(
      (m: any) => (m.movieId || m).toString() === movie._id.toString()
    );
    if (!alreadyInGroup) {
      const locationPayload = String(watchedLocation ?? watchedWhere ?? "").trim();

      group.movies.push({
        movieId: movie._id,
        watchedDate: parsedWatchedAt,
        watchedAt: parsedWatchedAt,
        watchedWhere: locationPayload,
        watchedLocation: locationPayload,
        watchedWith: watchedWithIds.length ? watchedWithIds : [userId],
        watchedNotes: String(watchedNotes ?? "").trim(),
        ratings: [],
      } as any);
    }
    await group.save();

    if (source === "group") {
      // Remove from this group's shared watchlist
      group.watchlist = group.watchlist.filter(
        (item) => item.movieId.toString() !== movieId
      );
      await group.save();
      getIO().to(groupIdValue).emit("group:watchlist_updated", { groupId: groupIdValue });
    } else {
      // Remove from user's personal watchlist
      user.watchlist = user.watchlist.filter(
        (id) => id.toString() !== movieId
      );
      await user.save();
    }

    getIO().to(groupIdValue).emit("group:movie_added", { movie });

    res.json({ msg: "Movie marked as watched and added to group", movie });
  } catch (err) {
    console.error("Error marking as watched:", err);
    res.status(500).json({ msg: "Failed to mark as watched" });
  }
});

// GET /api/watchlist/group/:groupId — fetch a group's shared watchlist
router.get("/group/:groupId", authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = String(req.params.groupId);
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      res.status(400).json({ msg: "Invalid group id." });
      return;
    }

    const group = await Group.findById(groupId)
      .populate("watchlist.movieId")
      .populate("watchlist.addedBy", "name avatar");
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const userId = req.user!.id;
    const groupMemberIds = new Set(group.members.map((memberId) => memberId.toString()));
    if (!groupMemberIds.has(userId)) {
      res.status(403).json({ msg: "Only group members can view this watchlist." });
      return;
    }

    const items = (group.watchlist || [])
      .filter((item: any) => item.movieId && item.movieId._id)
      .map((item: any) => {
        const movie = item.movieId;
        const addedBy = item.addedBy;
        return {
          _id: movie._id,
          title: movie.title,
          imdbID: movie.imdbID,
          poster: movie.poster,
          vote_average: movie.vote_average,
          addedAt: item.addedAt,
          addedBy: addedBy
            ? { _id: addedBy._id, name: addedBy.name, avatar: addedBy.avatar }
            : undefined,
        };
      });

    res.json(items);
  } catch (err) {
    console.error("Error fetching group watchlist:", err);
    res.status(500).json({ msg: "Failed to fetch group watchlist" });
  }
});

// POST /api/watchlist/group/:groupId — add movie to a group's shared watchlist
router.post("/group/:groupId", authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = String(req.params.groupId);
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      res.status(400).json({ msg: "Invalid group id." });
      return;
    }

    const { movie } = req.body;
    if (!movie || !movie.imdbID || !movie.title) {
      res.status(400).json({ msg: "Invalid movie data" });
      return;
    }

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const userId = req.user!.id;
    const groupMemberIds = new Set(group.members.map((memberId) => memberId.toString()));
    if (!groupMemberIds.has(userId)) {
      res.status(403).json({ msg: "Only group members can add to this watchlist." });
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

    const existingItem = group.watchlist.find(
      (item) => item.movieId.toString() === existingMovie!._id.toString()
    );

    let addedAt = existingItem?.addedAt || new Date();
    let addedById = existingItem?.addedBy?.toString() || userId;

    if (!existingItem) {
      group.watchlist.push({
        movieId: existingMovie._id as any,
        addedBy: userId as any,
        addedAt,
      } as any);
      await group.save();
      getIO().to(groupId).emit("group:watchlist_updated", { groupId });
    }

    const addedByUser = await User.findById(addedById).select("name avatar");

    res.json({
      msg: "Movie added to group watchlist",
      movie: {
        _id: existingMovie._id,
        title: existingMovie.title,
        imdbID: existingMovie.imdbID,
        poster: existingMovie.poster,
        vote_average: existingMovie.vote_average,
        addedAt,
        addedBy: addedByUser
          ? { _id: addedByUser._id, name: addedByUser.name, avatar: addedByUser.avatar }
          : undefined,
      },
    });
  } catch (err) {
    console.error("Error adding to group watchlist:", err);
    res.status(500).json({ msg: "Failed to add to group watchlist" });
  }
});

// DELETE /api/watchlist/group/:groupId/:movieId — remove movie from a group's shared watchlist
router.delete("/group/:groupId/:movieId", authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = String(req.params.groupId);
    const movieId = String(req.params.movieId);
    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(movieId)) {
      res.status(400).json({ msg: "Invalid group or movie id." });
      return;
    }

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const userId = req.user!.id;
    const groupMemberIds = new Set(group.members.map((memberId) => memberId.toString()));
    if (!groupMemberIds.has(userId)) {
      res.status(403).json({ msg: "Only group members can remove from this watchlist." });
      return;
    }

    group.watchlist = group.watchlist.filter(
      (item) => item.movieId.toString() !== movieId
    );
    await group.save();

    getIO().to(groupId).emit("group:watchlist_updated", { groupId });

    res.json({ msg: "Movie removed from group watchlist" });
  } catch (err) {
    console.error("Error removing from group watchlist:", err);
    res.status(500).json({ msg: "Failed to remove from group watchlist" });
  }
});

// GET /api/watchlist/favorites — fetch user's favorites
router.get("/favorites", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.id).populate("favorites");
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }
    res.json(user.favorites);
  } catch (err) {
    console.error("Error fetching favorites:", err);
    res.status(500).json({ msg: "Failed to fetch favorites" });
  }
});

// GET /api/watchlist/favorites/group/:groupId — aggregate favorites of every group member
router.get("/favorites/group/:groupId", authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = String(req.params.groupId);
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      res.status(400).json({ msg: "Invalid group id." });
      return;
    }

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const userId = req.user!.id;
    const groupMemberIds = new Set(group.members.map((memberId) => memberId.toString()));
    if (!groupMemberIds.has(userId)) {
      res.status(403).json({ msg: "Only group members can view this group's favorites." });
      return;
    }

    const members = await User.find({ _id: { $in: group.members } })
      .populate("favorites")
      .select("name avatar favorites");

    const aggregated = new Map<string, any>();

    for (const member of members) {
      const memberInfo = { _id: member._id, name: member.name, avatar: member.avatar };
      for (const movie of member.favorites as any[]) {
        if (!movie || !movie._id) continue;
        const key = movie._id.toString();
        const existing = aggregated.get(key);
        if (existing) {
          existing.lovedBy.push(memberInfo);
        } else {
          aggregated.set(key, {
            _id: movie._id,
            title: movie.title,
            imdbID: movie.imdbID,
            poster: movie.poster,
            vote_average: movie.vote_average,
            lovedBy: [memberInfo],
          });
        }
      }
    }

    const result = Array.from(aggregated.values()).sort((a, b) => {
      if (b.lovedBy.length !== a.lovedBy.length) return b.lovedBy.length - a.lovedBy.length;
      return String(a.title).localeCompare(String(b.title));
    });

    res.json(result);
  } catch (err) {
    console.error("Error fetching group favorites:", err);
    res.status(500).json({ msg: "Failed to fetch group favorites" });
  }
});

// POST /api/watchlist/favorites/:movieId — toggle favorite
router.post("/favorites/:movieId", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    const movieId = req.params.movieId;
    const isFav = user.favorites.some((id) => id.toString() === movieId);

    if (isFav) {
      user.favorites = user.favorites.filter((id) => id.toString() !== movieId) as any;
    } else {
      user.favorites.push(movieId as any);
    }

    await user.save();
    res.json({ favorited: !isFav });
  } catch (err) {
    console.error("Error toggling favorite:", err);
    res.status(500).json({ msg: "Failed to toggle favorite" });
  }
});

export default router;
