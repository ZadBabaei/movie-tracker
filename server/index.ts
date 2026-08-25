import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import dotenv from "dotenv";
import http from "http";
import { initIO } from "./socket";

dotenv.config();

import groupRoutes from "./routes/groupRoutes";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import pollRoutes from "./routes/pollRoutes";
import chatRoutes from "./routes/chatRoutes";
import inboxRoutes from "./routes/inboxRoutes";
import watchlistRoutes from "./routes/watchlistRoutes";
import profileRoutes from "./routes/profileRoutes";
import assistantRoutes from "./routes/assistantRoutes";
import commentRoutes from "./routes/commentRoutes";
import bugReportRoutes from "./routes/bugReportRoutes";
import comingSoonRoutes from "./routes/comingSoonRoutes";
import analyticsRoutes from "./routes/analyticsRoutes";
import { corsOptions } from "./utils/corsConfig";
import { analyticsLimiter, apiLimiter, publicDataLimiter } from "./middleware/rateLimits";
import { securityEventLogger } from "./middleware/securityLog";
import { analyticsResponseMiddleware } from "./utils/analytics";

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 5000;

const getDatabaseName = (uri: string) => {
  try {
    const normalized = uri.replace(/^mongodb\+srv:/, "mongodb:");
    const parsed = new URL(normalized);
    return parsed.pathname.replace(/^\//, "").split("?")[0].toLowerCase();
  } catch {
    return "";
  }
};

const getMongoUri = () => {
  if (process.env.NODE_ENV !== "test") {
    return process.env.MONGODB_URI;
  }

  const uri = process.env.E2E_MONGODB_URI;
  const dbName = uri ? getDatabaseName(uri) : "";
  if (!uri || (!dbName.includes("e2e") && !dbName.includes("test"))) {
    throw new Error(
      `NODE_ENV=test requires E2E_MONGODB_URI with an e2e/test database name. Got "${dbName || "(missing database name)"}".`
    );
  }

  return uri;
};

initIO(httpServer);

// Railway terminates TLS in front of the app; without this every request looks
// like it comes from the proxy and rate limiting would bucket all users together.
app.set("trust proxy", 1);

app.use(
  helmet({
    // Browsers fetch this API cross-origin from the Vercel frontend.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors(corsOptions));

// Only bug reports carry a screenshot payload; everything else gets a small body.
app.use("/api/bug-reports", express.json({ limit: "3mb" }));
app.use(express.json({ limit: "100kb" }));

app.use(securityEventLogger);
app.use(apiLimiter);
app.use(analyticsResponseMiddleware);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/groups", groupRoutes);
app.use("/api/inbox", inboxRoutes);
app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/polls", pollRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/bug-reports", bugReportRoutes);
app.use("/api/coming-soon", publicDataLimiter, comingSoonRoutes);
app.use("/api/analytics", analyticsLimiter, analyticsRoutes);

app.get("/", (_req, res) => {
  res.send("Hello from Movie Tracker Backend!");
});

// Registered after every route so it sees their errors. Client-side failures
// (413 from the body limit, multer rejections) keep their real status and a
// safe message; server-side failures never leak internals.
app.use(
  (
    err: Error & { status?: number; statusCode?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const status = err.status || err.statusCode || 500;

    if (status >= 500) {
      console.error("Global error handler:", err);
    }

    const msg =
      status === 413
        ? "Request body is too large."
        : status >= 500
          ? "Server error"
          : err.message || "Request failed";

    res.status(status).json({
      msg,
      ...(process.env.NODE_ENV === "development" ? { error: err.message } : {}),
    });
  }
);

mongoose
  .connect(getMongoUri() as string, {
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 20,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  })
  .then(async () => {
    console.log("MongoDB Connected to:", mongoose.connection.db!.databaseName);
    const collections = await mongoose.connection.db!.listCollections().toArray();
    console.log("Collections:", collections.map((c) => c.name));
  })
  .catch((err) => console.error("MongoDB Connection Error:", err));

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
