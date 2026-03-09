import express, { Request, Response } from "express";
import { authenticate } from "../middleware/authMiddleware";
import Poll from "../models/Poll";
import { getIO } from "../socket";

const router = express.Router();

router.post("/create", authenticate, async (req: Request, res: Response) => {
  try {
    const { groupId, movies } = req.body;
    const userId = req.user!.id;

    const existingPoll = await Poll.findOne({ groupId, status: "active" });
    if (existingPoll) {
      res.status(400).json({ msg: "An active poll already exists for this group" });
      return;
    }

    const poll = new Poll({
      groupId,
      creator: userId,
      movies: movies.map((movie: any) => ({
        tmdbId: movie.id.toString(),
        title: movie.title,
        poster_path: movie.poster_path,
        vote_average: movie.vote_average,
      })),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await poll.save();
    res.json(poll);
  } catch (error) {
    console.error("Error creating poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/group/:groupId/active", authenticate, async (req: Request, res: Response) => {
  try {
    const poll = await Poll.findOne({
      groupId: req.params.groupId,
      status: "active",
    })
      .populate("votes.userId", "name")
      .populate("creator", "name")
      .lean();

    if (poll) {
      (poll as any).movies = poll.movies.map((movie) => ({
        id: movie.tmdbId,
        movieId: movie.tmdbId,
        title: movie.title,
        poster_path: movie.poster_path,
        vote_average: movie.vote_average,
      }));
    }

    res.json(poll);
  } catch (error) {
    console.error("Error fetching active poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.post("/vote", authenticate, async (req: Request, res: Response) => {
  try {
    const { pollId, movieId, rank } = req.body;
    const userId = req.user!.id;

    const poll = await Poll.findById(pollId);
    if (!poll) {
      res.status(404).json({ msg: "Poll not found" });
      return;
    }
    if (poll.status !== "active") {
      res.status(400).json({ msg: "Poll is not active" });
      return;
    }

    poll.votes = poll.votes.filter(
      (vote) =>
        !(
          vote.userId.toString() === userId.toString() &&
          vote.movieTmdbId === movieId.toString()
        )
    );

    poll.votes.push({ userId: userId as any, movieTmdbId: movieId.toString(), rank });
    await poll.save();

    const populatedPoll = await Poll.findById(pollId)
      .populate("votes.userId", "name")
      .populate("creator", "name")
      .lean();

    if (populatedPoll) {
      (populatedPoll as any).movies = populatedPoll.movies.map((movie) => ({
        id: movie.tmdbId,
        movieId: movie.tmdbId,
        title: movie.title,
        poster_path: movie.poster_path,
        vote_average: movie.vote_average,
      }));
    }

    if (populatedPoll) {
      getIO().to(populatedPoll.groupId.toString()).emit("poll:updated", populatedPoll);
    }
    res.json(populatedPoll);
  } catch (error) {
    console.error("Error submitting vote:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.post("/:pollId/cancel", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const poll = await Poll.findById(req.params.pollId);
    if (!poll) {
      res.status(404).json({ msg: "Poll not found" });
      return;
    }
    if (poll.creator.toString() !== userId) {
      res.status(403).json({ msg: "Only poll creator can cancel the poll" });
      return;
    }
    if (poll.status !== "active") {
      res.status(400).json({ msg: "Poll is not active" });
      return;
    }

    poll.status = "cancelled";
    await poll.save();
    res.json({ msg: "Poll cancelled successfully", poll });
  } catch (error) {
    console.error("Error cancelling poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.post("/:pollId/complete", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { winningMovie } = req.body;
    const poll = await Poll.findById(req.params.pollId);
    if (!poll) {
      res.status(404).json({ msg: "Poll not found" });
      return;
    }
    if (poll.creator.toString() !== userId) {
      res.status(403).json({ msg: "Only poll creator can complete the poll" });
      return;
    }
    if (poll.status !== "active") {
      res.status(400).json({ msg: "Poll is not active" });
      return;
    }

    poll.status = "completed";
    poll.winningMovieTmdbId = winningMovie.toString();
    await poll.save();
    res.json(poll);
  } catch (error) {
    console.error("Error completing poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.post("/:pollId/add-movie", authenticate, async (req: Request, res: Response) => {
  try {
    const { movie } = req.body;
    const poll = await Poll.findById(req.params.pollId);
    if (!poll) {
      res.status(404).json({ msg: "Poll not found" });
      return;
    }

    const alreadyExists = poll.movies.some((m) => m.tmdbId === movie.id.toString());
    if (alreadyExists) {
      res.json(poll);
      return;
    }

    poll.movies.push({
      tmdbId: movie.id.toString(),
      title: movie.title,
      poster_path: movie.poster_path,
      vote_average: movie.vote_average,
    });

    await poll.save();
    res.json(poll);
  } catch (error) {
    console.error("Error adding movie to poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
