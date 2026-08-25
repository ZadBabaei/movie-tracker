import { Request, Response, NextFunction } from "express";
import AnalyticsEvent from "../models/AnalyticsEvent";

type AnalyticsProperties = Record<string, string | number | boolean | undefined>;

const headerValue = (req: Request, names: string[]) => {
  for (const name of names) {
    const value = req.headers[name];
    const normalized = Array.isArray(value) ? value[0] : value;
    if (normalized) return decodeURIComponent(String(normalized)).slice(0, 100);
  }
  return "";
};

const detectDevice = (userAgent = "") => {
  if (/ipad|tablet|kindle|silk/i.test(userAgent)) return "tablet" as const;
  if (/mobile|iphone|ipod|android/i.test(userAgent)) return "mobile" as const;
  if (userAgent) return "desktop" as const;
  return "unknown" as const;
};

const cleanProperties = (properties: AnalyticsProperties = {}) =>
  Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
      .slice(0, 20)
      .map(([key, value]) => [key.slice(0, 60), typeof value === "string" ? value.slice(0, 200) : value])
  );

export const recordAnalyticsEvent = async (
  req: Request,
  event: string,
  feature: string,
  properties: AnalyticsProperties = {},
  userId?: string
) => {
  if (process.env.DISABLE_ANALYTICS === "true") return;

  const country = headerValue(req, ["cf-ipcountry", "x-vercel-ip-country", "x-country-code"]);
  const region = headerValue(req, ["x-vercel-ip-country-region", "x-region-code"]);
  const city = headerValue(req, ["x-vercel-ip-city", "x-city"]);

  await AnalyticsEvent.create({
    event,
    feature,
    userId: userId || req.user?.id || undefined,
    path: String(req.body?.path || req.originalUrl || "").split("?")[0].slice(0, 300),
    country: country || "Unknown",
    region,
    city,
    device: detectDevice(req.get("user-agent") || ""),
    properties: cleanProperties(properties),
  });
};

type RouteEvent = { event: string; feature: string };

const resolveRouteEvent = (method: string, path: string): RouteEvent | null => {
  if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") {
    return null;
  }

  const rules: Array<[RegExp, RouteEvent]> = [
    [/^POST \/api\/groups\/create$/, { event: "group_created", feature: "groups" }],
    [/^POST \/api\/groups\/(invite|invite-by-email|[^/]+\/invite-link)$/, { event: "invitation_sent", feature: "invitations" }],
    [/^POST \/api\/groups\/(respond|join-by-link\/)/, { event: "group_joined", feature: "groups" }],
    [/^POST \/api\/groups\/[^/]+\/add-movie$/, { event: "movie_marked_watched", feature: "watch_history" }],
    [/^POST \/api\/groups\/[^/]+\/history\/[^/]+\/rating$/, { event: "rating_submitted", feature: "ratings" }],
    [/^POST \/api\/watchlist(\/group\/[^/]+)?$/, { event: "watchlist_added", feature: "watchlist" }],
    [/^POST \/api\/watchlist\/[^/]+\/mark-watched$/, { event: "movie_marked_watched", feature: "watch_history" }],
    [/^POST \/api\/polls\/create$/, { event: "poll_created", feature: "polls" }],
    [/^POST \/api\/polls\/vote$/, { event: "poll_voted", feature: "polls" }],
    [/^POST \/api\/assistant\/chat$/, { event: "assistant_used", feature: "assistant" }],
    [/^POST \/api\/comments$/, { event: "comment_created", feature: "comments" }],
    [/^POST \/api\/bug-reports\/?$/, { event: "bug_report_submitted", feature: "bug_reports" }],
  ];

  const signature = `${method} ${path}`;
  return rules.find(([pattern]) => pattern.test(signature))?.[1] || null;
};

export const analyticsResponseMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 400 || req.originalUrl.startsWith("/api/analytics")) return;
    const path = req.originalUrl.split("?")[0];
    const routeEvent = resolveRouteEvent(req.method, path);
    if (!routeEvent || !req.user?.id) return;
    void recordAnalyticsEvent(req, routeEvent.event, routeEvent.feature).catch((error) => {
      console.warn("Analytics event could not be recorded:", error);
    });
  });
  next();
};
