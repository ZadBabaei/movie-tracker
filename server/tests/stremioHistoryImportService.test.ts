import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import mongoose from "mongoose";
import Group from "../models/Groups";
import IntegrationMediaState from "../models/IntegrationMediaState";
import Movie from "../models/movie";
import UserIntegration from "../models/UserIntegration";
import WatchHistoryEntry from "../models/WatchHistoryEntry";
import historyRouter from "../routes/historyRoutes";
import { createStremioHistoryImportService } from "../services/integrations/stremioHistoryImportService";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";

let testMongo: IsolatedTestMongo;

before(async () => {
  testMongo = await startIsolatedTestMongo("movie_tracker_stremio_history_import_test");
  await Promise.all([
    UserIntegration.syncIndexes(),
    IntegrationMediaState.syncIndexes(),
    Movie.syncIndexes(),
    WatchHistoryEntry.syncIndexes(),
  ]);
});

afterEach(async () => {
  await Promise.all([
    UserIntegration.deleteMany({}),
    IntegrationMediaState.deleteMany({}),
    Movie.deleteMany({}),
    WatchHistoryEntry.deleteMany({}),
    Group.deleteMany({}),
  ]);
});

after(async () => {
  await testMongo.stop();
});

const fakeCredentialEnvelope = {
  ciphertext: "fake-ciphertext",
  iv: "fake-iv",
  authTag: "fake-auth-tag",
  keyVersion: 1,
};

const watchedAt = new Date("2026-04-05T06:07:08.000Z");

const createIntegration = (userId = new mongoose.Types.ObjectId(), credentialVersion = 2) =>
  UserIntegration.create({
    userId,
    provider: "stremio",
    status: "connected",
    credentialEnvelope: fakeCredentialEnvelope,
    credentialVersion,
  });

const createMovie = (overrides: Record<string, unknown> = {}) =>
  Movie.create({
    imdbID: "tmdb-329865",
    title: "Arrival",
    poster: "/arrival.jpg",
    vote_average: 7.6,
    ...overrides,
  });

