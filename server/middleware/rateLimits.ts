import rateLimit from "express-rate-limit";

const MINUTE = 60 * 1000;
const isTest = process.env.NODE_ENV === "test";

// The e2e suite drives dozens of registrations and API calls from a single IP,
// so ceilings are widened under NODE_ENV=test. Production values are the real
// ones. Password-reset limits are deliberately NOT widened so the limiter is
// exercised end to end by the test suite.
const ceiling = (production: number) => (isTest ? production * 100 : production);

const build = (
  windowMs: number,
  limit: number,
  msg: string,
  extra: Record<string, unknown> = {}
) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { msg },
    ...extra,
  });

// Broad backstop so no single client can flood the API.
export const apiLimiter = build(
  15 * MINUTE,
  ceiling(600),
  "Too many requests. Please slow down and try again shortly."
);

// Credential endpoints. Successful sign-ins are not counted, so this only
// bites on repeated failures — i.e. brute force and credential stuffing.
export const loginLimiter = build(
  15 * MINUTE,
  ceiling(10),
  "Too many sign-in attempts. Please try again in a few minutes.",
  { skipSuccessfulRequests: true }
);

export const registerLimiter = build(
  60 * MINUTE,
  ceiling(5),
  "Too many accounts created from this address. Please try again later."
);

// Strict in every environment, including tests.
export const passwordResetLimiter = build(
  15 * MINUTE,
  5,
  "Too many password reset requests. Please try again later."
);

// Each call bills the OpenAI account, so this is a spend control.
export const assistantLimiter = build(
  60 * MINUTE,
  ceiling(30),
  "You have reached the assistant limit for now. Please try again later."
);

// Sending mail from the app's domain — abuse here burns sender reputation.
export const inviteLimiter = build(
  60 * MINUTE,
  ceiling(20),
  "Too many invitations sent. Please try again later."
);

export const analyticsLimiter = build(
  15 * MINUTE,
  ceiling(300),
  "Too many analytics events."
);

// Unauthenticated, and every cache miss costs TMDB/Watchmode quota.
export const publicDataLimiter = build(
  15 * MINUTE,
  ceiling(60),
  "Too many requests. Please try again shortly."
);

export const uploadLimiter = build(
  60 * MINUTE,
  ceiling(20),
  "Too many uploads. Please try again later."
);
