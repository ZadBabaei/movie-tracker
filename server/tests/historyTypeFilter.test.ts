import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import WatchHistoryEntry from "../models/WatchHistoryEntry";
import historyRoutes from "../routes/historyRoutes";
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

const day = (value: string) => new Date(`${value}T00:00:00Z`);

const addMovie = async (userId: mongoose.Types.ObjectId, title: string, watchedAt: string, extra: Record<string, unknown> = {}) => {
  const movie = await createMovie(title);
  return WatchHistoryEntry.create({ mediaType: "movie", movieId: movie._id, scope: "personal", createdBy: userId, watchedAt: day(watchedAt), ...extra });
};

const addEpisode = (userId: mongoose.Types.ObjectId, episodeNumber: number, watchedAt: string, extra: Record<string, unknown> = {}) =>
  WatchHistoryEntry.create({
    mediaType: "tv_episode",
    tv: tvEpisode({ episodeNumber, episodeTmdbId: 4321000 + episodeNumber }),
    scope: "personal",
    createdBy: userId,
    watchedAt: day(watchedAt),
    ...extra,
  });

// Pre-TV documents have no mediaType field at all.
const addLegacyMovie = async (userId: mongoose.Types.ObjectId, title: string, watchedAt: string) => {
  const movie = await createMovie(title);
  await mongoose.connection.db!.collection("watchhistoryentries").insertOne({
    movieId: movie._id,
    scope: "personal",
    createdBy: userId,
    participants: [userId],
    watchedAt: day(watchedAt),
    watchedLocation: "",
    watchedNotes: "",
    ratings: [],
  });
};

const titles = (body: any) => body.items.map((item: any) => item.movie?.title ?? `E${item.tv.episodeNumber}`);

