import express, { Request, Response } from "express";
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
    } = req.body;
    if (!groupId) {
      res.status(400).json({ msg: "groupId is required" });
      return;
    }

    const user = await User.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    const movie = await Movie.findById(req.params.movieId);
    if (!movie) {
      res.status(404).json({ msg: "Movie not found" });
      return;
    }

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
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
      };
    }) as any;

    // Add movie to group if not already there
    const alreadyInGroup = group.movies.some(
      (m: any) => (m.movieId || m).toString() === movie._id.toString()
    );
    if (!alreadyInGroup) {
      const parsedWatchedAt = watchedAt || watchedDate ? new Date(watchedAt || watchedDate) : new Date();
      const locationPayload = watchedLocation || watchedWhere || "";
      group.movies.push({
        movieId: movie._id,
        watchedDate: parsedWatchedAt,
        watchedAt: parsedWatchedAt,
        watchedWhere: locationPayload,
        watchedLocation: locationPayload,
        watchedWith: watchedWith?.length ? watchedWith : [req.user!.id],
        watchedNotes: watchedNotes || "",
      } as any);
    }
    await group.save();

    // Remove from user's watchlist
    user.watchlist = user.watchlist.filter(
      (id) => id.toString() !== req.params.movieId
    );
    await user.save();

    getIO().to(groupId).emit("group:movie_added", { movie });

    res.json({ msg: "Movie marked as watched and added to group", movie });
  } catch (err) {
    console.error("Error marking as watched:", err);
    res.status(500).json({ msg: "Failed to mark as watched" });
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
