import express, { Request, Response } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { requireAdmin } from "../middleware/adminMiddleware";
import AnalyticsEvent from "../models/AnalyticsEvent";
import BugReport from "../models/BugReport";
import Group from "../models/Groups";
import Poll from "../models/Poll";
import User from "../models/user";
import { recordAnalyticsEvent } from "../utils/analytics";

const router = express.Router();
const ALLOWED_RANGES = new Set([7, 30, 90, 365]);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const startOfUtcDay = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const daysAgo = (days: number) => {
  const date = startOfUtcDay(new Date());
  date.setUTCDate(date.getUTCDate() - days + 1);
  return date;
};

const percentageChange = (current: number, previous: number) => {
  if (!previous) return current ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

const featureLabels: Record<string, string> = {
  home: "Home",
  groups: "Groups",
  invitations: "Invitations",
  watchlist: "Watchlist",
  watch_history: "Watch history",
  polls: "Polls & voting",
  ratings: "Ratings",
  chat: "Group chat",
  inbox: "Inbox",
  coming_soon: "Coming soon",
  profile: "Profile",
  assistant: "Movie assistant",
  comments: "Comments",
  bug_reports: "Bug reports",
};

router.post("/events", authenticate, async (req: Request, res: Response) => {
  try {
    const event = String(req.body?.event || "").trim().slice(0, 80);
    const feature = String(req.body?.feature || "").trim().slice(0, 60);
    if (!event || !feature) {
      res.status(400).json({ msg: "Event and feature are required" });
      return;
    }

    await recordAnalyticsEvent(req, event, feature, req.body?.properties || {});
    res.status(202).json({ accepted: true });
  } catch (error) {
    console.warn("Client analytics event could not be recorded:", error);
    res.status(202).json({ accepted: false });
  }
});

router.get("/admin/users", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const requestedPage = Number(req.query.page || 1);
    const requestedLimit = Number(req.query.limit || 10);
    const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(50, Math.max(5, Math.floor(requestedLimit)))
      : 10;
    const search = String(req.query.search || "").trim().slice(0, 80);
    const filter = search
      ? {
          $or: [
            { name: { $regex: escapeRegex(search), $options: "i" } },
            { email: { $regex: escapeRegex(search), $options: "i" } },
          ],
        }
      : {};

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("name email avatar provider role firstLogin createdAt watchlist")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const userIds = users.map((user) => user._id);
    const activityRows = userIds.length
      ? await AnalyticsEvent.aggregate([
          { $match: { userId: { $in: userIds } } },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: "$userId",
              lastActiveAt: { $first: "$createdAt" },
              lastFeature: { $first: "$feature" },
              country: { $first: "$country" },
              device: { $first: "$device" },
              eventCount: { $sum: 1 },
            },
          },
        ])
      : [];
    const activityByUser = new Map(activityRows.map((row: any) => [String(row._id), row]));

    res.json({
      users: users.map((user) => {
        const activity: any = activityByUser.get(String(user._id));
        return {
          id: String(user._id),
          name: user.name,
          email: user.email,
          avatar: user.avatar || "",
          provider: user.provider || "local",
          role: user.role || "user",
          onboardingComplete: !user.firstLogin,
          joinedAt: user.createdAt?.toISOString() || null,
          watchlistCount: user.watchlist?.length || 0,
          lastActiveAt: activity?.lastActiveAt?.toISOString() || null,
          lastFeature: activity?.lastFeature || null,
          country: activity?.country || null,
          device: activity?.device || null,
          eventCount: activity?.eventCount || 0,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("Analytics user directory failed:", error);
    res.status(500).json({ msg: "Unable to load users" });
  }
});

router.get("/admin/overview", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const requestedRange = Number(req.query.days || 30);
    const rangeDays = ALLOWED_RANGES.has(requestedRange) ? requestedRange : 30;
    const rangeStart = daysAgo(rangeDays);
    const previousStart = daysAgo(rangeDays * 2);
    const now = new Date();
    const dayStart = daysAgo(1);
    const weekStart = daysAgo(7);
    const monthStart = daysAgo(30);

    const [
      totalUsers,
      newUsers,
      previousNewUsers,
      totalGroups,
      watchedCount,
      totalPolls,
      openBugReports,
      dauIds,
      wauIds,
      mauIds,
      featureRows,
      previousFeatureRows,
      countryRows,
      deviceRows,
      activityRows,
      signupRows,
      funnelRows,
      firstEvent,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: rangeStart, $lte: now } }),
      User.countDocuments({ createdAt: { $gte: previousStart, $lt: rangeStart } }),
      Group.countDocuments(),
      Group.aggregate<{ count: number }>([
        { $unwind: "$movies" },
        { $count: "count" },
      ]),
      Poll.countDocuments(),
      BugReport.countDocuments({ status: { $in: ["open", "in-progress"] } }),
      AnalyticsEvent.distinct("userId", { createdAt: { $gte: dayStart }, userId: { $exists: true } }),
      AnalyticsEvent.distinct("userId", { createdAt: { $gte: weekStart }, userId: { $exists: true } }),
      AnalyticsEvent.distinct("userId", { createdAt: { $gte: monthStart }, userId: { $exists: true } }),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: rangeStart }, userId: { $exists: true } } },
        { $group: { _id: "$feature", uses: { $sum: 1 }, users: { $addToSet: "$userId" } } },
        { $project: { _id: 0, feature: "$_id", uses: 1, uniqueUsers: { $size: "$users" } } },
        { $sort: { uniqueUsers: -1, uses: -1 } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: previousStart, $lt: rangeStart }, userId: { $exists: true } } },
        { $group: { _id: "$feature", uses: { $sum: 1 }, users: { $addToSet: "$userId" } } },
        { $project: { _id: 0, feature: "$_id", uses: 1, uniqueUsers: { $size: "$users" } } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: rangeStart }, userId: { $exists: true } } },
        { $group: { _id: { $ifNull: ["$country", "Unknown"] }, events: { $sum: 1 }, users: { $addToSet: "$userId" } } },
        { $project: { _id: 0, country: "$_id", events: 1, users: { $size: "$users" } } },
        { $sort: { users: -1, events: -1 } },
        { $limit: 12 },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: rangeStart }, userId: { $exists: true } } },
        { $group: { _id: "$device", events: { $sum: 1 }, users: { $addToSet: "$userId" } } },
        { $project: { _id: 0, device: { $ifNull: ["$_id", "unknown"] }, events: 1, users: { $size: "$users" } } },
        { $sort: { users: -1 } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: rangeStart }, userId: { $exists: true } } },
        {
          $group: {
            _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } }, userId: "$userId" },
            events: { $sum: 1 },
          },
        },
        { $group: { _id: "$_id.date", activeUsers: { $sum: 1 }, events: { $sum: "$events" } } },
        { $project: { _id: 0, date: "$_id", activeUsers: 1, events: 1 } },
        { $sort: { date: 1 } },
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: rangeStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } }, newUsers: { $sum: 1 } } },
        { $project: { _id: 0, date: "$_id", newUsers: 1 } },
        { $sort: { date: 1 } },
      ]),
      AnalyticsEvent.aggregate([
        {
          $match: {
            createdAt: { $gte: rangeStart },
            userId: { $exists: true },
            event: { $in: ["group_created", "group_joined", "watchlist_added", "poll_voted", "movie_marked_watched"] },
          },
        },
        { $group: { _id: "$event", users: { $addToSet: "$userId" } } },
        { $project: { _id: 0, event: "$_id", users: { $size: "$users" } } },
      ]),
      AnalyticsEvent.findOne().sort({ createdAt: 1 }).select("createdAt").lean(),
    ]);

    const previousFeatureMap = new Map(
      previousFeatureRows.map((row: any) => [row.feature, row.uniqueUsers])
    );
    const uniqueActiveIds = await AnalyticsEvent.distinct("userId", {
      createdAt: { $gte: rangeStart },
      userId: { $exists: true },
    });
    const activeUserCount = uniqueActiveIds.length;

    const features = featureRows.map((row: any) => ({
      ...row,
      label: featureLabels[row.feature] || row.feature.replace(/_/g, " "),
      adoptionRate: activeUserCount ? Number(((row.uniqueUsers / activeUserCount) * 100).toFixed(1)) : 0,
      change: percentageChange(row.uniqueUsers, Number(previousFeatureMap.get(row.feature) || 0)),
    }));

    const activityMap = new Map(activityRows.map((row: any) => [row.date, row]));
    const signupMap = new Map(signupRows.map((row: any) => [row.date, row.newUsers]));
    const trend = Array.from({ length: rangeDays }, (_, index) => {
      const date = new Date(rangeStart);
      date.setUTCDate(date.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      const activity: any = activityMap.get(key);
      return {
        date: key,
        activeUsers: activity?.activeUsers || 0,
        events: activity?.events || 0,
        newUsers: signupMap.get(key) || 0,
      };
    });

    const funnelMap = new Map(funnelRows.map((row: any) => [row.event, row.users]));
    const funnelDefinitions = [
      { key: "registered", label: "Registered", users: newUsers },
      { key: "group", label: "Created or joined a group", users: Math.max(Number(funnelMap.get("group_created") || 0), Number(funnelMap.get("group_joined") || 0)) },
      { key: "watchlist", label: "Added a movie", users: Number(funnelMap.get("watchlist_added") || 0) },
      { key: "vote", label: "Voted in a poll", users: Number(funnelMap.get("poll_voted") || 0) },
      { key: "watched", label: "Marked a movie watched", users: Number(funnelMap.get("movie_marked_watched") || 0) },
    ];
    const funnelBase = Math.max(newUsers, 1);
    const funnel = funnelDefinitions.map((step) => ({
      ...step,
      conversionRate: Number(((step.users / funnelBase) * 100).toFixed(1)),
    }));

    res.json({
      meta: {
        rangeDays,
        generatedAt: now.toISOString(),
        trackingSince: firstEvent?.createdAt?.toISOString() || null,
        geographySource: "Approximate request-region headers",
      },
      overview: {
        totalUsers,
        newUsers,
        previousNewUsers,
        userGrowthRate: percentageChange(newUsers, previousNewUsers),
        activeUsers: activeUserCount,
        dau: dauIds.length,
        wau: wauIds.length,
        mau: mauIds.length,
        totalGroups,
        moviesWatched: watchedCount[0]?.count || 0,
        totalPolls,
        openBugReports,
      },
      trend,
      features,
      countries: countryRows,
      devices: deviceRows,
      funnel,
    });
  } catch (error) {
    console.error("Analytics overview failed:", error);
    res.status(500).json({ msg: "Unable to load analytics" });
  }
});

export default router;