describe("GET /api/history/personal type filter", () => {
  it("returns everything by default and for type=all", async () => {
    const { user, token } = await createUser();
    await addMovie(user._id, "Heat", "2024-03-01");
    await addEpisode(user._id, 1, "2024-04-01");
    const client = api(server, token);

    const implicit = await client.get("/api/history/personal");
    const explicit = await client.get("/api/history/personal?type=all");
    assert.equal(implicit.status, 200);
    assert.deepEqual(titles(implicit.body), ["E1", "Heat"]);
    assert.deepEqual(titles(explicit.body), ["E1", "Heat"]);
    assert.equal(explicit.body.stats.total, 2);
  });

  it("type=movie returns only movies, including legacy rows without mediaType", async () => {
    const { user, token } = await createUser();
    await addMovie(user._id, "Heat", "2024-03-01");
    await addLegacyMovie(user._id, "Alien", "2024-02-01");
    await addEpisode(user._id, 1, "2024-04-01");

    const { status, body } = await api(server, token).get("/api/history/personal?type=movie");
    assert.equal(status, 200);
    assert.deepEqual(titles(body), ["Heat", "Alien"]);
    assert.ok(body.items.every((item: any) => item.mediaType === "movie" && item.tv === null));
    assert.equal(body.stats.total, 2);
  });

  it("type=tv returns only episodes with season and episode info", async () => {
    const { user, token } = await createUser();
    await addMovie(user._id, "Heat", "2024-03-01");
    await addEpisode(user._id, 1, "2024-04-01");
    await addEpisode(user._id, 2, "2024-04-02");

    const { body } = await api(server, token).get("/api/history/personal?type=tv");
    assert.deepEqual(titles(body), ["E2", "E1"]);
    assert.ok(body.items.every((item: any) => item.mediaType === "tv_episode" && item.movie === null));
    assert.deepEqual(
      body.items.map((item: any) => [item.tv.seasonNumber, item.tv.episodeNumber]),
      [[1, 2], [1, 1]]
    );
    assert.equal(body.stats.total, 2);
  });

  it("keeps newest-first ordering within each filter, ties broken by newest _id", async () => {
    const { user, token } = await createUser();
    await addMovie(user._id, "Old", "2024-01-01");
    await addMovie(user._id, "SameDayFirst", "2024-05-01");
    await addMovie(user._id, "SameDaySecond", "2024-05-01");
    await addEpisode(user._id, 1, "2024-03-01");
    await addEpisode(user._id, 2, "2024-06-01");

    const client = api(server, token);
    assert.deepEqual(titles((await client.get("/api/history/personal?type=movie")).body), ["SameDaySecond", "SameDayFirst", "Old"]);
    assert.deepEqual(titles((await client.get("/api/history/personal?type=tv")).body), ["E2", "E1"]);
    assert.deepEqual(titles((await client.get("/api/history/personal")).body), ["E2", "SameDaySecond", "SameDayFirst", "E1", "Old"]);
  });

  it("returns an empty page with a zero total when nothing matches", async () => {
    const { user, token } = await createUser();
    await addMovie(user._id, "Heat", "2024-03-01");
    const client = api(server, token);

    const tv = await client.get("/api/history/personal?type=tv");
    assert.equal(tv.status, 200);
    assert.deepEqual(tv.body.items, []);
    assert.equal(tv.body.nextCursor, null);
    assert.equal(tv.body.stats.total, 0);

    const month = await client.get("/api/history/personal?type=tv&monthPage=1");
    assert.deepEqual(month.body.items, []);
    assert.equal(month.body.stats.total, 0);
    assert.equal(month.body.monthPagination.totalPages, 1);
  });

  it("rejects an unknown type", async () => {
    const { token } = await createUser();
    const { status } = await api(server, token).get("/api/history/personal?type=anime");
    assert.equal(status, 400);
  });

  it("paginates by cursor over the filtered set only", async () => {
    const { user, token } = await createUser();
    // Movies interleaved with episodes: a cursor page must never be padded
    // with, or shortened by, the other type.
    for (let index = 1; index <= 5; index += 1) {
      await addEpisode(user._id, index, `2024-04-0${index}`);
      await addMovie(user._id, `Movie ${index}`, `2024-04-0${index}`);
    }
    const client = api(server, token);

    const first = await client.get("/api/history/personal?type=tv&limit=2");
    assert.deepEqual(titles(first.body), ["E5", "E4"]);
    assert.ok(first.body.nextCursor);
    assert.equal(first.body.stats.total, 5);

    const second = await client.get(`/api/history/personal?type=tv&limit=2&cursor=${first.body.nextCursor}`);
    assert.deepEqual(titles(second.body), ["E3", "E2"]);

    const third = await client.get(`/api/history/personal?type=tv&limit=2&cursor=${second.body.nextCursor}`);
    assert.deepEqual(titles(third.body), ["E1"]);
    assert.equal(third.body.nextCursor, null);

    const movies = await client.get("/api/history/personal?type=movie&limit=3");
    assert.deepEqual(titles(movies.body), ["Movie 5", "Movie 4", "Movie 3"]);
    assert.equal(movies.body.stats.total, 5);
  });

  it("computes month pages and totals over the filtered set", async () => {
    const { user, token } = await createUser();
    // Movies span 14 months; episodes only 2. Month pages hold 12 months.
    for (let month = 1; month <= 12; month += 1) {
      await addMovie(user._id, `Movie 2023-${month}`, `2023-${String(month).padStart(2, "0")}-10`);
    }
    await addMovie(user._id, "Movie 2022-12", "2022-12-10");
    await addMovie(user._id, "Movie 2022-11", "2022-11-10");
    await addEpisode(user._id, 1, "2023-06-05");
    await addEpisode(user._id, 2, "2023-07-05");
    const client = api(server, token);

    const movies1 = await client.get("/api/history/personal?type=movie&monthPage=1");
    assert.equal(movies1.body.monthPagination.totalPages, 2);
    assert.equal(movies1.body.items.length, 12);
    assert.equal(movies1.body.stats.total, 14);
    const movies2 = await client.get("/api/history/personal?type=movie&monthPage=2");
    assert.deepEqual(titles(movies2.body), ["Movie 2022-12", "Movie 2022-11"]);

    const tv = await client.get("/api/history/personal?type=tv&monthPage=1");
    assert.equal(tv.body.monthPagination.totalPages, 1);
    assert.deepEqual(titles(tv.body), ["E2", "E1"]);
    assert.equal(tv.body.stats.total, 2);
    // Requesting a page past the end of the filtered set clamps to its last page.
    const clamped = await client.get("/api/history/personal?type=tv&monthPage=2");
    assert.equal(clamped.body.monthPagination.page, 1);
    assert.deepEqual(titles(clamped.body), ["E2", "E1"]);
  });

  it("combines with search", async () => {
    const { user, token } = await createUser();
    await addMovie(user._id, "Lioness Rising", "2024-03-01");
    await addEpisode(user._id, 1, "2024-04-01");
    await addMovie(user._id, "Heat", "2024-05-01");
    const client = api(server, token);

    assert.deepEqual(titles((await client.get("/api/history/personal?search=lioness")).body), ["E1", "Lioness Rising"]);
    assert.deepEqual(titles((await client.get("/api/history/personal?search=lioness&type=movie")).body), ["Lioness Rising"]);
    assert.deepEqual(titles((await client.get("/api/history/personal?search=lioness&type=tv")).body), ["E1"]);
    assert.deepEqual((await client.get("/api/history/personal?search=heat&type=tv")).body.items, []);
  });

  it("never leaks another user's entries through the filter", async () => {
    const { user, token } = await createUser("Owner");
    const { user: other } = await createUser("Other");
    await addEpisode(user._id, 1, "2024-04-01");
    await addEpisode(other._id, 2, "2024-04-02");
    await addMovie(other._id, "Private", "2024-04-03");

    const client = api(server, token);
    assert.deepEqual(titles((await client.get("/api/history/personal?type=tv")).body), ["E1"]);
    assert.deepEqual((await client.get("/api/history/personal?type=movie")).body.items, []);
  });

  it("includes Stremio-imported rows of both types", async () => {
    const { user, token } = await createUser();
    await addMovie(user._id, "Imported Movie", "2024-03-01", { integrationMediaStateId: new mongoose.Types.ObjectId() });
    await addEpisode(user._id, 7, "2024-03-02", { integrationMediaStateId: new mongoose.Types.ObjectId() });
    const client = api(server, token);

    assert.deepEqual(titles((await client.get("/api/history/personal?type=movie")).body), ["Imported Movie"]);
    const tv = await client.get("/api/history/personal?type=tv");
    assert.deepEqual(titles(tv.body), ["E7"]);
    assert.equal(tv.body.items[0].tv.seasonNumber, 1);
  });

  it("reflects edits and deletes in the filtered list and total", async () => {
    const { user, token } = await createUser();
    const movieEntry = await addMovie(user._id, "Heat", "2024-03-01");
    const episode1 = await addEpisode(user._id, 1, "2024-04-01");
    await addEpisode(user._id, 2, "2024-04-02");
    const client = api(server, token);

    const edited = await client.patch(`/api/history/${episode1._id}`, { watchedAt: "2024-06-01", watchedNotes: "rewatch" });
    assert.equal(edited.status, 200);
    assert.deepEqual(titles((await client.get("/api/history/personal?type=tv")).body), ["E1", "E2"]);

    const deleted = await client.delete(`/api/history/${episode1._id}`);
    assert.equal(deleted.status, 200);
    const afterDelete = await client.get("/api/history/personal?type=tv");
    assert.deepEqual(titles(afterDelete.body), ["E2"]);
    assert.equal(afterDelete.body.stats.total, 1);

    await client.delete(`/api/history/${movieEntry._id}`);
    const movies = await client.get("/api/history/personal?type=movie");
    assert.deepEqual(movies.body.items, []);
    assert.equal(movies.body.stats.total, 0);
  });
});

describe("GET /api/history/group/:groupId type filter", () => {
  it("filters group history and keeps membership checks", async () => {
    const { user, token } = await createUser("Member");
    const { token: outsiderToken } = await createUser("Outsider");
    const group = await createGroup(user._id, [user._id]);
    const movie = await createMovie("Group Movie");
    await WatchHistoryEntry.create({ mediaType: "movie", movieId: movie._id, scope: "group", groupId: group._id, createdBy: user._id, watchedAt: day("2024-03-01") });
    await addEpisode(user._id, 3, "2024-04-01", { scope: "group", groupId: group._id });

    const client = api(server, token);
    assert.deepEqual(titles((await client.get(`/api/history/group/${group._id}?type=movie`)).body), ["Group Movie"]);
    const tv = await client.get(`/api/history/group/${group._id}?type=tv`);
    assert.deepEqual(titles(tv.body), ["E3"]);
    assert.equal(tv.body.stats.total, 1);
    assert.equal((await api(server, outsiderToken).get(`/api/history/group/${group._id}?type=tv`)).status, 403);
  });
});
