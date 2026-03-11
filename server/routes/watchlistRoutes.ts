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
    const { groupId } = req.body;
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

    // Add movie to group if not already there
    if (!group.movies.includes(movie._id as any)) {
      group.movies.push(movie._id as any);
      await group.save();
    }

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

export default router;
