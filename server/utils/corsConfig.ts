import { CorsOptions } from "cors";

const fallbackOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://movietrk.com",
  "https://www.movietrk.com",
  "https://movietracker.zadprogramming.com",
];

const normalizeOrigin = (origin: string) => {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/+$/, "");
  }
};

export const getAllowedOrigins = () => {
  const configuredOrigins = [
    process.env.CLIENT_URL,
    process.env.APP_URL,
    process.env.CORS_ORIGINS,
    process.env.VERCEL_PREVIEW_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean);

  return Array.from(new Set([...fallbackOrigins.map(normalizeOrigin), ...configuredOrigins]));
};

export const isOriginAllowed = (origin?: string) => {
  if (!origin) return true;
  return getAllowedOrigins().includes(normalizeOrigin(origin));
};

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    const message = `CORS blocked origin: ${origin}`;
    if (process.env.NODE_ENV === "development") {
      callback(new Error(message));
      return;
    }

    callback(null, false);
  },
};
