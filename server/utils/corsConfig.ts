import { CorsOptions } from "cors";

const fallbackOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

export const getAllowedOrigins = () => {
  const configuredOrigins = [
    process.env.CLIENT_URL,
    process.env.APP_URL,
    process.env.CORS_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins.length ? configuredOrigins : fallbackOrigins;
};

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    callback(null, getAllowedOrigins().includes(origin));
  },
};
