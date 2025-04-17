const express = require("express");
const router = express.Router();
const Poll = require("../models/Poll");
const { authenticate } = require("../middleware/authMiddleware");
const mongoose = require("mongoose");

// Create a new poll
router.post("/create", authenticate, async (req, res) => {
  try {
    const { groupId, movies } = req.body;
    const userId = req.user.id;

    // Check if there's already an active poll
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

// Get active poll for a group
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
      // Convert movies array to match the expected format
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

// Submit a vote
router.post("/vote", authenticate, async (req, res) => {
  try {
    const { pollId, movieId, rank } = req.body;
    const userId = req.user.id;

    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({ msg: "Poll not found" });
    }

    if (poll.status !== "active") {
      return res.status(400).json({ msg: "Poll is not active" });
    }

    // Remove any existing vote by this user
    poll.votes = poll.votes.filter(
      (vote) => vote.userId.toString() !== userId.toString()
    );

    // Add new vote using TMDb ID
    poll.votes.push({
      userId,
      movieTmdbId: movieId.toString(),
      rank,
    });

    await poll.save();

    // Return formatted response
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

// Cancel a poll (creator only)
router.post("/:pollId/cancel", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const poll = await Poll.findById(req.params.pollId);

    if (!poll) {
      return res.status(404).json({ msg: "Poll not found" });
    }

    // Only creator can cancel the poll
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

// Complete a poll (creator only)
router.post("/:pollId/complete", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { winningMovie } = req.body;
    const poll = await Poll.findById(req.params.pollId);

    if (!poll) {
      return res.status(404).json({ msg: "Poll not found" });
    }

    // Only creator can complete the poll
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

module.exports = router;
