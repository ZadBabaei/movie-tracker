import express, { Request, Response } from "express";
import { authenticate } from "../middleware/authMiddleware";
import Poll from "../models/Poll";
import Group from "../models/Groups";
import { getIO } from "../socket";

const router = express.Router();

// Finished polls stay visible in group history for this many days before
// the TTL index removes them.
const POLL_HISTORY_WINDOW_DAYS = 30;

const pollRetentionDate = () =>
  new Date(Date.now() + POLL_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

interface RankingPayload {
  movieTmdbId: string;
  rank: number;
}

interface CompletePollResult {
  poll: any;
  runoff?: boolean;
}

const normalizeMovie = (movie: any) => {
  const tmdbId = (movie.tmdbId ?? movie.movieId ?? movie.id ?? "").toString();
  return {
    tmdbId,
    title: movie.title,
    poster_path: movie.poster_path,
    vote_average: movie.vote_average,
  };
};

const decoratePoll = (poll: any) => {
  if (!poll) return poll;
  poll.movies = (poll.movies || []).map((movie: any) => ({
    ...movie,
    id: movie.tmdbId,
    movieId: movie.tmdbId,
  }));
  return poll;
};

const getVoterId = (vote: any) => {
  const userId = vote.userId;
  return (typeof userId === "object" ? userId._id : userId)?.toString();
};

const withVotingProgress = async (poll: any, currentUserId?: string) => {
  if (!poll) return poll;
  const group = await Group.findById(poll.groupId).populate("members", "_id name avatar").lean();
  const members = (group?.members || []).map((member: any) => ({
    _id: member._id.toString(),
    name: member.name || "Unknown",
    avatar: member.avatar,
  }));
  const votedIds = new Set((poll.votes || []).map(getVoterId).filter(Boolean));
  const votedMembers = members.filter((member) => votedIds.has(member._id));
  const pendingMembers = members.filter((member) => !votedIds.has(member._id));

  return {
    ...poll,
    totalMembers: members.length,
    votedMembers,
    pendingMembers,
    hasCurrentUserVoted: currentUserId ? votedIds.has(currentUserId.toString()) : false,
  };
};

const getPopulatedPoll = async (pollId: any, currentUserId?: string) => {
  const poll = await Poll.findById(pollId)
    .populate("votes.userId", "name")
    .populate("creator", "name")
    .lean();
  return withVotingProgress(decoratePoll(poll), currentUserId);
};

const validateRankings = (poll: any, rankings: RankingPayload[]): string | null => {
  if (!Array.isArray(rankings) || rankings.length === 0) {
    return "Rankings are required";
  }

  const pollMovieIds = poll.movies.map((m: any) => m.tmdbId.toString());
  const pollMovieIdSet = new Set(pollMovieIds);
  const submittedMovieIds = rankings.map((r) => (r.movieTmdbId ?? "").toString());
  const submittedMovieIdSet = new Set(submittedMovieIds);

  if (submittedMovieIdSet.size !== submittedMovieIds.length) {
    return "A movie cannot be ranked twice";
  }
  if (submittedMovieIds.some((movieId) => !pollMovieIdSet.has(movieId))) {
    return "Cannot vote for movies that are not in this poll";
  }

  const ranks = rankings.map((r) => Number(r.rank));
  if (ranks.some((rank) => !Number.isInteger(rank))) {
    return "Ranks must be whole numbers";
  }

  const isRunoff = (poll.round || 1) > 1;
  if (isRunoff) {
    if (rankings.length !== 1 || ranks[0] !== 1) {
      return "Runoff voting requires choosing one #1 movie";
    }
    return null;
  }

  const movieCount = poll.movies.length;
  if (rankings.length !== movieCount || submittedMovieIdSet.size !== movieCount) {
    return "Rankings must include every movie in the poll";
  }

  const rankSet = new Set(ranks);
  if (rankSet.size !== movieCount) {
    return "Ranks must be unique";
  }
  if (ranks.some((rank) => rank < 1 || rank > movieCount)) {
    return `Ranks must be between 1 and ${movieCount}`;
  }

  return null;
};

const rankedScores = (poll: any) => {
  const scoreMap: Record<string, number> = {};
  poll.movies.forEach((movie: any) => {
    scoreMap[movie.tmdbId] = 0;
  });

  poll.votes.forEach((vote: any) => {
    (vote.rankings || []).forEach((ranking: any) => {
      if (scoreMap[ranking.movieTmdbId] !== undefined) {
        scoreMap[ranking.movieTmdbId] += Number(ranking.rank);
      }
    });
  });

  return scoreMap;
};

const runoffCounts = (poll: any) => {
  const countMap: Record<string, number> = {};
  poll.movies.forEach((movie: any) => {
    countMap[movie.tmdbId] = 0;
  });

  poll.votes.forEach((vote: any) => {
    const firstChoice = (vote.rankings || []).find((ranking: any) => Number(ranking.rank) === 1);
    if (firstChoice && countMap[firstChoice.movieTmdbId] !== undefined) {
      countMap[firstChoice.movieTmdbId] += 1;
    }
  });

  return countMap;
};

const resultMovies = (poll: any, scoreMap: Record<string, number>) =>
  poll.movies.map((movie: any) => ({
    movieTmdbId: movie.tmdbId,
    title: movie.title,
    score: scoreMap[movie.tmdbId] || 0,
  }));

const cancelPollWithoutWinner = async (poll: any) => {
  poll.status = "cancelled";
  poll.expiresAt = pollRetentionDate();
  poll.result = {
    mode: poll.round > 1 ? "runoff" : "ranked",
    lowestScoreWins: poll.round <= 1,
    randomTieBreak: false,
    movies: [],
  };
  await poll.save();
  await Group.findByIdAndUpdate(poll.groupId, { $unset: { currentPoll: 1 } });
  getIO().to(poll.groupId.toString()).emit("poll:cancelled", {
    pollId: poll._id.toString(),
    reason: "No votes were submitted.",
  });
  return { poll: await getPopulatedPoll(poll._id) };
};

const completeOrRunoff = async (poll: any, currentUserId?: string): Promise<CompletePollResult> => {
  if (!poll.votes.length) {
    return cancelPollWithoutWinner(poll);
  }

  const isRunoff = (poll.round || 1) > 1;

  if (isRunoff) {
    const scoreMap = runoffCounts(poll);
    const maxScore = Math.max(...Object.values(scoreMap));
    let winners = poll.movies.filter((movie: any) => (scoreMap[movie.tmdbId] || 0) === maxScore);
    const randomTieBreak = winners.length > 1;

    if (randomTieBreak) {
      winners = [winners[Math.floor(Math.random() * winners.length)]];
    }

    poll.status = "completed";
    poll.winningMovieTmdbId = winners[0].tmdbId;
    poll.expiresAt = pollRetentionDate();
    poll.result = {
      mode: randomTieBreak ? "randomTieBreak" : "runoff",
      lowestScoreWins: false,
      randomTieBreak,
      movies: resultMovies(poll, scoreMap),
    };
    await poll.save();
    await Group.findByIdAndUpdate(poll.groupId, { $unset: { currentPoll: 1 } });

    const winnerMovie = winners[0];
    getIO().to(poll.groupId.toString()).emit("poll:completed", {
      pollId: poll._id.toString(),
      winningMovieTmdbId: winnerMovie.tmdbId,
      winnerTitle: winnerMovie.title,
      winnerPoster: winnerMovie.poster_path || "",
      randomTieBreak,
    });

    return { poll: await getPopulatedPoll(poll._id, currentUserId) };
  }

  const scoreMap = rankedScores(poll);
  const minScore = Math.min(...Object.values(scoreMap));
  const tiedMovies = poll.movies.filter((movie: any) => (scoreMap[movie.tmdbId] || 0) === minScore);

  if (tiedMovies.length > 1) {
    poll.movies = tiedMovies as any;
    poll.votes = [];
    poll.round = (poll.round || 1) + 1;
    poll.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    poll.result = {
      mode: "ranked",
      lowestScoreWins: true,
      randomTieBreak: false,
      movies: resultMovies(poll, scoreMap),
    };
    await poll.save();

    const runoffPoll = await getPopulatedPoll(poll._id, currentUserId);
    getIO().to(poll.groupId.toString()).emit("poll:runoff", {
      pollId: poll._id.toString(),
      round: poll.round,
      poll: runoffPoll,
    });
    // TODO: Send email notification for runoff if email notifications are added.

    return { runoff: true, poll: runoffPoll };
  }

  const winnerMovie = tiedMovies[0];
  poll.status = "completed";
  poll.winningMovieTmdbId = winnerMovie.tmdbId;
  poll.expiresAt = pollRetentionDate();
  poll.result = {
    mode: "ranked",
    lowestScoreWins: true,
    randomTieBreak: false,
    movies: resultMovies(poll, scoreMap),
  };
  await poll.save();
  await Group.findByIdAndUpdate(poll.groupId, { $unset: { currentPoll: 1 } });

  getIO().to(poll.groupId.toString()).emit("poll:completed", {
    pollId: poll._id.toString(),
    winningMovieTmdbId: winnerMovie.tmdbId,
    winnerTitle: winnerMovie.title,
    winnerPoster: winnerMovie.poster_path || "",
    randomTieBreak: false,
  });

  return { poll: await getPopulatedPoll(poll._id, currentUserId) };
};

router.get("/active-for-user", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const groups = await Group.find({ members: userId }).select("_id name").lean();
    const groupNames = new Map(groups.map((group) => [group._id.toString(), group.name]));
    const polls = await Poll.find({
      groupId: { $in: groups.map((group) => group._id) },
      status: "active",
    })
      .select("name groupId movies votes status round expiresAt")
      .lean();

    res.json(
      polls.map((poll: any) => ({
        _id: poll._id,
        groupId: poll.groupId,
        groupName: groupNames.get(poll.groupId.toString()) || "Movie group",
        name: poll.name,
        question: poll.name,
        options: (poll.movies || []).map(normalizeMovie),
        movies: (poll.movies || []).map(normalizeMovie),
        round: poll.round || 1,
        expiresAt: poll.expiresAt,
        hasCurrentUserVoted: (poll.votes || []).some(
          (vote: any) => vote.userId?.toString() === userId.toString()
        ),
      }))
    );
  } catch (error) {
    console.error("Error fetching active polls for user:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.post("/create", authenticate, async (req: Request, res: Response) => {
  try {
    const { groupId, movies, name, deadline } = req.body;
    const userId = req.user!.id;

    if (!name || !name.trim()) {
      res.status(400).json({ msg: "Poll name is required" });
      return;
    }
    if (!Array.isArray(movies) || movies.length < 2) {
      res.status(400).json({ msg: "Add at least two movies before publishing a poll" });
      return;
    }

    const normalizedMovies = movies.map(normalizeMovie);
    if (normalizedMovies.some((movie: any) => !movie.tmdbId || !movie.title)) {
      res.status(400).json({ msg: "Every poll movie needs a TMDB id and title" });
      return;
    }

    const existingPoll = await Poll.findOne({ groupId, status: "active" });
    if (existingPoll) {
      res.status(400).json({ msg: "An active poll already exists for this group" });
      return;
    }

    let expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (deadline) {
      const parsedDeadline = new Date(deadline);
      if (Number.isNaN(parsedDeadline.getTime()) || parsedDeadline <= new Date()) {
        res.status(400).json({ msg: "Poll deadline must be a future date" });
        return;
      }
      expiresAt = parsedDeadline;
    }

    const poll = new Poll({
      name: name.trim(),
      groupId,
      creator: userId,
      movies: normalizedMovies,
      expiresAt,
    });

    await poll.save();
    await Group.findByIdAndUpdate(groupId, {
      currentPoll: poll._id,
      $push: { pollHistory: poll._id },
    });

    const decoratedPoll = await getPopulatedPoll(poll._id, userId);
    getIO().to(groupId.toString()).emit("poll:created", decoratedPoll);
    res.json(decoratedPoll);
  } catch (error) {
    console.error("Error creating poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/group/:groupId/active", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const poll = await Poll.findOne({
      groupId: req.params.groupId,
      status: "active",
    })
      .populate("votes.userId", "name")
      .populate("creator", "name")
      .lean();

    if (!poll) {
      res.json(null);
      return;
    }

    if (poll.expiresAt && new Date(poll.expiresAt) <= new Date()) {
      const livePoll = await Poll.findById(poll._id);
      if (!livePoll) {
        res.json(null);
        return;
      }
      const completed = await completeOrRunoff(livePoll, userId);
      res.json(completed.runoff ? completed.poll : completed.poll);
      return;
    }

    res.json(await withVotingProgress(decoratePoll(poll), userId));
  } catch (error) {
    console.error("Error fetching active poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.post("/vote", authenticate, async (req: Request, res: Response) => {
  try {
    const { pollId, rankings } = req.body;
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

    const validationError = validateRankings(poll, rankings);
    if (validationError) {
      res.status(400).json({ msg: validationError });
      return;
    }

    poll.votes = poll.votes.filter((vote: any) => vote.userId.toString() !== userId.toString()) as any;
    poll.votes.push({
      userId: userId as any,
      rankings: rankings.map((ranking: RankingPayload) => ({
        movieTmdbId: ranking.movieTmdbId.toString(),
        rank: Number(ranking.rank),
      })),
    } as any);

    await poll.save();

    const group = await Group.findById(poll.groupId);
    if (group) {
      const uniqueVoters = new Set(poll.votes.map((vote: any) => vote.userId.toString()));
      if (uniqueVoters.size >= group.members.length) {
        const completed = await completeOrRunoff(poll, userId);
        res.json({ autoCompleted: true, ...completed });
        return;
      }
    }

    const populatedPoll = await getPopulatedPoll(pollId, userId);
    if (populatedPoll) {
      getIO().to(populatedPoll.groupId.toString()).emit("poll:updated", {
        ...populatedPoll,
        hasCurrentUserVoted: false,
      });
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
    const isPollCreator = poll.creator.toString() === userId;
    if (!isPollCreator) {
      res.status(403).json({ msg: "Only poll creator can cancel the poll" });
      return;
    }
    if (poll.status !== "active") {
      res.status(400).json({ msg: "Poll is not active" });
      return;
    }

    poll.status = "cancelled";
    poll.expiresAt = pollRetentionDate();
    await poll.save();
    await Group.findByIdAndUpdate(poll.groupId, { $unset: { currentPoll: 1 } });
    getIO().to(poll.groupId.toString()).emit("poll:cancelled", {
      pollId: poll._id.toString(),
    });

    res.json({ msg: "Poll cancelled successfully", poll });
  } catch (error) {
    console.error("Error cancelling poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

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

    const completed = await completeOrRunoff(poll, userId);
    res.json(completed.runoff ? completed : completed.poll);
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

    const normalizedMovie = normalizeMovie(movie);
    const alreadyExists = poll.movies.some((m) => m.tmdbId === normalizedMovie.tmdbId);
    if (!alreadyExists) {
      poll.movies.push(normalizedMovie as any);
      await poll.save();
    }

    res.json(await getPopulatedPoll(poll._id));
  } catch (error) {
    console.error("Error adding movie to poll:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/:pollId/results", authenticate, async (req: Request, res: Response) => {
  try {
    const poll = await Poll.findById(req.params.pollId)
      .populate("votes.userId", "name")
      .populate("creator", "name")
      .lean();
    if (!poll) {
      res.status(404).json({ msg: "Poll not found" });
      return;
    }

    const isRunoffResult = poll.result?.mode === "runoff" || poll.result?.mode === "randomTieBreak" || (poll.round || 1) > 1;
    const scoreMap = poll.result?.movies?.length
      ? poll.result.movies.reduce((acc: Record<string, number>, item: any) => {
          acc[item.movieTmdbId] = item.score;
          return acc;
        }, {})
      : isRunoffResult
        ? runoffCounts(poll)
        : rankedScores(poll);

    const rankedMovies = poll.movies
      .map((movie: any) => ({
        id: movie.tmdbId,
        movieId: movie.tmdbId,
        title: movie.title,
        poster_path: movie.poster_path,
        vote_average: movie.vote_average,
        score: scoreMap[movie.tmdbId] || 0,
      }))
      .sort((a: any, b: any) => isRunoffResult ? b.score - a.score : a.score - b.score);

    res.json({
      ...poll,
      movies: rankedMovies,
      winningMovieTmdbId: poll.winningMovieTmdbId,
      result: poll.result || {
        mode: isRunoffResult ? "runoff" : "ranked",
        lowestScoreWins: !isRunoffResult,
        randomTieBreak: false,
        movies: resultMovies(poll, scoreMap),
      },
    });
  } catch (error) {
    console.error("Error fetching poll results:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get("/group/:groupId/history", authenticate, async (req: Request, res: Response) => {
  try {
    // Display window only — older polls stay in the database but are not listed.
    const windowStart = new Date(Date.now() - POLL_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const polls = await Poll.find({
      groupId: req.params.groupId,
      status: { $in: ["completed", "cancelled"] },
      createdAt: { $gte: windowStart },
    })
      .sort({ createdAt: -1 })
      .populate("creator", "name")
      .lean();

    const history = polls.map((poll) => {
      const winnerMovie = poll.movies.find((movie: any) => movie.tmdbId === poll.winningMovieTmdbId);
      return {
        _id: poll._id,
        name: poll.name,
        round: poll.round,
        status: poll.status,
        winningMovieTmdbId: poll.winningMovieTmdbId,
        winnerTitle: winnerMovie?.title || null,
        winnerPoster: winnerMovie?.poster_path || null,
        randomTieBreak: poll.result?.randomTieBreak || false,
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

router.delete("/:pollId", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const poll = await Poll.findById(req.params.pollId);
    if (!poll) {
      res.status(404).json({ msg: "Poll not found" });
      return;
    }

    const group = await Group.findById(poll.groupId);
    const isPollCreator = poll.creator.toString() === userId;
    const isGroupAdmin = group?.creator.toString() === userId;

    if (!isPollCreator && !isGroupAdmin) {
      res.status(403).json({ msg: "Only poll creator or group admin can delete this poll" });
      return;
    }

    if (poll.status === "active" && group) {
      group.currentPoll = undefined;
      await group.save();
    }

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
