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

const LIONESS = 199925;
const SEVERANCE = 95396;

const seedPersonal = async (userId: mongoose.Types.ObjectId, overrides: Record<string, unknown>, watchedAt: string) =>
  WatchHistoryEntry.create({
    mediaType: "tv_episode",
    scope: "personal",
    createdBy: userId,
    participants: [userId],
    watchedAt: new Date(watchedAt),
    tv: tvEpisode(overrides),
  });

describe("GET /api/history/tv/:seriesTmdbId", () => {
  it("requires authentication", async () => {
    const response = await api(server).get(`/api/history/tv/${LIONESS}`);
    assert.equal(response.status, 401);
  });

  it("rejects malformed series ids without querying", async () => {
    const { token } = await createUser();
    for (const bad of ["abc", "0", "-5", "1.5", "12abc", "99999999999999999999"]) {
      const response = await api(server, token).get(`/api/history/tv/${encodeURIComponent(bad)}`);
      assert.equal(response.status, 400, `expected 400 for ${bad}`);
    }
    const unknownScope = await api(server, token).get(`/api/history/tv/${LIONESS}?scope=everyone`);
    assert.equal(unknownScope.status, 400);
  });

  it("returns only this user's occurrences of the requested series, never movies or other series", async () => {
    const { user, token } = await createUser("Zad");
    const { user: other } = await createUser("Other");
    const movie = await createMovie("Heat");
    await WatchHistoryEntry.create({ movieId: movie._id, scope: "personal", createdBy: user._id, participants: [user._id], watchedAt: new Date("2024-06-01") });
    await seedPersonal(user._id, { seriesTmdbId: SEVERANCE, seriesTitle: "Severance" }, "2024-06-02");
    await seedPersonal(other._id, {}, "2024-06-03"); // same series, different user
    const mine = await seedPersonal(user._id, { episodeNumber: 2 }, "2024-05-10");

    const response = await api(server, token).get(`/api/history/tv/${LIONESS}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.scope, "personal");
    assert.equal(response.body.groupId, null);
    assert.deepEqual(response.body.items.map((item: any) => item._id), [String(mine._id)]);
    assert.equal(response.body.items[0].mediaType, "tv_episode");
    assert.equal(response.body.items[0].movie, null);
  });

  it("keeps repeated watches of the same episode as distinct records in deterministic order", async () => {
    const { user, token } = await createUser();
    const first = await seedPersonal(user._id, { episodeNumber: 3 }, "2024-05-10T00:00:00Z");
    const rewatchSameDay = await seedPersonal(user._id, { episodeNumber: 3 }, "2024-05-10T00:00:00Z");
    const later = await seedPersonal(user._id, { episodeNumber: 3, seasonNumber: 2 }, "2024-05-20T00:00:00Z");
    const early = await seedPersonal(user._id, { episodeNumber: 1 }, "2024-05-01T00:00:00Z");

    const response = await api(server, token).get(`/api/history/tv/${LIONESS}?scope=personal`);
    assert.equal(response.status, 200);
    const ids = response.body.items.map((item: any) => item._id);
    // watchedAt DESC, then _id DESC for the same-day rewatch pair.
    assert.deepEqual(ids, [String(later._id), String(rewatchSameDay._id), String(first._id), String(early._id)]);
    assert.equal(new Set(ids).size, 4);

    const snapshot = response.body.items[2].tv;
    assert.deepEqual(snapshot, {
      seriesTmdbId: LIONESS,
      seasonNumber: 1,
      episodeNumber: 3,
      episodeTmdbId: 4321001,
      seriesTitle: "Special Ops: Lioness",
      episodeTitle: "Sacrificial Soldiers",
      posterPath: "/lioness-poster.jpg",
      backdropPath: "/lioness-backdrop.jpg",
      stillPath: "/lioness-s01e01.jpg",
      airDate: "2023-07-23T00:00:00.000Z",
    });

    assert.deepEqual(response.body.stats, {
      watchCount: 4,
      uniqueEpisodes: 3, // S1E3 (twice), S2E3, S1E1
      seasonsWatched: 2,
      firstWatchedAt: "2024-05-01T00:00:00.000Z",
      latestWatchedAt: "2024-05-20T00:00:00.000Z",
      truncated: false,
    });
  });

  it("returns an empty, well-formed payload for a series with no occurrences", async () => {
    const { token } = await createUser();
    const response = await api(server, token).get(`/api/history/tv/${SEVERANCE}`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.items, []);
    assert.equal(response.body.stats.watchCount, 0);
    assert.equal(response.body.stats.firstWatchedAt, null);
  });

  it("returns a group's series history to members only, with group id validation", async () => {
    const { user: creator, token: creatorToken } = await createUser("Creator");
    const { user: member, token: memberToken } = await createUser("Member");
    const { token: outsiderToken } = await createUser("Outsider");
    const group = await createGroup(creator._id, [creator._id, member._id]);
    const otherGroup = await createGroup(creator._id, [creator._id]);

    const groupWatch = await WatchHistoryEntry.create({
      mediaType: "tv_episode",
      scope: "group",
      groupId: group._id,
      createdBy: creator._id,
      participants: [creator._id, member._id],
      watchedAt: new Date("2024-07-01"),
      tv: tvEpisode({ episodeNumber: 5 }),
    });
    await WatchHistoryEntry.create({
      mediaType: "tv_episode",
      scope: "group",
      groupId: otherGroup._id,
      createdBy: creator._id,
      participants: [creator._id],
      watchedAt: new Date("2024-07-02"),
      tv: tvEpisode({ episodeNumber: 6 }),
    });
    await seedPersonal(member._id, { episodeNumber: 7 }, "2024-07-03");

    const asMember = await api(server, memberToken).get(`/api/history/tv/${LIONESS}?scope=group&groupId=${group._id}`);
    assert.equal(asMember.status, 200);
    assert.equal(asMember.body.scope, "group");
    assert.equal(asMember.body.groupId, String(group._id));
    assert.deepEqual(asMember.body.items.map((item: any) => item._id), [String(groupWatch._id)]);
    assert.equal(asMember.body.items[0].group?.name, group.name);

    const asOutsider = await api(server, outsiderToken).get(`/api/history/tv/${LIONESS}?scope=group&groupId=${group._id}`);
    assert.equal(asOutsider.status, 403);

    const missingGroup = await api(server, creatorToken).get(`/api/history/tv/${LIONESS}?scope=group&groupId=${new mongoose.Types.ObjectId()}`);
    assert.equal(missingGroup.status, 404);

    const badGroup = await api(server, creatorToken).get(`/api/history/tv/${LIONESS}?scope=group&groupId=not-an-id`);
    assert.equal(badGroup.status, 400);
    const noGroup = await api(server, creatorToken).get(`/api/history/tv/${LIONESS}?scope=group`);
    assert.equal(noGroup.status, 400);

    // Personal scope follows the personal page: rows the member took part in, whatever their scope.
    const personal = await api(server, memberToken).get(`/api/history/tv/${LIONESS}`);
    assert.equal(personal.body.items.length, 2); // group watch (member participated) + own personal watch
    assert.ok(personal.body.items.every((item: any) => item.tv.seriesTmdbId === LIONESS));
  });
});
