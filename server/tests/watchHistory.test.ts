import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import Group from "../models/Groups";
import WatchHistoryEntry from "../models/WatchHistoryEntry";
import historyRoutes from "../routes/historyRoutes";
import { serializeHistoryEntry } from "../utils/watchHistory";
import {
  api,
  clearTestDb,
  connectTestDb,
  createGroup,
  createMovie,
  createUser,
  disconnectTestDb,
  startTestServer,
  tvEpisode,
  TestServer,
} from "./helpers";

let server: TestServer;

before(async () => {
  await connectTestDb();
  await WatchHistoryEntry.syncIndexes();
  server = await startTestServer((app) => app.use("/api/history", historyRoutes));
});

after(async () => {
  await server.close();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

describe("WatchHistoryEntry model", () => {
  it("treats a legacy movie document with no mediaType as a movie", async () => {
    const { user } = await createUser();
    const movie = await createMovie();
    // Insert below Mongoose so no default is applied, exactly like pre-TV data.
    const { insertedId } = await mongoose.connection.db!.collection("watchhistoryentries").insertOne({
      movieId: movie._id,
      scope: "personal",
      createdBy: user._id,
      participants: [user._id],
      watchedAt: new Date("2024-01-05T20:00:00Z"),
      watchedLocation: "",
      watchedNotes: "",
      ratings: [],
    });

    const raw = await WatchHistoryEntry.findById(insertedId).lean();
    assert.equal(raw!.mediaType, undefined);
    const serialized = serializeHistoryEntry(await WatchHistoryEntry.findById(insertedId).populate("movieId").lean(), String(user._id));
    assert.equal(serialized.mediaType, "movie");
    assert.equal(serialized.movie?.title, movie.title);
    assert.equal(serialized.tv, null);

    // Re-saving through Mongoose must still validate (movieId present, no tv).
    const hydrated = await WatchHistoryEntry.findById(insertedId);
    hydrated!.watchedNotes = "still valid";
    await hydrated!.save();
  });

  it("defaults new movie entries to mediaType movie", async () => {
    const { user } = await createUser();
    const movie = await createMovie();
    const entry = await WatchHistoryEntry.create({ movieId: movie._id, scope: "personal", createdBy: user._id });
    assert.equal(entry.mediaType, "movie");
    assert.equal(entry.tv, undefined);
  });

  it("rejects a movie without movieId", async () => {
    const { user } = await createUser();
    await assert.rejects(
      WatchHistoryEntry.create({ mediaType: "movie", scope: "personal", createdBy: user._id }),
      /movieId/
    );
    await assert.rejects(WatchHistoryEntry.create({ scope: "personal", createdBy: user._id }), /movieId/);
  });

  it("rejects a tv_episode without its identity", async () => {
    const { user } = await createUser();
    await assert.rejects(
      WatchHistoryEntry.create({ mediaType: "tv_episode", scope: "personal", createdBy: user._id }),
      /tv/
    );
    await assert.rejects(
      WatchHistoryEntry.create({
        mediaType: "tv_episode",
        scope: "personal",
        createdBy: user._id,
        tv: { seriesTitle: "No identity" },
      })
    );
    await assert.rejects(
      WatchHistoryEntry.create({
        mediaType: "tv_episode",
        scope: "personal",
        createdBy: user._id,
        tv: { seriesTmdbId: 1, seasonNumber: 1, episodeNumber: 1.5, seriesTitle: "Fractional" },
      })
    );
  });

  it("rejects mixed movie/tv shapes", async () => {
    const { user } = await createUser();
    const movie = await createMovie();
    await assert.rejects(
      WatchHistoryEntry.create({ mediaType: "movie", movieId: movie._id, tv: tvEpisode(), scope: "personal", createdBy: user._id }),
      /cannot carry TV/
    );
    await assert.rejects(
      WatchHistoryEntry.create({ mediaType: "tv_episode", movieId: movie._id, tv: tvEpisode(), scope: "personal", createdBy: user._id }),
      /cannot reference a movie/
    );
    await assert.rejects(
      WatchHistoryEntry.create({ mediaType: "series", tv: tvEpisode(), scope: "personal", createdBy: user._id })
    );
  });

  it("stores a valid tv_episode as one document without a movieId", async () => {
    const { user } = await createUser();
    const entry = await WatchHistoryEntry.create({
      mediaType: "tv_episode",
      tv: tvEpisode(),
      scope: "personal",
      createdBy: user._id,
      watchedAt: new Date("2024-02-01T21:00:00Z"),
    });
    assert.equal(entry.movieId, undefined);
    assert.equal(entry.tv?.seriesTmdbId, 199925);
    assert.equal(entry.tv?.seasonNumber, 1);
    assert.equal(entry.tv?.episodeNumber, 1);
    assert.equal(entry.tv?.episodeTmdbId, 4321001);
    const stored = await mongoose.connection.db!.collection("watchhistoryentries").findOne({ _id: entry._id });
    assert.equal(stored!.mediaType, "tv_episode");
    assert.equal("movieId" in stored!, false);
  });

  it("keeps rewatches and same-day episodes as separate documents", async () => {
    const { user } = await createUser();
    const base = { mediaType: "tv_episode" as const, scope: "personal" as const, createdBy: user._id };
    const day = new Date("2024-03-10T20:00:00Z");
    await WatchHistoryEntry.create({ ...base, tv: tvEpisode({ episodeNumber: 1 }), watchedAt: day });
    await WatchHistoryEntry.create({ ...base, tv: tvEpisode({ episodeNumber: 2 }), watchedAt: day });
    await WatchHistoryEntry.create({ ...base, tv: tvEpisode({ episodeNumber: 1 }), watchedAt: day });
    const count = await WatchHistoryEntry.countDocuments({ createdBy: user._id, "tv.seriesTmdbId": 199925 });
    assert.equal(count, 3);
    const rewatches = await WatchHistoryEntry.countDocuments({ createdBy: user._id, "tv.episodeNumber": 1 });
    assert.equal(rewatches, 2);
  });

  it("has a partial series index that excludes movies and is not unique", async () => {
    const indexes = await WatchHistoryEntry.collection.indexes();
    const seriesIndex = indexes.find((index) => index.key["tv.seriesTmdbId"] === 1);
    assert.ok(seriesIndex, "series index missing");
    assert.deepEqual(seriesIndex!.key, { participants: 1, "tv.seriesTmdbId": 1, watchedAt: -1, _id: -1 });
    assert.deepEqual(seriesIndex!.partialFilterExpression, { mediaType: "tv_episode" });
    assert.equal(Boolean(seriesIndex!.unique), false);
    const legacyIndex = indexes.find((index) => index.key.legacyGroupId === 1);
    assert.ok(legacyIndex?.unique, "legacy unique index must survive");
  });
});

describe("history API — movie compatibility", () => {
  it("creates, reads, updates, rates and deletes a personal movie entry", async () => {
    const { user, token } = await createUser("Alice");
    const movie = await createMovie("Heat");
    const client = api(server, token);

    const created = await client.post("/api/history", { movieId: String(movie._id), watchedAt: "2024-04-01" });
    assert.equal(created.status, 201);
    assert.equal(created.body.entry.mediaType, "movie");
    assert.equal(created.body.entry.movie.title, "Heat");
    assert.equal(created.body.entry.tv, null);

    const list = await client.get("/api/history/personal");
    assert.equal(list.status, 200);
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].movie._id, String(movie._id));
    assert.equal(list.body.stats.total, 1);

    const id = created.body.entry._id;
    const updated = await client.patch(`/api/history/${id}`, { watchedAt: "2024-04-02", watchedLocation: "Home", watchedNotes: "Great" });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.entry.watchedLocation, "Home");

    const rated = await client.put(`/api/history/${id}/rating`, { rating: 9 });
    assert.equal(rated.status, 200);
    assert.equal(rated.body.entry.currentUserRating, 9);

    // Rewatch is a second document.
    const again = await client.post("/api/history", { movieId: String(movie._id), watchedAt: "2024-05-01" });
    assert.equal(again.status, 201);
    assert.equal(await WatchHistoryEntry.countDocuments({ createdBy: user._id }), 2);

    const deleted = await client.delete(`/api/history/${id}`);
    assert.equal(deleted.status, 200);
    assert.equal(await WatchHistoryEntry.countDocuments({ createdBy: user._id }), 1);
  });

  it("rejects a movie entry without a movieId", async () => {
    const { token } = await createUser();
    const res = await api(server, token).post("/api/history", { watchedAt: "2024-04-01" });
    assert.equal(res.status, 400);
  });

  it("rejects an unsupported mediaType even with a valid movieId, but accepts absent/null/empty", async () => {
    const { user, token } = await createUser();
    const movie = await createMovie();
    const client = api(server, token);

    for (const mediaType of ["banana", "tv", "MOVIE", 1, {}]) {
      const res = await client.post("/api/history", { mediaType, movieId: String(movie._id), watchedAt: "2024-04-01" });
      assert.equal(res.status, 400, `mediaType ${JSON.stringify(mediaType)} should be rejected`);
    }
    assert.equal(await WatchHistoryEntry.countDocuments({}), 0);

    for (const mediaType of [undefined, null, ""]) {
      const res = await client.post("/api/history", { mediaType, movieId: String(movie._id), watchedAt: "2024-04-01" });
      assert.equal(res.status, 201, `mediaType ${JSON.stringify(mediaType)} should default to movie`);
      assert.equal(res.body.entry.mediaType, "movie");
    }
    assert.equal(await WatchHistoryEntry.countDocuments({ createdBy: user._id, mediaType: "movie" }), 3);
  });

  it("still dual-writes group movie history into Group.movies[]", async () => {
    const { user, token } = await createUser("Owner");
    const { user: friend } = await createUser("Friend");
    const group = await createGroup(user._id, [user._id, friend._id]);
    const movie = await createMovie("Alien");
    const client = api(server, token);

    const created = await client.post("/api/history", {
      movieId: String(movie._id),
      scope: "group",
      groupId: String(group._id),
      participants: [String(user._id), String(friend._id)],
      watchedAt: "2024-04-01",
      watchedLocation: "Cinema",
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.entry.mediaType, "movie");
    assert.equal(created.body.entry.participants.length, 2);

    const refreshed = await Group.findById(group._id).lean();
    assert.equal(refreshed!.movies.length, 1);
    assert.equal(String(refreshed!.movies[0].movieId), String(movie._id));

    const entry = await WatchHistoryEntry.findById(created.body.entry._id).lean();
    assert.equal(String(entry!.legacyGroupId), String(group._id));
    assert.equal(String(entry!.legacyHistoryItemId), String((refreshed!.movies[0] as any)._id));

    const groupList = await client.get(`/api/history/group/${group._id}`);
    assert.equal(groupList.status, 200);
    assert.equal(groupList.body.items.length, 1);

    const deleted = await client.delete(`/api/history/${created.body.entry._id}`);
    assert.equal(deleted.status, 200);
    assert.equal((await Group.findById(group._id).lean())!.movies.length, 0);
  });

  it("surfaces legacy Group.movies[] entries in personal history", async () => {
    const { user, token } = await createUser("Owner");
    const group = await createGroup(user._id, [user._id]);
    const movie = await createMovie("Legacy");
    group.movies.push({ movieId: movie._id, watchedWith: [user._id], watchedDate: new Date("2023-01-01") } as any);
    await group.save();

    const list = await api(server, token).get("/api/history/personal");
    assert.equal(list.status, 200);
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].mediaType, "movie");
    assert.equal(list.body.items[0].movie.title, "Legacy");
  });
});

