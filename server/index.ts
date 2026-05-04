import express from "express";
import cors from "cors";
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
import { corsOptions } from "./utils/corsConfig";

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

app.use(cors(corsOptions));
app.use(express.json({ limit: "3mb" }));

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

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global error handler:", err);
  res.status(500).json({
    msg: "Server error",
    error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
  });
});

app.get("/", (_req, res) => {
  res.send("Hello from Movie Tracker Backend!");
});

mongoose
  .connect(getMongoUri() as string)
  .then(async () => {
    console.log("MongoDB Connected to:", mongoose.connection.db!.databaseName);
    const collections = await mongoose.connection.db!.listCollections().toArray();
    console.log("Collections:", collections.map((c) => c.name));
  })
  .catch((err) => console.error("MongoDB Connection Error:", err));

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
