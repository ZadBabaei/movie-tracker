import express, { Request, Response } from "express";
import mongoose from "mongoose";
import Group from "../models/Groups";
import Movie from "../models/movie";
import Poll from "../models/Poll";
import { authenticate } from "../middleware/authMiddleware";

const router = express.Router();

router.get("/mine", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const groups = await Group.find({ members: userId })
      .populate("members", "name email avatar")
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

    const invitations = members.map((memberId: string) => ({
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
      group.members.push(userId);
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
    const group = await Group.findById(groupId)
      .populate("members", "_id name profilePic")
      .populate("creator", "_id name")
      .populate("movies", "title imdbID poster vote_average")
      .populate({
        path: "currentPoll",
        populate: { path: "votes.userId", select: "name" },
      });

    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const hasActivePoll = await group.hasActivePoll();
    res.json({ ...group.toObject(), hasActivePoll });
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

    if (!group.movies.includes(existingMovie._id as any)) {
      group.movies.push(existingMovie._id as any);
      await group.save();
    }

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

    group.movies = group.movies.filter((id) => id.toString() !== movieId);
    await group.save();
    res.json({ msg: "Movie removed from group" });
  } catch (error) {
    console.error("Error removing movie:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/:id/create-poll", authenticate, async (req: Request, res: Response) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }

    const hasActivePoll = await group.hasActivePoll();
    if (hasActivePoll) {
      res.status(400).json({ msg: "Group already has an active poll" });
      return;
    }

    const poll = new Poll({
      groupId: group._id,
      creator: req.user!.id,
      movies: req.body.movies,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await poll.save();
    group.currentPoll = poll._id as any;
    if (!group.pollHistory) group.pollHistory = [];
    group.pollHistory.push(poll._id as any);
    await group.save();

    res.json(poll);
  } catch (error) {
    console.error("Error creating poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.post("/:id/complete-poll", authenticate, async (req: Request, res: Response) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      res.status(404).json({ msg: "Group not found" });
      return;
    }
    if (!group.currentPoll) {
      res.status(400).json({ msg: "No active poll found" });
      return;
    }

    const poll = await Poll.findById(group.currentPoll);
    if (!poll) {
      res.status(404).json({ msg: "Poll not found" });
      return;
    }

    poll.status = "completed";
    poll.winningMovieTmdbId = req.body.winningMovie;
    await poll.save();

    group.currentPoll = undefined;
    await group.save();

    res.json({ msg: "Poll completed successfully" });
  } catch (error) {
    console.error("Error completing poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
