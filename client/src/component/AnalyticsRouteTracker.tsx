import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useUserStore } from "../store/useUserStore";
import { captureAnalyticsEvent, identifyAnalyticsUser } from "../utils/analytics";

const featureForPath = (path: string) => {
  if (path === "/home") return "home";
  if (path === "/watchlist") return "watchlist";
  if (path === "/coming-soon") return "coming_soon";
  if (path === "/my-groups" || /^\/group\/[^/]+$/.test(path)) return "groups";
  if (path.endsWith("/chat")) return "chat";
  if (path === "/inbox") return "inbox";
  if (path === "/profile") return "profile";
  if (path === "/dashboard") return "owner_analytics";
  return "other";
};

export default function AnalyticsRouteTracker() {
  const location = useLocation();
  const profile = useUserStore((state) => state.profile);

  useEffect(() => {
    if (profile?._id) void identifyAnalyticsUser(profile);
  }, [profile?._id, profile?.createdAt, profile?.isAdmin]);

  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    void captureAnalyticsEvent("feature_viewed", featureForPath(location.pathname), {
      path: location.pathname,
    });
  }, [location.pathname]);

  return null;
}
