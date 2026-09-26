import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, afterEach, before, test } from "node:test";
import mongoose from "mongoose";
import IntegrationMediaState from "../models/IntegrationMediaState";
import Movie from "../models/movie";
import UserIntegration from "../models/UserIntegration";
import WatchHistoryEntry from "../models/WatchHistoryEntry";
import { createCredentialCrypto } from "../services/integrations/credentialCrypto";
import {
  createStremioHistoryImportService,
  suppressStremioImportAfterHistoryDelete,
} from "../services/integrations/stremioHistoryImportService";
import { createStremioMovieMatchService } from "../services/integrations/stremioMovieMatchService";
import {
  createStremioPipelineService,
  StremioPipelineError,
} from "../services/integrations/stremioPipelineService";
import { StremioClientError, StremioLibraryItemDto } from "../services/integrations/stremioClient";
import { createStremioSyncService } from "../services/integrations/stremioSyncService";
import { createTmdbMovieResolver } from "../services/integrations/tmdbMovieResolver";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";

let testMongo: IsolatedTestMongo;

before(async () => {
  testMongo = await startIsolatedTestMongo("movie_tracker_stremio_pipeline_test");
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
  ]);
});

after(async () => {
  await testMongo.stop();
});

const credentialCrypto = createCredentialCrypto({
  INTEGRATION_ENCRYPTION_ACTIVE_KEY_VERSION: "1",
  INTEGRATION_ENCRYPTION_KEY_V1: crypto.randomBytes(32).toString("base64"),
});
const snapshot: StremioLibraryItemDto[] = [
  {
    id: "tt2543164",
    type: "movie",
    removed: false,
    revision: "2026-09-24T12:00:00.000Z",
    state: { timesWatched: 1, lastWatched: "2026-09-24T11:00:00.000Z" },
  },
  {
    id: "tt1111111",
    type: "movie",
    removed: false,
    revision: "2026-09-24T12:00:01.000Z",
    state: { timesWatched: 1, lastWatched: "2026-09-23T11:00:00.000Z" },
  },
  {
    id: "tt2222222",
    type: "movie",
    removed: false,
    revision: "2026-09-24T12:00:02.000Z",
    state: { timesWatched: 1, lastWatched: "2026-09-22T11:00:00.000Z" },
  },
];
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

const createIntegration = (credentialVersion = 1) => UserIntegration.create({
  userId: new mongoose.Types.ObjectId(),
  provider: "stremio",
  status: "connected",
  credentialEnvelope: credentialCrypto.encryptCredential("test-auth-key"),
  credentialVersion,
});

