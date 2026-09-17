import express from "express";
import http from "http";
import mongoose from "mongoose";
import { initIO } from "../socket";
import Group from "../models/Groups";
import Movie from "../models/movie";
import User from "../models/user";
import { signAuthToken } from "../utils/authToken";

const getDatabaseName = (uri: string) => {
  try {
    const parsed = new URL(uri.replace(/^mongodb\+srv:/, "mongodb:"));
    return parsed.pathname.replace(/^\//, "").split("?")[0].toLowerCase();
  } catch {
    return "";
  }
};

// Same guard as the e2e suite: only ever touch a database whose name says it
// is a test database.
export const getTestMongoUri = () => {
  const uri =
    process.env.TEST_MONGODB_URI ||
    process.env.E2E_MONGODB_URI ||
    "mongodb://127.0.0.1:27017/movie-tracker-test";
  const dbName = getDatabaseName(uri);
  if (!dbName || (!dbName.includes("test") && !dbName.includes("e2e"))) {
    throw new Error(`Refusing to run tests against database "${dbName || "(missing)"}".`);
  }
  return uri;
};

export const connectTestDb = async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "history-test-secret";
  await mongoose.connect(getTestMongoUri(), { serverSelectionTimeoutMS: 10_000 });
};

export const clearTestDb = async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

export const disconnectTestDb = async () => {
  await mongoose.disconnect();
};

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export const startTestServer = async (mount: (app: express.Express) => void): Promise<TestServer> => {
  const app = express();
  app.use(express.json({ limit: "100kb" }));
  mount(app);
  const httpServer = http.createServer(app);
  initIO(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => httpServer.close(() => resolve())),
  };
};

let counter = 0;

export const createUser = async (name = "User") => {
  counter += 1;
  const user = await User.create({ name, email: `${name.toLowerCase()}-${counter}@example.com`, password: "test-password-hash" });
  return { user, token: signAuthToken(user) };
};

export const createMovie = async (title = "Movie") => {
  counter += 1;
  return Movie.create({ title, imdbID: `tmdb-${counter}`, poster: "/poster.jpg", vote_average: 7.5 });
};

export const createGroup = async (creator: mongoose.Types.ObjectId, members: mongoose.Types.ObjectId[]) => {
  counter += 1;
  return Group.create({ name: `Group ${counter}`, slug: `group-${counter}`, creator, members });
};

export const api = (server: TestServer, token?: string) => {
  const request = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${server.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: response.status, body: json };
  };
  return {
    get: (path: string) => request("GET", path),
    post: (path: string, body?: unknown) => request("POST", path, body),
    patch: (path: string, body?: unknown) => request("PATCH", path, body),
    put: (path: string, body?: unknown) => request("PUT", path, body),
    delete: (path: string) => request("DELETE", path),
  };
};

export const tvEpisode = (overrides: Partial<Record<string, unknown>> = {}) => ({
  seriesTmdbId: 199925,
  seasonNumber: 1,
  episodeNumber: 1,
  episodeTmdbId: 4321001,
  seriesTitle: "Special Ops: Lioness",
  episodeTitle: "Sacrificial Soldiers",
  posterPath: "/lioness-poster.jpg",
  backdropPath: "/lioness-backdrop.jpg",
  stillPath: "/lioness-s01e01.jpg",
  airDate: "2023-07-23",
  ...overrides,
});
