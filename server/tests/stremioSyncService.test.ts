import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, afterEach, before, test } from "node:test";
import mongoose from "mongoose";
import IntegrationMediaState from "../models/IntegrationMediaState";
import UserIntegration from "../models/UserIntegration";
import { createCredentialCrypto } from "../services/integrations/credentialCrypto";
import { createStremioIntegrationService } from "../services/integrations/stremioIntegrationService";
import {
  StremioClientError,
  StremioConnectionClient,
  StremioLibraryItemDto,
  StremioSnapshotClient,
} from "../services/integrations/stremioClient";
import {
  createStremioSyncService,
  ingestStremioMovieStates,
  StremioSyncError,
} from "../services/integrations/stremioSyncService";
import { normalizeStremioMovieSnapshot } from "../services/integrations/stremioSnapshot";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";

let testMongo: IsolatedTestMongo;
const cryptoService = createCredentialCrypto({
  INTEGRATION_ENCRYPTION_ACTIVE_KEY_VERSION: "1",
  INTEGRATION_ENCRYPTION_KEY_V1: crypto.randomBytes(32).toString("base64"),
});

before(async () => {
  testMongo = await startIsolatedTestMongo("movie_tracker_stremio_sync_test");
  await UserIntegration.syncIndexes();
  await IntegrationMediaState.syncIndexes();
});

afterEach(async () => {
  await Promise.all([UserIntegration.deleteMany({}), IntegrationMediaState.deleteMany({})]);
});

after(async () => {
  await testMongo.stop();
});

const movieItem = (overrides: Partial<StremioLibraryItemDto> = {}): StremioLibraryItemDto => ({
  id: "tt1234567",
  type: "movie",
  removed: false,
  revision: "revision-1",
  state: { timesWatched: 1, lastWatched: "2026-01-01T00:00:00.000Z" },
  ...overrides,
});

const createConnectedIntegration = async (
  userId: mongoose.Types.ObjectId,
  authKey = "old-fake-auth-key"
) =>
  UserIntegration.create({
    userId,
    provider: "stremio",
    status: "connected",
    credentialEnvelope: cryptoService.encryptCredential(authKey),
    credentialVersion: 1,
  });

const snapshotClient = (
  getLibrarySnapshot: StremioSnapshotClient["getLibrarySnapshot"]
): StremioSnapshotClient => ({ getLibrarySnapshot });

