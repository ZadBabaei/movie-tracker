const express = require("express");
const router = express.Router();
const Poll = require("../models/Poll");
const { authenticate } = require("../middleware/authMiddleware");
const mongoose = require("mongoose");


router.post("/create", authenticate, async (req, res) => {
  try {
    const { groupId, movies } = req.body;
    const userId = req.user.id;

   
    const existingPoll = await Poll.findOne({
      groupId,
      status: "active",
    });

    if (existingPoll) {
      return res.status(400).json({
        msg: "An active poll already exists for this group",
      });
    }

    const poll = new Poll({
      groupId,
      creator: userId,
      movies: movies.map((movie) => ({
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


router.get("/group/:groupId/active", authenticate, async (req, res) => {
  try {
    const poll = await Poll.findOne({
      groupId: req.params.groupId,
      status: "active",
    })
      .populate("votes.userId", "name")
      .populate("creator", "name")
      .lean();

    if (poll) {
    
      poll.movies = poll.movies.map((movie) => ({
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


router.post("/vote", authenticate, async (req, res) => {
  try {
    const { pollId, movieId, rank } = req.body;
    const userId = req.user.id;
console.log("Incoming vote:", { pollId, movieId, rank, userId });

    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({ msg: "Poll not found" });
    }

    if (poll.status !== "active") {
      return res.status(400).json({ msg: "Poll is not active" });
    }

 poll.votes = poll.votes.filter(
   (vote) =>
     !(
       vote.userId.toString() === userId.toString() &&
       vote.movieTmdbId === movieId.toString()
     )
 );

    
    poll.votes.push({
      userId,
      movieTmdbId: movieId.toString(),
      rank,
    });

    await poll.save();

    const populatedPoll = await Poll.findById(pollId)
      .populate("votes.userId", "name")
      .populate("creator", "name")
      .lean();

    if (populatedPoll) {
      populatedPoll.movies = populatedPoll.movies.map((movie) => ({
        id: movie.tmdbId,
        movieId: movie.tmdbId,
        title: movie.title,
        poster_path: movie.poster_path,
        vote_average: movie.vote_average,
      }));
    }

    res.json(populatedPoll);
  } catch (error) {
    console.error("Error submitting vote:", error);
    res.status(500).json({ msg: "Server error" });
  }
});


router.post("/:pollId/cancel", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const poll = await Poll.findById(req.params.pollId);

    if (!poll) {
      return res.status(404).json({ msg: "Poll not found" });
    }

    
    if (poll.creator.toString() !== userId) {
      return res
        .status(403)
        .json({ msg: "Only poll creator can cancel the poll" });
    }

    if (poll.status !== "active") {
      return res.status(400).json({ msg: "Poll is not active" });
    }

    poll.status = "cancelled";
    await poll.save();

    res.json({ msg: "Poll cancelled successfully", poll });
  } catch (error) {
    console.error("Error cancelling poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});


router.post("/:pollId/complete", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { winningMovie } = req.body;
    const poll = await Poll.findById(req.params.pollId);

    if (!poll) {
      return res.status(404).json({ msg: "Poll not found" });
    }


    if (poll.creator.toString() !== userId) {
      return res
        .status(403)
        .json({ msg: "Only poll creator can complete the poll" });
    }

    if (poll.status !== "active") {
      return res.status(400).json({ msg: "Poll is not active" });
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
router.post("/:pollId/add-movie", authenticate, async (req, res) => {
  try {
    const { movie } = req.body;
    const poll = await Poll.findById(req.params.pollId);
    if (!poll) return res.status(404).json({ msg: "Poll not found" });

    
    const alreadyExists = poll.movies.some(
      (m) => m.tmdbId === movie.id.toString()
    );
    if (alreadyExists) return res.json(poll); 

    poll.movies.push({
      tmdbId: movie.id.toString(),
      title: movie.title,
      poster_path: movie.poster_path,
      vote_average: movie.vote_average,
    });

    await poll.save();
    res.json(poll);
  } catch (err) {
    console.error("Error adding movie to poll:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