describe("history API — tv episodes", () => {
  it("creates, reads, updates, rates and deletes a personal episode entry", async () => {
    const { user, token } = await createUser("Alice");
    const client = api(server, token);

    const created = await client.post("/api/history", {
      mediaType: "tv_episode",
      tv: tvEpisode(),
      watchedAt: "2024-04-01",
      watchedLocation: "Couch",
      watchedNotes: "Strong pilot",
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const entry = created.body.entry;
    assert.equal(entry.mediaType, "tv_episode");
    assert.equal(entry.movie, null);
    assert.deepEqual(
      { ...entry.tv, airDate: entry.tv.airDate?.slice(0, 10) },
      {
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
      }
    );
    assert.equal(entry.watchedLocation, "Couch");
    assert.equal(entry.watchedNotes, "Strong pilot");
    assert.equal(entry.participants[0]._id, String(user._id));

    const list = await client.get("/api/history/personal");
    assert.equal(list.status, 200);
    assert.equal(list.body.items[0].mediaType, "tv_episode");
    assert.equal(list.body.items[0].tv.seriesTitle, "Special Ops: Lioness");

    const updated = await client.patch(`/api/history/${entry._id}`, { watchedAt: "2024-04-03", watchedLocation: "Bed", watchedNotes: "" });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.entry.mediaType, "tv_episode");
    assert.equal(updated.body.entry.watchedLocation, "Bed");
    assert.equal(updated.body.entry.tv.episodeNumber, 1);

    const rated = await client.put(`/api/history/${entry._id}/rating`, { rating: 8 });
    assert.equal(rated.status, 200);
    assert.equal(rated.body.entry.currentUserRating, 8);
    assert.equal(rated.body.entry.averageRating, 8);

    const deleted = await client.delete(`/api/history/${entry._id}`);
    assert.equal(deleted.status, 200);
    assert.equal(await WatchHistoryEntry.countDocuments({}), 0);
  });

  it("keeps same-day episodes and same-episode rewatches as separate records", async () => {
    const { user, token } = await createUser();
    const client = api(server, token);
    for (const episodeNumber of [1, 2, 3, 1]) {
      const res = await client.post("/api/history", { mediaType: "tv_episode", tv: tvEpisode({ episodeNumber }), watchedAt: "2024-04-01" });
      assert.equal(res.status, 201);
    }
    assert.equal(await WatchHistoryEntry.countDocuments({ createdBy: user._id, mediaType: "tv_episode" }), 4);
    const list = await client.get("/api/history/personal");
    assert.equal(list.body.items.length, 4);
    assert.equal(list.body.stats.total, 4);
  });

  it("rejects episodes without required identifiers or with a movie reference", async () => {
    const { token } = await createUser();
    const movie = await createMovie();
    const client = api(server, token);

    const missing = await client.post("/api/history", { mediaType: "tv_episode", tv: { seriesTitle: "Nope" } });
    assert.equal(missing.status, 400);
    const noTv = await client.post("/api/history", { mediaType: "tv_episode" });
    assert.equal(noTv.status, 400);
    const noTitle = await client.post("/api/history", { mediaType: "tv_episode", tv: tvEpisode({ seriesTitle: "" }) });
    assert.equal(noTitle.status, 400);
    const fractional = await client.post("/api/history", { mediaType: "tv_episode", tv: tvEpisode({ seasonNumber: "one" }) });
    assert.equal(fractional.status, 400);
    const mixedTv = await client.post("/api/history", { mediaType: "tv_episode", movieId: String(movie._id), tv: tvEpisode() });
    assert.equal(mixedTv.status, 400);
    const mixedMovie = await client.post("/api/history", { mediaType: "movie", movieId: String(movie._id), tv: tvEpisode() });
    assert.equal(mixedMovie.status, 400);
    assert.equal(await WatchHistoryEntry.countDocuments({}), 0);
  });

  it("stores group episodes in WatchHistoryEntry only, never in Group.movies[]", async () => {
    const { user, token } = await createUser("Owner");
    const { user: friend } = await createUser("Friend");
    const group = await createGroup(user._id, [user._id, friend._id]);
    const client = api(server, token);

    const created = await client.post("/api/history", {
      mediaType: "tv_episode",
      tv: tvEpisode(),
      scope: "group",
      groupId: String(group._id),
      participants: [String(user._id), String(friend._id)],
      watchedAt: "2024-04-01",
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.entry.group._id, String(group._id));
    assert.equal(created.body.entry.participants.length, 2);

    assert.equal((await Group.findById(group._id).lean())!.movies.length, 0);
    const entry = await WatchHistoryEntry.findById(created.body.entry._id).lean();
    assert.equal(entry!.legacyGroupId, undefined);
    assert.equal(entry!.legacyHistoryItemId, undefined);

    // Reads (which run the legacy sync) neither duplicate nor drop the episode.
    const groupList = await client.get(`/api/history/group/${group._id}`);
    assert.equal(groupList.body.items.length, 1);
    assert.equal(groupList.body.items[0].mediaType, "tv_episode");
    const friendList = await api(server, (await createUser("X")).token).get("/api/history/personal");
    assert.equal(friendList.body.items.length, 0);

    const updated = await client.patch(`/api/history/${entry!._id}`, {
      watchedAt: "2024-04-02",
      participants: [String(friend._id)],
      watchedLocation: "",
      watchedNotes: "",
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.entry.participants.length, 1);
    assert.equal((await Group.findById(group._id).lean())!.movies.length, 0);

    const deleted = await client.delete(`/api/history/${entry!._id}`);
    assert.equal(deleted.status, 200);
    assert.equal(await WatchHistoryEntry.countDocuments({}), 0);
  });

  it("does not crash search or title sort on mixed history", async () => {
    const { token } = await createUser();
    const movie = await createMovie("Zodiac");
    const client = api(server, token);
    await client.post("/api/history", { movieId: String(movie._id), watchedAt: "2024-04-01" });
    await client.post("/api/history", { mediaType: "tv_episode", tv: tvEpisode(), watchedAt: "2024-04-02" });

    const sorted = await client.get("/api/history/personal?sort=title");
    assert.equal(sorted.status, 200);
    assert.deepEqual(
      sorted.body.items.map((item: any) => item.mediaType),
      ["tv_episode", "movie"]
    );

    const searchTv = await client.get("/api/history/personal?search=lioness");
    assert.equal(searchTv.status, 200);
    assert.equal(searchTv.body.items.length, 1);
    assert.equal(searchTv.body.items[0].mediaType, "tv_episode");

    const searchMovie = await client.get("/api/history/personal?search=zodiac");
    assert.equal(searchMovie.body.items.length, 1);
    assert.equal(searchMovie.body.items[0].mediaType, "movie");

    const rated = await client.get("/api/history/personal?rated=true&year=2024");
    assert.equal(rated.status, 200);
    assert.equal(rated.body.items.length, 0);
  });
});

describe("history API — authorization", () => {
  it("requires a token", async () => {
    const res = await api(server).post("/api/history", { mediaType: "tv_episode", tv: tvEpisode() });
    assert.equal(res.status, 401);
  });

  it("keeps ownership and membership checks for episode entries", async () => {
    const { user: owner, token: ownerToken } = await createUser("Owner");
    const { token: strangerToken } = await createUser("Stranger");
    const owned = await api(server, ownerToken).post("/api/history", { mediaType: "tv_episode", tv: tvEpisode() });
    assert.equal(owned.status, 201);
    const id = owned.body.entry._id;

    const stranger = api(server, strangerToken);
    assert.equal((await stranger.patch(`/api/history/${id}`, { watchedAt: "2024-01-01" })).status, 403);
    assert.equal((await stranger.put(`/api/history/${id}/rating`, { rating: 5 })).status, 403);
    assert.equal((await stranger.delete(`/api/history/${id}`)).status, 403);

    const group = await createGroup(owner._id, [owner._id]);
    const asStranger = await stranger.post("/api/history", {
      mediaType: "tv_episode",
      tv: tvEpisode(),
      scope: "group",
      groupId: String(group._id),
    });
    assert.equal(asStranger.status, 403);
    assert.equal((await stranger.get(`/api/history/group/${group._id}`)).status, 403);
    assert.equal(await WatchHistoryEntry.countDocuments({ scope: "group" }), 0);
  });
});