const createState = (
  integrationId: mongoose.Types.ObjectId,
  movieId: mongoose.Types.ObjectId,
  overrides: Record<string, unknown> = {}
) =>
  IntegrationMediaState.create({
    integrationId,
    providerMediaType: "movie",
    providerItemId: "tt2543164",
    identifierNamespace: "imdb",
    observedCredentialVersion: 2,
    providerRevision: "2026-12-31T23:59:59.000Z",
    providerLastWatchedAt: watchedAt,
    completed: true,
    removed: false,
    lastSeenAt: new Date("2026-05-06T07:08:09.000Z"),
    timestampConfidence: "provider_last_watched",
    matchStatus: "matched",
    matchedMovieId: movieId,
    matchedTmdbId: 329865,
    importStatus: "pending",
    ...overrides,
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const routeHandler = (method: "patch" | "delete" | "put", path: string) => {
  const layer = (historyRouter as any).stack.find(
    (candidate: any) => candidate.route?.path === path && candidate.route?.methods?.[method]
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const patchHistory = routeHandler("patch", "/:historyEntryId");
const deleteHistory = routeHandler("delete", "/:historyEntryId");
const rateHistory = routeHandler("put", "/:historyEntryId/rating");

const invokeRoute = async (
  handler: any,
  userId: mongoose.Types.ObjectId,
  historyEntryId: mongoose.Types.ObjectId,
  body: Record<string, unknown> = {}
) => {
  const result: { statusCode: number; body?: any } = { statusCode: 200 };
  const response = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      result.body = payload;
      return this;
    },
  };
  await handler(
    {
      user: { id: userId.toString() },
      params: { historyEntryId: historyEntryId.toString() },
      body,
      query: {},
    },
    response
  );
  return result;
};

test("current matched completed state imports one provenance-linked personal occurrence", async () => {
  const integration = await createIntegration();
  const movie = await createMovie();
  const state = await createState(integration._id, movie._id, {
    removed: true,
    lastErrorCode: "provider_watch_time_unknown",
  });
  const before = state.toObject();
  const importedAt = new Date("2026-06-01T00:00:00.000Z");
  const service = createStremioHistoryImportService({ now: () => importedAt });

  const summary = await service.importCurrentStremioMovies(integration.userId.toString());
  const history = await WatchHistoryEntry.findOne({ movieId: movie._id })
    .select("+integrationMediaStateId");
  const stored = await IntegrationMediaState.findById(state._id);

  assert.deepEqual(summary, {
    examined: 1,
    imported: 1,
    alreadyImported: 0,
    timestampUnavailable: 0,
    invalidMatch: 0,
    skippedStale: 0,
  });
  assert.ok(history);
  assert.equal(history?.integrationMediaStateId?.toString(), state._id.toString());
  assert.equal(history?.movieId.toString(), movie._id.toString());
  assert.equal(history?.scope, "personal");
  assert.equal(history?.createdBy.toString(), integration.userId.toString());
  assert.deepEqual(history?.participants.map(String), [integration.userId.toString()]);
  assert.equal(history?.groupId, undefined);
  assert.equal(history?.legacyGroupId, undefined);
  assert.equal(history?.legacyHistoryItemId, undefined);
  assert.equal(history?.watchedAt.toISOString(), watchedAt.toISOString());
  assert.equal(history?.watchedLocation, "");
  assert.equal(history?.watchedNotes, "");
  assert.deepEqual(history?.ratings, []);
  assert.equal(await Group.countDocuments(), 0);
  assert.equal(stored?.importStatus, "imported");
  assert.equal(stored?.importedHistoryEntryId?.toString(), history?._id.toString());
  assert.equal(stored?.importedAt?.toISOString(), importedAt.toISOString());
  assert.equal(stored?.lastErrorCode, undefined);
  for (const field of [
    "integrationId",
    "providerMediaType",
    "providerItemId",
    "identifierNamespace",
    "providerRevision",
    "providerLastWatchedAt",
    "completed",
    "removed",
    "lastSeenAt",
    "timestampConfidence",
    "observedCredentialVersion",
    "matchStatus",
    "matchedMovieId",
    "matchedTmdbId",
  ] as const) {
    assert.deepEqual(stored?.get(field), before[field]);
  }
});

test("eligibility excludes incomplete, old-generation, unmatched, and suppressed states", async () => {
  const integration = await createIntegration();
  const movie = await createMovie();
  await createState(integration._id, movie._id, {
    providerItemId: "tt1000001",
    completed: false,
  });
  await createState(integration._id, movie._id, {
    providerItemId: "tt1000002",
    observedCredentialVersion: 1,
  });
  await createState(integration._id, movie._id, {
    providerItemId: "tt1000003",
    matchStatus: "unresolved",
    matchedMovieId: undefined,
    matchedTmdbId: undefined,
  });
  await createState(integration._id, movie._id, {
    providerItemId: "tt1000004",
    importStatus: "suppressed",
    suppressionReason: "user_suppressed",
  });

  const summary = await createStremioHistoryImportService()
    .importCurrentStremioMovies(integration.userId.toString());
  assert.equal(summary.examined, 0);
  assert.equal(await WatchHistoryEntry.countDocuments(), 0);
});

test("missing provider watch time stays pending and never falls back to revision or lastSeenAt", async () => {
  const integration = await createIntegration();
  const movie = await createMovie();
  const state = await createState(integration._id, movie._id, {
    providerLastWatchedAt: undefined,
    timestampConfidence: "unknown",
  });

  const summary = await createStremioHistoryImportService()
    .importCurrentStremioMovies(integration.userId.toString());
  const stored = await IntegrationMediaState.findById(state._id);
  assert.equal(summary.timestampUnavailable, 1);
  assert.equal(await WatchHistoryEntry.countDocuments(), 0);
  assert.equal(stored?.importStatus, "pending");
  assert.equal(stored?.lastErrorCode, "provider_watch_time_unknown");
  assert.equal(stored?.providerRevision, "2026-12-31T23:59:59.000Z");
  assert.equal(stored?.lastSeenAt.toISOString(), "2026-05-06T07:08:09.000Z");
});

test("missing or inconsistent canonical Movie leaves import pending", async () => {
  const integration = await createIntegration();
  const missingMovieId = new mongoose.Types.ObjectId();
  const missing = await createState(integration._id, missingMovieId, {
    providerItemId: "tt1000001",
  });
  const movie = await createMovie({ imdbID: "tmdb-999" });
  const inconsistent = await createState(integration._id, movie._id, {
    providerItemId: "tt1000002",
  });

  const summary = await createStremioHistoryImportService()
    .importCurrentStremioMovies(integration.userId.toString());
  assert.equal(summary.invalidMatch, 2);
  assert.equal(await WatchHistoryEntry.countDocuments(), 0);
  for (const id of [missing._id, inconsistent._id]) {
    const stored = await IntegrationMediaState.findById(id);
    assert.equal(stored?.importStatus, "pending");
    assert.equal(stored?.lastErrorCode, "matched_movie_inconsistent");
  }
});

test("manual history is not adopted and repeated runs remain idempotent", async () => {
  const integration = await createIntegration();
  const movie = await createMovie();
  const state = await createState(integration._id, movie._id);
  const manual = await WatchHistoryEntry.create({
    movieId: movie._id,
    scope: "personal",
    createdBy: integration.userId,
    participants: [integration.userId],
    watchedAt,
    watchedLocation: "",
    watchedNotes: "",
    ratings: [],
  });
  const service = createStremioHistoryImportService();
  assert.equal((await service.importCurrentStremioMovies(integration.userId.toString())).imported, 1);
  assert.equal((await service.importCurrentStremioMovies(integration.userId.toString())).examined, 0);

  const histories = await WatchHistoryEntry.find({ movieId: movie._id })
    .select("+integrationMediaStateId");
  assert.equal(histories.length, 2);
  assert.equal(histories.find((entry) => entry._id.equals(manual._id))?.integrationMediaStateId, undefined);
  assert.equal(
    histories.filter((entry) => entry.integrationMediaStateId?.equals(state._id)).length,
    1
  );
});

test("concurrent importers and the provenance index permit only one automatic history", async () => {
  const integration = await createIntegration();
  const movie = await createMovie();
  const state = await createState(integration._id, movie._id);
  const service = createStremioHistoryImportService();
  await Promise.all([
    service.importCurrentStremioMovies(integration.userId.toString()),
    service.importCurrentStremioMovies(integration.userId.toString()),
  ]);
  const stored = await IntegrationMediaState.findById(state._id);
  assert.equal(await WatchHistoryEntry.countDocuments({ integrationMediaStateId: state._id }), 1);
  assert.equal(stored?.importStatus, "imported");

  await assert.rejects(
    WatchHistoryEntry.create({
      movieId: movie._id,
      scope: "personal",
      createdBy: integration.userId,
      participants: [integration.userId],
      watchedAt,
      integrationMediaStateId: state._id,
    }),
    (error: any) => error?.code === 11000
  );
});

test("later provider timestamp changes neither duplicate nor move imported history", async () => {
  const integration = await createIntegration();
  const movie = await createMovie();
  const state = await createState(integration._id, movie._id);
  const service = createStremioHistoryImportService();
  await service.importCurrentStremioMovies(integration.userId.toString());
  const history = await WatchHistoryEntry.findOne({ integrationMediaStateId: state._id });
  assert.ok(history);
  await IntegrationMediaState.updateOne(
    { _id: state._id },
    { $set: { providerLastWatchedAt: new Date("2026-09-09T09:09:09.000Z") } }
  );
  await service.importCurrentStremioMovies(integration.userId.toString());

  const unchanged = await WatchHistoryEntry.findById(history?._id);
  assert.equal(await WatchHistoryEntry.countDocuments({ integrationMediaStateId: state._id }), 1);
  assert.equal(unchanged?.watchedAt.toISOString(), watchedAt.toISOString());
});

test("generation advance during history creation cannot finalize or leave stale history", async () => {
  const integration = await createIntegration();
  const movie = await createMovie();
  const state = await createState(integration._id, movie._id);
  const started = deferred<void>();
  const release = deferred<void>();
  const service = createStremioHistoryImportService({
    createHistoryEntry: async (payload) => {
      started.resolve();
      await release.promise;
      return WatchHistoryEntry.create(payload);
    },
  });
  const running = service.importCurrentStremioMovies(integration.userId.toString());
  await started.promise;
  await UserIntegration.updateOne(
    { _id: integration._id },
    { $inc: { credentialVersion: 1 } }
  );
  await IntegrationMediaState.updateOne(
    { _id: state._id },
    { $set: { observedCredentialVersion: 3 } }
  );
  release.resolve();

  const summary = await running;
  const stored = await IntegrationMediaState.findById(state._id);
  assert.equal(summary.skippedStale, 1);
  assert.equal(await WatchHistoryEntry.countDocuments({ integrationMediaStateId: state._id }), 0);
  assert.equal(stored?.observedCredentialVersion, 3);
  assert.equal(stored?.importStatus, "pending");
  assert.equal(stored?.importedHistoryEntryId, undefined);
});

test("deleting imported history suppresses reimport while deleting manual history does not", async () => {
  const integration = await createIntegration();
  const movie = await createMovie();
  const state = await createState(integration._id, movie._id);
  const service = createStremioHistoryImportService();
  await service.importCurrentStremioMovies(integration.userId.toString());
  const imported = await WatchHistoryEntry.findOne({ integrationMediaStateId: state._id });
  assert.ok(imported);

  const deleted = await invokeRoute(deleteHistory, integration.userId, imported!._id);
  assert.equal(deleted.statusCode, 200);
  let stored = await IntegrationMediaState.findById(state._id);
  assert.equal(stored?.importStatus, "suppressed");
  assert.equal(stored?.suppressionReason, "local_history_deleted");
  assert.equal(stored?.importedHistoryEntryId, undefined);
  assert.equal((await service.importCurrentStremioMovies(integration.userId.toString())).examined, 0);
  assert.equal(await WatchHistoryEntry.countDocuments(), 0);

  const manual = await WatchHistoryEntry.create({
    movieId: movie._id,
    scope: "personal",
    createdBy: integration.userId,
    participants: [integration.userId],
    watchedAt,
  });
  const unrelatedState = await createState(integration._id, movie._id, {
    providerItemId: "tt1000009",
  });
  assert.equal((await invokeRoute(deleteHistory, integration.userId, manual._id)).statusCode, 200);
  const unrelatedStored = await IntegrationMediaState.findById(unrelatedState._id);
  assert.equal(unrelatedStored?.importStatus, "pending");
  assert.equal(unrelatedStored?.suppressionReason, undefined);
});

test("imported history remains editable and rateable without creating another occurrence", async () => {
  const integration = await createIntegration();
  const movie = await createMovie();
  const state = await createState(integration._id, movie._id);
  await createStremioHistoryImportService()
    .importCurrentStremioMovies(integration.userId.toString());
  const history = await WatchHistoryEntry.findOne({ integrationMediaStateId: state._id });
  assert.ok(history);

  const editedAt = "2026-07-08T09:10:11.000Z";
  const edit = await invokeRoute(patchHistory, integration.userId, history!._id, {
    watchedAt: editedAt,
    watchedLocation: "Cinema",
    watchedNotes: "Edited locally",
  });
  const rating = await invokeRoute(rateHistory, integration.userId, history!._id, { rating: 8 });
  const stored = await WatchHistoryEntry.findById(history!._id);
  assert.equal(edit.statusCode, 200);
  assert.equal(rating.statusCode, 200);
  assert.equal("integrationMediaStateId" in edit.body.entry, false);
  assert.equal("integrationMediaStateId" in rating.body.entry, false);
  assert.equal(stored?.watchedAt.toISOString(), editedAt);
  assert.equal(stored?.watchedLocation, "Cinema");
  assert.equal(stored?.watchedNotes, "Edited locally");
  assert.equal(stored?.ratings.length, 1);
  assert.equal(stored?.ratings[0].rating, 8);
  assert.equal(await WatchHistoryEntry.countDocuments({ integrationMediaStateId: state._id }), 1);
  assert.equal(await Group.countDocuments(), 0);
});
