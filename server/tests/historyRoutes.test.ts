import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";
import historyRouter from "../routes/historyRoutes";
import Group from "../models/Groups";
import Movie from "../models/movie";
import User from "../models/user";
import WatchHistoryEntry from "../models/WatchHistoryEntry";

const socketModule = require("../socket") as typeof import("../socket");

const ids = {
  user: new mongoose.Types.ObjectId().toString(),
  outsider: new mongoose.Types.ObjectId().toString(),
  movie: new mongoose.Types.ObjectId(),
  group: new mongoose.Types.ObjectId(),
  entry: new mongoose.Types.ObjectId(),
  legacy: new mongoose.Types.ObjectId(),
};

const postLayer = (historyRouter as any).stack.find(
  (layer: any) => layer.route?.path === "/" && layer.route?.methods?.post
);
const postHistory = postLayer.route.stack[postLayer.route.stack.length - 1].handle;

const originals = {
  movieFindById: Movie.findById,
  movieFindOne: Movie.findOne,
  movieCreate: Movie.create,
  groupFindById: Group.findById,
  groupUpdateOne: Group.updateOne,
  userUpdateOne: User.updateOne,
  historyCreate: WatchHistoryEntry.create,
  getIO: socketModule.getIO,
};

afterEach(() => {
  Movie.findById = originals.movieFindById;
  Movie.findOne = originals.movieFindOne;
  Movie.create = originals.movieCreate;
  Group.findById = originals.groupFindById;
  Group.updateOne = originals.groupUpdateOne;
  User.updateOne = originals.userUpdateOne;
  WatchHistoryEntry.create = originals.historyCreate;
  (socketModule as any).getIO = originals.getIO;
});

const movieDocument = (overrides: Record<string, unknown> = {}) => ({
  _id: ids.movie,
  title: "Arrival",
  imdbID: "tmdb-329865",
  poster: "/arrival.jpg",
  vote_average: 7.9,
  ...overrides,
});

const rawMovie = {
  imdbID: "tmdb-329865",
  title: "Arrival",
  poster_path: "/arrival.jpg",
  vote_average: 7.9,
};

const response = () => {
  const state: { statusCode: number; body?: any } = { statusCode: 200 };
  return {
    state,
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: any) {
      state.body = body;
      return this;
    },
  };
};

const invoke = async (body: Record<string, unknown>, userId = ids.user) => {
  const res = response();
  await postHistory({ user: { id: userId }, body, query: {}, params: {} }, res);
  return res.state;
};

const installHistoryCreate = (movie: any, createdPayloads: any[]) => {
  WatchHistoryEntry.create = (async (payload: any) => {
    createdPayloads.push(payload);
    const entry: any = {
      _id: new mongoose.Types.ObjectId(),
      ...payload,
      ratings: [],
      async populate() {
        this.movieId = movie;
        if (payload.scope === "group") {
          this.groupId = { _id: ids.group, name: "Movie Club", slug: "movie-club" };
        }
        this.createdBy = { _id: ids.user, name: "Tester" };
        this.participants = payload.participants.map((id: mongoose.Types.ObjectId) => ({ _id: id, name: "Member" }));
      },
      toObject() {
        return { ...this };
      },
      async deleteOne() {},
    };
    return entry;
  }) as typeof WatchHistoryEntry.create;
};

const installPersonalStubs = (movie: any, createdPayloads: any[]) => {
  installHistoryCreate(movie, createdPayloads);
  User.updateOne = (async () => ({ acknowledged: true })) as any;
};

test("existing movieId requests remain compatible", async () => {
  const movie = movieDocument();
  const payloads: any[] = [];
  let rawLookupCalled = false;
  let watchlistPull: any;
  Movie.findById = (async () => movie) as any;
  Movie.findOne = (async () => { rawLookupCalled = true; return null; }) as any;
  installHistoryCreate(movie, payloads);
  User.updateOne = (async (...args: any[]) => { watchlistPull = args; return { acknowledged: true }; }) as any;

  const result = await invoke({
    movieId: ids.movie.toString(),
    scope: "personal",
    source: "personal",
    watchedAt: "2026-09-19",
  });

  assert.equal(result.statusCode, 201);
  assert.equal(rawLookupCalled, false);
  assert.equal(payloads[0].movieId.toString(), ids.movie.toString());
  assert.deepEqual(watchlistPull, [
    { _id: ids.user },
    { $pull: { watchlist: ids.movie } },
  ]);
});

