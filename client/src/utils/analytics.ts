import apiClient from "../api/apiClient";

type AnalyticsValue = string | number | boolean;
type AnalyticsProperties = Record<string, AnalyticsValue | undefined>;

interface AnalyticsUser {
  _id: string;
  createdAt?: string;
  isAdmin?: boolean;
}

let postHogPromise: Promise<typeof import("posthog-js")["default"] | null> | null = null;

const loadPostHog = () => {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return Promise.resolve(null);
  if (postHogPromise) return postHogPromise;

  postHogPromise = import("posthog-js").then(({ default: posthog }) => {
    if (!posthog.__loaded) {
      posthog.init(key, {
        api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
        person_profiles: "identified_only",
      });
    }
    return posthog;
  }).catch((error) => {
    console.warn("External analytics could not be initialized:", error);
    return null;
  });

  return postHogPromise;
};

const compactProperties = (properties: AnalyticsProperties) =>
  Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined));

export const identifyAnalyticsUser = async (user: AnalyticsUser) => {
  const posthog = await loadPostHog();
  posthog?.identify(user._id, {
    created_at: user.createdAt,
    account_type: user.isAdmin ? "owner" : "member",
  });
};

export const captureAnalyticsEvent = async (
  event: string,
  feature: string,
  properties: AnalyticsProperties = {}
) => {
  const token = localStorage.getItem("token");
  const payload = { event, feature, properties: compactProperties(properties), path: window.location.pathname };

  if (token) {
    void apiClient.post("/api/analytics/events", payload, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }

  const posthog = await loadPostHog();
  posthog?.capture(event, { feature, ...payload.properties });
};

export const resetAnalytics = async () => {
  const posthog = await loadPostHog();
  posthog?.reset();
};