const createRealStages = ({
  snapshotResult = snapshot,
  snapshotFailure,
}: {
  snapshotResult?: StremioLibraryItemDto[];
  snapshotFailure?: unknown;
} = {}) => {
  const snapshotService = createStremioSyncService({
    client: {
      getLibrarySnapshot: async () => {
        if (snapshotFailure) throw snapshotFailure;
        return snapshotResult;
      },
    },
    cryptoService: credentialCrypto,
  });
  const matchingService = createStremioMovieMatchService({
    resolver: createTmdbMovieResolver({
      apiKey: "test-tmdb-api-key",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("tt1111111")) {
          return new Response(JSON.stringify({ movie_results: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("tt2222222")) {
          return new Response(JSON.stringify({ status: "rate limited" }), { status: 429 });
        }
        return new Response(JSON.stringify({
          movie_results: [{
            id: 329865,
            title: "Arrival",
            poster_path: "/arrival.jpg",
            vote_average: 7.6,
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }),
  });
  const importService = createStremioHistoryImportService();
  return { snapshotService, matchingService, importService };
};

test("real pipeline normalizes, matches, imports, and remains idempotent", async () => {
  const integration = await createIntegration();
  await UserIntegration.updateOne(
    { _id: integration._id },
    { $set: { lastSyncStatus: "failed", lastErrorCode: "previous_failure" } }
  );
  const service = createStremioPipelineService(createRealStages());

  const first = await service.syncCurrentStremioIntegration(integration.userId.toString());
  const afterFirst = await UserIntegration.findById(integration._id);
  assert.equal(afterFirst?.lastSyncStatus, "success");
  assert.ok(afterFirst?.lastSyncStartedAt);
  assert.ok(afterFirst?.lastSyncCompletedAt);
  assert.equal(
    afterFirst?.lastSuccessfulSyncAt?.toISOString(),
    afterFirst?.lastSyncCompletedAt?.toISOString()
  );
  assert.equal(afterFirst?.lastErrorCode, undefined);
  const second = await service.syncCurrentStremioIntegration(integration.userId.toString());
  const state = await IntegrationMediaState.findOne({
    integrationId: integration._id,
    providerItemId: "tt2543164",
  });
  const movie = await Movie.findOne({ imdbID: "tmdb-329865" });
  const history = await WatchHistoryEntry.findOne({ integrationMediaStateId: state?._id })
    .select("+integrationMediaStateId");

  assert.equal(first.snapshot.movieStates, 3);
  assert.equal(first.matching.matched, 1);
  assert.equal(first.matching.movieMissing, 1);
  assert.equal(first.matching.retryableErrors, 1);
  assert.equal(first.import.imported, 1);
  assert.equal(second.status, "success");
  assert.equal(
    /credentialVersion|integrationId|credential|authKey/i.test(JSON.stringify(first)),
    false
  );
  assert.equal(state?.matchStatus, "matched");
  assert.equal(state?.importStatus, "imported");
  assert.equal(state?.matchedTmdbId, 329865);
  assert.equal(movie?.imdbID, "tmdb-329865");
  assert.equal(history?.movieId?.toString(), movie?._id.toString());
  assert.equal(await IntegrationMediaState.countDocuments(), 3);
  assert.equal(await Movie.countDocuments(), 1);
  assert.equal(await WatchHistoryEntry.countDocuments(), 1);

  assert.ok(history);
  await history.deleteOne();
  assert.equal(await suppressStremioImportAfterHistoryDelete(history), true);
  const afterDeletion = await service.syncCurrentStremioIntegration(
    integration.userId.toString()
  );
  const suppressed = await IntegrationMediaState.findById(state?._id);
  assert.equal(afterDeletion.status, "success");
  assert.equal(suppressed?.importStatus, "suppressed");
  assert.equal(suppressed?.suppressionReason, "local_history_deleted");
  assert.equal(await WatchHistoryEntry.countDocuments(), 0);
});

test("two concurrent real pipeline runs converge without duplicates", async () => {
  const integration = await createIntegration();
  const service = createStremioPipelineService(createRealStages());
  const results = await Promise.all([
    service.syncCurrentStremioIntegration(integration.userId.toString()),
    service.syncCurrentStremioIntegration(integration.userId.toString()),
  ]);

  assert.deepEqual(results.map((result) => result.status), ["success", "success"]);
  assert.equal(await IntegrationMediaState.countDocuments(), 3);
  assert.equal(await Movie.countDocuments({ imdbID: "tmdb-329865" }), 1);
  assert.equal(await WatchHistoryEntry.countDocuments(), 1);
  const state = await IntegrationMediaState.findOne({
    integrationId: integration._id,
    providerItemId: "tt2543164",
  });
  assert.equal(state?.matchStatus, "matched");
  assert.equal(state?.importStatus, "imported");
  const storedIntegration = await UserIntegration.findById(integration._id);
  assert.equal(storedIntegration?.lastSyncStatus, "success");
  assert.ok(storedIntegration?.lastSyncCompletedAt);
  assert.equal(
    storedIntegration?.lastSuccessfulSyncAt?.toISOString(),
    storedIntegration?.lastSyncCompletedAt?.toISOString()
  );
});

test("fatal matching and import failures finalize the full pipeline as failed", async () => {
  for (const failingStage of ["matching", "import"] as const) {
    const integration = await createIntegration();
    const previousSuccess = new Date("2026-01-02T03:04:05.000Z");
    await UserIntegration.updateOne(
      { _id: integration._id },
      {
        $set: {
          lastSyncStatus: "success",
          lastSyncCompletedAt: previousSuccess,
          lastSuccessfulSyncAt: previousSuccess,
        },
      }
    );
    const stages = createRealStages({ snapshotResult: [snapshot[0]] });
    const service = createStremioPipelineService({
      ...stages,
      matchingService: failingStage === "matching"
        ? { matchCurrentStremioMovies: async () => { throw new Error("matching database detail"); } }
        : stages.matchingService,
      importService: failingStage === "import"
        ? { importCurrentStremioMovies: async () => { throw new Error("import database detail"); } }
        : stages.importService,
    });

    await assert.rejects(
      service.syncCurrentStremioIntegration(integration.userId.toString()),
      (error: unknown) =>
        error instanceof StremioPipelineError && error.code === "stremio_sync_failed"
    );
    const stored = await UserIntegration.findById(integration._id);
    assert.equal(stored?.lastSyncStatus, "failed");
    assert.ok(stored?.lastSyncStartedAt);
    assert.ok(stored?.lastSyncCompletedAt);
    assert.equal(stored?.lastSuccessfulSyncAt?.toISOString(), previousSuccess.toISOString());
    assert.equal(stored?.lastErrorCode, "stremio_sync_failed");

    await Promise.all([
      UserIntegration.deleteMany({}),
      IntegrationMediaState.deleteMany({}),
      Movie.deleteMany({}),
      WatchHistoryEntry.deleteMany({}),
    ]);
  }
});

test("reconnect after snapshot prevents old-generation matching and import", async () => {
  const integration = await createIntegration();
  const stages = createRealStages();
  const snapshotCompleted = deferred<void>();
  const continuePipeline = deferred<void>();
  let matchingCalled = false;
  let importCalled = false;
  const service = createStremioPipelineService({
    snapshotService: {
      sync: async (userId) => {
        const result = await stages.snapshotService.sync(userId);
        snapshotCompleted.resolve();
        await continuePipeline.promise;
        return result;
      },
    },
    matchingService: {
      matchCurrentStremioMovies: async () => {
        matchingCalled = true;
        throw new Error("must not run");
      },
    },
    importService: {
      importCurrentStremioMovies: async () => {
        importCalled = true;
        throw new Error("must not run");
      },
    },
  });

  const running = service.syncCurrentStremioIntegration(integration.userId.toString());
  const expectedFailure = assert.rejects(
    running,
    (error: unknown) =>
      error instanceof StremioPipelineError && error.code === "integration_changed"
  );
  await snapshotCompleted.promise;
  await UserIntegration.updateOne(
    { _id: integration._id },
    {
      $set: {
        status: "connected",
        credentialEnvelope: credentialCrypto.encryptCredential("new-test-auth-key"),
        lastSyncCompletedAt: new Date("2026-08-01T00:00:00.000Z"),
        lastSyncStatus: "failed",
        lastErrorCode: "new_generation_state",
      },
      $inc: { credentialVersion: 1 },
    }
  );
  continuePipeline.resolve();
  await expectedFailure;

  const storedIntegration = await UserIntegration.findById(integration._id)
    .select("+credentialEnvelope");
  const state = await IntegrationMediaState.findOne({
    integrationId: integration._id,
    providerItemId: "tt2543164",
  });
  assert.equal(matchingCalled, false);
  assert.equal(importCalled, false);
  assert.equal(storedIntegration?.status, "connected");
  assert.equal(storedIntegration?.credentialVersion, 2);
  assert.ok(storedIntegration?.credentialEnvelope);
  assert.equal(storedIntegration?.lastSyncStatus, "failed");
  assert.equal(storedIntegration?.lastErrorCode, "new_generation_state");
  assert.equal(
    storedIntegration?.lastSyncCompletedAt?.toISOString(),
    "2026-08-01T00:00:00.000Z"
  );
  assert.equal(state?.observedCredentialVersion, 1);
  assert.equal(state?.matchStatus, "unresolved");
  assert.equal(await Movie.countDocuments(), 0);
  assert.equal(await WatchHistoryEntry.countDocuments(), 0);
});

test("disconnect after snapshot fails the pipeline before later stages", async () => {
  const integration = await createIntegration();
  const stages = createRealStages();
  const snapshotCompleted = deferred<void>();
  const continuePipeline = deferred<void>();
  let matchingCalled = false;
  let importCalled = false;
  const service = createStremioPipelineService({
    snapshotService: {
      sync: async (userId) => {
        const result = await stages.snapshotService.sync(userId);
        snapshotCompleted.resolve();
        await continuePipeline.promise;
        return result;
      },
    },
    matchingService: {
      matchCurrentStremioMovies: async () => {
        matchingCalled = true;
        throw new Error("must not run");
      },
    },
    importService: {
      importCurrentStremioMovies: async () => {
        importCalled = true;
        throw new Error("must not run");
      },
    },
  });

  const running = service.syncCurrentStremioIntegration(integration.userId.toString());
  const expectedFailure = assert.rejects(
    running,
    (error: unknown) =>
      error instanceof StremioPipelineError && error.code === "integration_changed"
  );
  await snapshotCompleted.promise;
  await UserIntegration.updateOne(
    { _id: integration._id },
    { $set: { status: "disconnected" }, $unset: { credentialEnvelope: 1 } }
  );
  continuePipeline.resolve();
  await expectedFailure;

  const storedIntegration = await UserIntegration.findById(integration._id)
    .select("+credentialEnvelope");
  assert.equal(matchingCalled, false);
  assert.equal(importCalled, false);
  assert.equal(storedIntegration?.status, "disconnected");
  assert.equal(storedIntegration?.credentialEnvelope, undefined);
  assert.equal(await Movie.countDocuments(), 0);
  assert.equal(await WatchHistoryEntry.countDocuments(), 0);
});

test("reconnect during matching stops import and cannot match the old generation", async () => {
  const integration = await createIntegration();
  const stages = createRealStages({ snapshotResult: [snapshot[0]] });
  const lookupStarted = deferred<void>();
  const releaseLookup = deferred<void>();
  let importCalled = false;
  const matchingService = createStremioMovieMatchService({
    resolver: {
      resolveByImdbId: async () => {
        lookupStarted.resolve();
        await releaseLookup.promise;
        return {
          tmdbId: 329865,
          title: "Arrival",
          posterPath: "/arrival.jpg",
          voteAverage: 7.6,
        };
      },
    },
  });
  const service = createStremioPipelineService({
    snapshotService: stages.snapshotService,
    matchingService,
    importService: {
      importCurrentStremioMovies: async () => {
        importCalled = true;
        throw new Error("must not run");
      },
    },
  });

  const running = service.syncCurrentStremioIntegration(integration.userId.toString());
  const expectedFailure = assert.rejects(
    running,
    (error: unknown) =>
      error instanceof StremioPipelineError && error.code === "integration_changed"
  );
  await lookupStarted.promise;
  await UserIntegration.updateOne(
    { _id: integration._id },
    {
      $set: {
        credentialEnvelope: credentialCrypto.encryptCredential("new-test-auth-key"),
        lastSyncCompletedAt: new Date("2026-08-02T00:00:00.000Z"),
        lastSyncStatus: "failed",
        lastErrorCode: "new_generation_state",
      },
      $inc: { credentialVersion: 1 },
    }
  );
  releaseLookup.resolve();
  await expectedFailure;

  const state = await IntegrationMediaState.findOne({ integrationId: integration._id });
  const storedIntegration = await UserIntegration.findById(integration._id);
  assert.equal(importCalled, false);
  assert.equal(storedIntegration?.lastSyncStatus, "failed");
  assert.equal(storedIntegration?.lastErrorCode, "new_generation_state");
  assert.equal(
    storedIntegration?.lastSyncCompletedAt?.toISOString(),
    "2026-08-02T00:00:00.000Z"
  );
  assert.equal(state?.observedCredentialVersion, 1);
  assert.equal(state?.matchStatus, "unresolved");
  assert.equal(await Movie.countDocuments(), 0);
  assert.equal(await WatchHistoryEntry.countDocuments(), 0);
});

test("reconnect during import removes stale history and fails the old pipeline", async () => {
  const integration = await createIntegration();
  const stages = createRealStages({ snapshotResult: [snapshot[0]] });
  const finalizationStarted = deferred<void>();
  const releaseFinalization = deferred<void>();
  const importService = createStremioHistoryImportService({
    beforeFinalize: async () => {
      finalizationStarted.resolve();
      await releaseFinalization.promise;
    },
  });
  const service = createStremioPipelineService({ ...stages, importService });

  const running = service.syncCurrentStremioIntegration(integration.userId.toString());
  const expectedFailure = assert.rejects(
    running,
    (error: unknown) =>
      error instanceof StremioPipelineError && error.code === "integration_changed"
  );
  await finalizationStarted.promise;
  await UserIntegration.updateOne(
    { _id: integration._id },
    {
      $set: {
        credentialEnvelope: credentialCrypto.encryptCredential("new-test-auth-key"),
        lastSyncCompletedAt: new Date("2026-08-03T00:00:00.000Z"),
        lastSyncStatus: "failed",
        lastErrorCode: "new_generation_state",
      },
      $inc: { credentialVersion: 1 },
    }
  );
  releaseFinalization.resolve();
  await expectedFailure;

  const state = await IntegrationMediaState.findOne({ integrationId: integration._id });
  const storedIntegration = await UserIntegration.findById(integration._id)
    .select("+credentialEnvelope");
  assert.equal(storedIntegration?.status, "connected");
  assert.equal(storedIntegration?.credentialVersion, 2);
  assert.ok(storedIntegration?.credentialEnvelope);
  assert.equal(storedIntegration?.lastSyncStatus, "failed");
  assert.equal(storedIntegration?.lastErrorCode, "new_generation_state");
  assert.equal(
    storedIntegration?.lastSyncCompletedAt?.toISOString(),
    "2026-08-03T00:00:00.000Z"
  );
  assert.equal(state?.importStatus, "pending");
  assert.equal(state?.importedHistoryEntryId, undefined);
  assert.equal(await WatchHistoryEntry.countDocuments(), 0);
});

test("invalid snapshot session requires reauth and never invokes later stages", async () => {
  const integration = await createIntegration();
  const stages = createRealStages({ snapshotFailure: new StremioClientError("invalid_session") });
  let matchingCalled = false;
  let importCalled = false;
  const service = createStremioPipelineService({
    snapshotService: stages.snapshotService,
    matchingService: {
      matchCurrentStremioMovies: async () => {
        matchingCalled = true;
        throw new Error("must not run");
      },
    },
    importService: {
      importCurrentStremioMovies: async () => {
        importCalled = true;
        throw new Error("must not run");
      },
    },
  });

  await assert.rejects(
    service.syncCurrentStremioIntegration(integration.userId.toString()),
    (error: unknown) =>
      error instanceof StremioPipelineError && error.code === "stremio_reauth_required"
  );
  const stored = await UserIntegration.findById(integration._id).select("+credentialEnvelope");
  assert.equal(matchingCalled, false);
  assert.equal(importCalled, false);
  assert.equal(stored?.status, "reauth_required");
  assert.equal(stored?.credentialEnvelope, undefined);
  assert.equal(stored?.lastSyncStatus, "failed");
  assert.ok(stored?.lastSyncCompletedAt);
  assert.equal(stored?.lastErrorCode, "provider_session_invalid");
});
