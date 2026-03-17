import express, { Request, Response } from "express";
import { authenticate } from "../middleware/authMiddleware";
import Poll from "../models/Poll";
import Group from "../models/Groups";
import { getIO } from "../socket";

const router = express.Router();

// ── Create a new poll ────────────────────────────────────────────────────────
router.post("/create", authenticate, async (req: Request, res: Response) => {
  try {
    const { groupId, movies, name } = req.body;
    const userId = req.user!.id;

    if (!name || !name.trim()) {
      res.status(400).json({ msg: "Poll name is required" });
      return;
    }

    const existingPoll = await Poll.findOne({ groupId, status: "active" });
    if (existingPoll) {
      res.status(400).json({ msg: "An active poll already exists for this group" });
      return;
    }

    const poll = new Poll({
      name: name.trim(),
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

    // Update Group: set currentPoll and push to pollHistory
    await Group.findByIdAndUpdate(groupId, {
      currentPoll: poll._id,
      $push: { pollHistory: poll._id },
    });

    // Map movies to include id/movieId fields (consistent with active poll endpoint)
    const pollObj = poll.toObject();
    pollObj.movies = pollObj.movies.map((movie: any) => ({
      ...movie,
      id: movie.tmdbId,
      movieId: movie.tmdbId,
    }));

    res.json(pollObj);
  } catch (error) {
    console.error("Error creating poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── Get active poll for a group ──────────────────────────────────────────────
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

// ── Submit/update a vote (multi-select, no ranks) ────────────────────────────
router.post("/vote", authenticate, async (req: Request, res: Response) => {
  try {
    const { pollId, movieIds } = req.body;
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

    // Remove all existing votes by this user
    poll.votes = poll.votes.filter(
      (vote) => vote.userId.toString() !== userId.toString()
    );

    // Add one vote entry per selected movie
    if (Array.isArray(movieIds)) {
      movieIds.forEach((movieId: string) => {
        poll.votes.push({ userId: userId as any, movieTmdbId: movieId.toString() });
      });
    }

    await poll.save();

    // ── Auto-complete: check if all group members have voted ──
    const group = await Group.findById(poll.groupId);
    if (group) {
      const uniqueVoters = new Set(poll.votes.map((v) => v.userId.toString()));
      if (uniqueVoters.size >= group.members.length) {
        // All members voted — auto-complete the poll
        const scoreMap: Record<string, number> = {};
        poll.movies.forEach((m) => { scoreMap[m.tmdbId] = 0; });
        poll.votes.forEach((vote) => {
          scoreMap[vote.movieTmdbId] = (scoreMap[vote.movieTmdbId] || 0) + 1;
        });

        const maxScore = Math.max(...Object.values(scoreMap), 0);
        const tiedMovies = poll.movies.filter((m) => (scoreMap[m.tmdbId] || 0) === maxScore);

        if (tiedMovies.length > 1 && maxScore > 0) {
          if ((poll.round || 1) >= 2) {
            // Round 2+ tie → random winner
            const randomWinner = tiedMovies[Math.floor(Math.random() * tiedMovies.length)];
            poll.status = "completed";
            poll.winningMovieTmdbId = randomWinner.tmdbId;
            await poll.save();
            await Group.findByIdAndUpdate(poll.groupId, { $unset: { currentPoll: 1 } });

            const completedPoll = await Poll.findById(pollId)
              .populate("votes.userId", "name")
              .populate("creator", "name")
              .lean();
            if (completedPoll) {
              (completedPoll as any).movies = completedPoll.movies.map((movie) => ({
                id: movie.tmdbId, movieId: movie.tmdbId,
                title: movie.title, poster_path: movie.poster_path, vote_average: movie.vote_average,
              }));
            }

            getIO().to(poll.groupId.toString()).emit("poll:completed", {
              pollId: poll._id.toString(),
              winningMovieTmdbId: randomWinner.tmdbId,
              winnerTitle: randomWinner.title,
              winnerPoster: randomWinner.poster_path || "",
            });

            res.json({ autoCompleted: true, poll: completedPoll });
            return;
          } else {
            // Round 1 tie → runoff
            poll.movies = tiedMovies as any;
            poll.votes = [];
            poll.round = (poll.round || 1) + 1;
            await poll.save();

            const runoffPoll = await Poll.findById(pollId)
              .populate("votes.userId", "name")
              .populate("creator", "name")
              .lean();
            if (runoffPoll) {
              (runoffPoll as any).movies = runoffPoll.movies.map((movie) => ({
                id: movie.tmdbId, movieId: movie.tmdbId,
                title: movie.title, poster_path: movie.poster_path, vote_average: movie.vote_average,
              }));
            }

            getIO().to(poll.groupId.toString()).emit("poll:runoff", {
              pollId: poll._id.toString(),
              round: poll.round,
              poll: runoffPoll,
            });

            res.json({ autoCompleted: true, runoff: true, poll: runoffPoll });
            return;
          }
        } else {
          // Clear winner — auto-complete
          const winningMovieId = tiedMovies[0]?.tmdbId || poll.movies[0]?.tmdbId || "";
          poll.status = "completed";
          poll.winningMovieTmdbId = winningMovieId;
          await poll.save();
          await Group.findByIdAndUpdate(poll.groupId, { $unset: { currentPoll: 1 } });

          const completedPoll = await Poll.findById(pollId)
            .populate("votes.userId", "name")
            .populate("creator", "name")
            .lean();
          if (completedPoll) {
            (completedPoll as any).movies = completedPoll.movies.map((movie) => ({
              id: movie.tmdbId, movieId: movie.tmdbId,
              title: movie.title, poster_path: movie.poster_path, vote_average: movie.vote_average,
            }));
          }

          const winnerMovie = poll.movies.find((m) => m.tmdbId === winningMovieId);
          getIO().to(poll.groupId.toString()).emit("poll:completed", {
            pollId: poll._id.toString(),
            winningMovieTmdbId: winningMovieId,
            winnerTitle: winnerMovie?.title || "",
            winnerPoster: winnerMovie?.poster_path || "",
          });

          res.json({ autoCompleted: true, poll: completedPoll });
          return;
        }
      }
    }

    // ── Normal vote update (not all members voted yet) ──
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

// ── Cancel a poll ────────────────────────────────────────────────────────────
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

    // Clear currentPoll on the group
    await Group.findByIdAndUpdate(poll.groupId, { $unset: { currentPoll: 1 } });

    res.json({ msg: "Poll cancelled successfully", poll });
  } catch (error) {
    console.error("Error cancelling poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── Complete a poll (with tie-breaking runoff) ───────────────────────────────
router.post("/:pollId/complete", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
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

    // Count-based scoring: each vote entry = 1 point
    const scoreMap: Record<string, number> = {};
    poll.movies.forEach((m) => { scoreMap[m.tmdbId] = 0; });
    poll.votes.forEach((vote) => {
      const mid = vote.movieTmdbId;
      scoreMap[mid] = (scoreMap[mid] || 0) + 1;
    });

    const maxScore = Math.max(...Object.values(scoreMap), 0);
    const tiedMovies = poll.movies.filter((m) => (scoreMap[m.tmdbId] || 0) === maxScore);

    // Tie-breaking
    if (tiedMovies.length > 1 && maxScore > 0) {
      if ((poll.round || 1) >= 2) {
        // Round 2+ tie → random winner
        const randomWinner = tiedMovies[Math.floor(Math.random() * tiedMovies.length)];
        poll.status = "completed";
        poll.winningMovieTmdbId = randomWinner.tmdbId;
        await poll.save();
        await Group.findByIdAndUpdate(poll.groupId, { $unset: { currentPoll: 1 } });

        const winnerMovie = randomWinner;
        getIO().to(poll.groupId.toString()).emit("poll:completed", {
          pollId: poll._id.toString(),
          winningMovieTmdbId: randomWinner.tmdbId,
          winnerTitle: winnerMovie.title,
          winnerPoster: winnerMovie.poster_path || "",
        });

        res.json(poll);
        return;
      }

      // Round 1 tie → runoff
      poll.movies = tiedMovies as any;
      poll.votes = [];
      poll.round = (poll.round || 1) + 1;
      await poll.save();

      const populatedPoll = await Poll.findById(poll._id)
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

      getIO().to(poll.groupId.toString()).emit("poll:runoff", {
        pollId: poll._id.toString(),
        round: poll.round,
        poll: populatedPoll,
      });

      res.json({ runoff: true, poll: populatedPoll });
      return;
    }

    // Single winner
    const winningMovieId = tiedMovies[0]?.tmdbId || poll.movies[0]?.tmdbId || "";
    poll.status = "completed";
    poll.winningMovieTmdbId = winningMovieId;
    await poll.save();

    // Clear currentPoll on the group
    await Group.findByIdAndUpdate(poll.groupId, { $unset: { currentPoll: 1 } });

    const winnerMovie = poll.movies.find((m) => m.tmdbId === winningMovieId);
    getIO().to(poll.groupId.toString()).emit("poll:completed", {
      pollId: poll._id.toString(),
      winningMovieTmdbId: winningMovieId,
      winnerTitle: winnerMovie?.title || "",
      winnerPoster: winnerMovie?.poster_path || "",
    });

    res.json(poll);
  } catch (error) {
    console.error("Error completing poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── Add movie to an active poll ──────────────────────────────────────────────
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

// ── Get poll results ─────────────────────────────────────────────────────────
router.get("/:pollId/results", authenticate, async (req: Request, res: Response) => {
  try {
    const poll = await Poll.findById(req.params.pollId)
      .populate("votes.userId", "name")
      .lean();
    if (!poll) {
      res.status(404).json({ msg: "Poll not found" });
      return;
    }

    // Count-based scoring
    const scoreMap: Record<string, number> = {};
    poll.votes.forEach((vote) => {
      const mid = vote.movieTmdbId;
      scoreMap[mid] = (scoreMap[mid] || 0) + 1;
    });

    const rankedMovies = poll.movies
      .map((m) => ({
        id: m.tmdbId,
        movieId: m.tmdbId,
        title: m.title,
        poster_path: m.poster_path,
        vote_average: m.vote_average,
        score: scoreMap[m.tmdbId] || 0,
      }))
      .sort((a, b) => b.score - a.score);

    res.json({ ...poll, movies: rankedMovies, winningMovieTmdbId: poll.winningMovieTmdbId });
  } catch (error) {
    console.error("Error fetching poll results:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── Get poll history for a group ─────────────────────────────────────────────
router.get("/group/:groupId/history", authenticate, async (req: Request, res: Response) => {
  try {
    const polls = await Poll.find({
      groupId: req.params.groupId,
      status: { $in: ["completed", "cancelled"] },
    })
      .sort({ createdAt: -1 })
      .populate("creator", "name")
      .lean();

    const history = polls.map((poll) => {
      const winnerMovie = poll.movies.find((m) => m.tmdbId === poll.winningMovieTmdbId);
      return {
        _id: poll._id,
        name: poll.name,
        round: poll.round,
        status: poll.status,
        winningMovieTmdbId: poll.winningMovieTmdbId,
        winnerTitle: winnerMovie?.title || null,
        winnerPoster: winnerMovie?.poster_path || null,
        createdAt: poll.createdAt,
        creator: poll.creator,
      };
    });

    res.json(history);
  } catch (error) {
    console.error("Error fetching poll history:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// ── Delete a poll ────────────────────────────────────────────────────────────
router.delete("/:pollId", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const poll = await Poll.findById(req.params.pollId);
    if (!poll) {
      res.status(404).json({ msg: "Poll not found" });
      return;
    }

    // Auth: only poll creator or group admin can delete
    const group = await Group.findById(poll.groupId);
    const isPollCreator = poll.creator.toString() === userId;
    const isGroupAdmin = group?.creator.toString() === userId;

    if (!isPollCreator && !isGroupAdmin) {
      res.status(403).json({ msg: "Only poll creator or group admin can delete this poll" });
      return;
    }

    // If deleting an active poll, clear currentPoll on group
    if (poll.status === "active" && group) {
      group.currentPoll = undefined;
      await group.save();
    }

    // Remove from pollHistory
    if (group) {
      await Group.findByIdAndUpdate(poll.groupId, {
        $pull: { pollHistory: poll._id },
      });
    }

    await Poll.findByIdAndDelete(req.params.pollId);
    res.json({ msg: "Poll deleted successfully" });
  } catch (error) {
    console.error("Error deleting poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