const lifecycleClient = ({
  login = async () => ({ authKey: "new-fake-auth-key" }),
  logout = async () => ({ revoked: true as const }),
}: Partial<StremioConnectionClient> = {}): StremioConnectionClient => ({ login, logout });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("first, repeated, and changed snapshots upsert one normalized provider state", async () => {
  const userId = new mongoose.Types.ObjectId();
  const integration = await createConnectedIntegration(userId);
  let snapshot = [movieItem()];
  const service = createStremioSyncService({
    client: snapshotClient(async () => snapshot),
    cryptoService,
  });

  const first = await service.sync(userId.toString());
  await service.sync(userId.toString());
  assert.equal(first.status, "success");
  assert.equal(await IntegrationMediaState.countDocuments({ integrationId: integration._id }), 1);

  snapshot = [
    movieItem({
      removed: true,
      revision: "revision-2",
      state: { timesWatched: 1, lastWatched: "2026-02-01T00:00:00.000Z" },
    }),
  ];
  await service.sync(userId.toString());
  const state = await IntegrationMediaState.findOne({ integrationId: integration._id });
  assert.equal(state?.providerRevision, "revision-2");
  assert.equal(state?.removed, true);
  assert.equal(state?.completed, true);
  assert.equal(state?.providerLastWatchedAt?.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal("rawProvider" in state!.toObject(), false);
  assert.equal("name" in state!.toObject(), false);

  const updatedIntegration = await UserIntegration.findById(integration._id);
  assert.equal(updatedIntegration?.lastSyncStatus, "success");
  assert.ok(updatedIntegration?.lastSyncStartedAt);
  assert.ok(updatedIntegration?.lastSyncCompletedAt);
  assert.ok(updatedIntegration?.lastSuccessfulSyncAt);
  assert.equal(updatedIntegration?.lastErrorCode, undefined);
});

test("provider refresh preserves every matching/import pipeline field", async () => {
  const userId = new mongoose.Types.ObjectId();
  const integration = await createConnectedIntegration(userId);
  const service = createStremioSyncService({
    client: snapshotClient(async () => [movieItem()]),
    cryptoService,
  });
  await service.sync(userId.toString());

  const movieId = new mongoose.Types.ObjectId();
  const historyId = new mongoose.Types.ObjectId();
  const importedAt = new Date("2026-03-01T00:00:00.000Z");
  await IntegrationMediaState.updateOne(
    { integrationId: integration._id },
    {
      $set: {
        matchStatus: "matched",
        matchedMovieId: movieId,
        matchedTmdbId: 123,
        importStatus: "suppressed",
        importedHistoryEntryId: historyId,
        importedAt,
        suppressionReason: "user_suppressed",
      },
    }
  );

  await service.sync(userId.toString());
  const state = await IntegrationMediaState.findOne({ integrationId: integration._id });
  assert.equal(state?.matchStatus, "matched");
  assert.equal(state?.matchedMovieId?.toString(), movieId.toString());
  assert.equal(state?.matchedTmdbId, 123);
  assert.equal(state?.importStatus, "suppressed");
  assert.equal(state?.importedHistoryEntryId?.toString(), historyId.toString());
  assert.equal(state?.importedAt?.toISOString(), importedAt.toISOString());
  assert.equal(state?.suppressionReason, "user_suppressed");
});

test("missing snapshot items remain intact and removed rows cannot erase prior completion", async () => {
  const integrationId = new mongoose.Types.ObjectId();
  const firstSeen = new Date("2026-01-01T00:00:00.000Z");
  const secondSeen = new Date("2026-02-01T00:00:00.000Z");
  const initial = normalizeStremioMovieSnapshot([
    movieItem({ id: "tt1234567" }),
    movieItem({ id: "tt7654321" }),
  ]);
  await ingestStremioMovieStates(integrationId, initial, firstSeen);

  const refresh = normalizeStremioMovieSnapshot([
    movieItem({
      id: "tt1234567",
      removed: true,
      state: { timesWatched: 0, lastWatched: undefined },
    }),
  ]);
  await ingestStremioMovieStates(integrationId, refresh, secondSeen);

  const present = await IntegrationMediaState.findOne({ integrationId, providerItemId: "tt1234567" });
  const absent = await IntegrationMediaState.findOne({ integrationId, providerItemId: "tt7654321" });
  assert.equal(present?.removed, true);
  assert.equal(present?.completed, true);
  assert.equal(present?.lastSeenAt.toISOString(), secondSeen.toISOString());
  assert.equal(absent?.completed, true);
  assert.equal(absent?.removed, false);
  assert.equal(absent?.lastSeenAt.toISOString(), firstSeen.toISOString());
});

test("concurrent state ingestion and identical syncs do not duplicate provider identities", async () => {
  const integrationId = new mongoose.Types.ObjectId();
  const normalized = normalizeStremioMovieSnapshot([movieItem()]);
  await Promise.all([
    ingestStremioMovieStates(integrationId, normalized, new Date()),
    ingestStremioMovieStates(integrationId, normalized, new Date()),
  ]);
  assert.equal(await IntegrationMediaState.countDocuments({ integrationId }), 1);

  await IntegrationMediaState.deleteMany({ integrationId });
  const userId = new mongoose.Types.ObjectId();
  const integration = await createConnectedIntegration(userId);
  const service = createStremioSyncService({
    client: snapshotClient(async () => [movieItem()]),
    cryptoService,
  });
  await Promise.all([service.sync(userId.toString()), service.sync(userId.toString())]);
  assert.equal(await IntegrationMediaState.countDocuments({ integrationId: integration._id }), 1);
});

test("provider failure records failed sync metadata without deleting a valid credential", async () => {
  const userId = new mongoose.Types.ObjectId();
  const integration = await createConnectedIntegration(userId);
  const service = createStremioSyncService({
    client: snapshotClient(async () => {
      throw new StremioClientError("network_error");
    }),
    cryptoService,
  });

  await assert.rejects(service.sync(userId.toString()), (error: unknown) =>
    error instanceof StremioClientError && error.code === "network_error"
  );
  const stored = await UserIntegration.findById(integration._id).select("+credentialEnvelope");
  assert.equal(stored?.status, "connected");
  assert.ok(stored?.credentialEnvelope);
  assert.equal(stored?.lastSyncStatus, "failed");
  assert.equal(stored?.lastErrorCode, "network_error");
  assert.ok(stored?.lastSyncStartedAt);
  assert.ok(stored?.lastSyncCompletedAt);
  assert.equal(stored?.lastSuccessfulSyncAt, undefined);
});

test("invalid session clears only the currently used credential", async () => {
  const userId = new mongoose.Types.ObjectId();
  const integration = await createConnectedIntegration(userId);
  const service = createStremioSyncService({
    client: snapshotClient(async () => {
      throw new StremioClientError("invalid_session");
    }),
    cryptoService,
  });

  await assert.rejects(service.sync(userId.toString()));
  const stored = await UserIntegration.findById(integration._id).select("+credentialEnvelope");
  assert.equal(stored?.status, "reauth_required");
  assert.equal(stored?.credentialEnvelope, undefined);
  assert.equal(stored?.lastSyncStatus, "failed");
  assert.equal(stored?.lastErrorCode, "provider_session_invalid");
});

test("stale invalid-session response cannot erase a newer reconnect", async () => {
  const userId = new mongoose.Types.ObjectId();
  const integration = await createConnectedIntegration(userId);
  const requestStarted = deferred<void>();
  const releaseRequest = deferred<void>();
  const syncService = createStremioSyncService({
    client: snapshotClient(async () => {
      requestStarted.resolve();
      await releaseRequest.promise;
      throw new StremioClientError("invalid_session");
    }),
    cryptoService,
  });
  const lifecycle = createStremioIntegrationService({
    client: lifecycleClient(),
    cryptoService,
  });

  const oldSync = syncService.sync(userId.toString());
  await requestStarted.promise;
  await lifecycle.connect(userId.toString(), "person@example.test", "new-password");
  releaseRequest.resolve();
  await assert.rejects(oldSync);

  const stored = await UserIntegration.findById(integration._id).select("+credentialEnvelope");
  assert.equal(stored?.status, "connected");
  assert.equal(stored?.credentialVersion, 2);
  assert.equal(cryptoService.decryptCredential(stored!.credentialEnvelope!), "new-fake-auth-key");
  assert.notEqual(stored?.lastErrorCode, "provider_session_invalid");
});

test("disconnect during sync cannot resurrect the integration or its credential", async () => {
  const userId = new mongoose.Types.ObjectId();
  const integration = await createConnectedIntegration(userId);
  const requestStarted = deferred<void>();
  const releaseRequest = deferred<StremioLibraryItemDto[]>();
  const syncService = createStremioSyncService({
    client: snapshotClient(async () => {
      requestStarted.resolve();
      return releaseRequest.promise;
    }),
    cryptoService,
  });
  const lifecycle = createStremioIntegrationService({
    client: lifecycleClient(),
    cryptoService,
  });

  const oldSync = syncService.sync(userId.toString());
  await requestStarted.promise;
  await lifecycle.disconnect(userId.toString());
  releaseRequest.resolve([movieItem()]);
  await assert.rejects(
    oldSync,
    (error: unknown) => error instanceof StremioSyncError && error.code === "integration_changed"
  );

  const stored = await UserIntegration.findById(integration._id).select("+credentialEnvelope");
  assert.equal(stored?.status, "disconnected");
  assert.equal(stored?.credentialEnvelope, undefined);
  assert.equal(await IntegrationMediaState.countDocuments({ integrationId: integration._id }), 0);
});