test("raw movie creates a personal history entry without touching the watchlist", async () => {
  const movie = movieDocument();
  const payloads: any[] = [];
  let createdMovie: any;
  let watchlistUpdated = false;
  Movie.findOne = (async () => null) as any;
  Movie.create = (async (payload: any) => { createdMovie = payload; return movie; }) as any;
  installHistoryCreate(movie, payloads);
  User.updateOne = (async () => { watchlistUpdated = true; }) as any;

  const result = await invoke({ movie: rawMovie, scope: "personal", watchedAt: "2026-09-19" });

  assert.equal(result.statusCode, 201);
  assert.equal(createdMovie.imdbID, rawMovie.imdbID);
  assert.equal(createdMovie.addedBy, ids.user);
  assert.equal(payloads.length, 1);
  assert.equal(watchlistUpdated, false);
});

test("an existing Movie is reused and rewatches create distinct history entries", async () => {
  const movie = movieDocument();
  const payloads: any[] = [];
  let movieCreates = 0;
  Movie.findOne = (async () => movie) as any;
  Movie.create = (async () => { movieCreates += 1; return movie; }) as any;
  installPersonalStubs(movie, payloads);

  const first = await invoke({ movie: rawMovie, scope: "personal", watchedAt: "2026-09-18" });
  const second = await invoke({ movie: rawMovie, scope: "personal", watchedAt: "2026-09-19" });

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 201);
  assert.equal(movieCreates, 0);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].movieId.toString(), payloads[1].movieId.toString());
});

test("invalid raw movie data returns 400", async () => {
  let historyCreated = false;
  WatchHistoryEntry.create = (async () => { historyCreated = true; }) as any;

  const result = await invoke({ movie: { imdbID: "tmdb-1", title: "" }, scope: "personal" });

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.msg, "Invalid movie data");
  assert.equal(historyCreated, false);
});

test("direct group history preserves the legacy dual-write and participants", async () => {
  const movie = movieDocument();
  const payloads: any[] = [];
  const movies: any[] = [];
  const nativePush = movies.push.bind(movies);
  movies.push = ((entry: any) => nativePush({ ...entry, _id: ids.legacy })) as any;
  let groupSaves = 0;
  const group: any = {
    _id: ids.group,
    name: "Movie Club",
    members: [new mongoose.Types.ObjectId(ids.user)],
    movies,
    watchlist: [],
    async save() { groupSaves += 1; },
  };
  Movie.findOne = (async () => movie) as any;
  Group.findById = (async () => group) as any;
  Group.updateOne = (async () => ({ acknowledged: true })) as any;
  installHistoryCreate(movie, payloads);
  (socketModule as any).getIO = () => ({ to: () => ({ emit: () => undefined }) });

  const result = await invoke({
    movie: rawMovie,
    scope: "group",
    groupId: ids.group.toString(),
    participants: [ids.user],
    watchedAt: "2026-09-19",
    watchedLocation: "Home",
  });

  assert.equal(result.statusCode, 201);
  assert.equal(groupSaves, 1);
  assert.equal(movies.length, 1);
  assert.equal(movies[0].movieId.toString(), ids.movie.toString());
  assert.equal(payloads[0].legacyHistoryItemId.toString(), ids.legacy.toString());
  assert.deepEqual(payloads[0].participants.map(String), [ids.user]);
});

test("group authorization and participant membership remain enforced", async () => {
  const movie = movieDocument();
  let historyCreates = 0;
  const group: any = {
    _id: ids.group,
    members: [new mongoose.Types.ObjectId(ids.user)],
    movies: [],
    watchlist: [],
    async save() {},
  };
  Movie.findOne = (async () => movie) as any;
  Group.findById = (async () => group) as any;
  WatchHistoryEntry.create = (async () => { historyCreates += 1; }) as any;

  const forbidden = await invoke({ movie: rawMovie, scope: "group", groupId: ids.group.toString() }, ids.outsider);
  const invalidParticipant = await invoke({
    movie: rawMovie,
    scope: "group",
    groupId: ids.group.toString(),
    participants: [ids.outsider],
  });

  assert.equal(forbidden.statusCode, 403);
  assert.equal(invalidParticipant.statusCode, 400);
  assert.equal(historyCreates, 0);
  assert.equal(group.movies.length, 0);
});
