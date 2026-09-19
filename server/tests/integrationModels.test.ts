import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import mongoose from "mongoose";
import IntegrationMediaState from "../models/IntegrationMediaState";
import UserIntegration from "../models/UserIntegration";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";

let testMongo: IsolatedTestMongo;

before(async () => {
  testMongo = await startIsolatedTestMongo("movie_tracker_integration_models_test");
  await UserIntegration.syncIndexes();
  await IntegrationMediaState.syncIndexes();
});

afterEach(async () => {
  await Promise.all([UserIntegration.deleteMany({}), IntegrationMediaState.deleteMany({})]);
});

after(async () => {
  await testMongo.stop();
});

const fakeCredentialEnvelope = {
  ciphertext: "fake-ciphertext-for-tests-only",
  iv: "fake-iv",
  authTag: "fake-auth-tag",
  keyVersion: 1,
};

const integrationInput = (overrides: Record<string, unknown> = {}) => ({
  userId: new mongoose.Types.ObjectId(),
  provider: "stremio",
  status: "connected",
  credentialEnvelope: fakeCredentialEnvelope,
  ...overrides,
});

const stateInput = (integrationId: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) => ({
  integrationId,
  providerMediaType: "movie",
  providerItemId: "tt1234567",
  identifierNamespace: "imdb",
  providerRevision: "opaque-revision-token",
  completed: true,
  removed: false,
  lastSeenAt: new Date("2026-09-19T12:00:00.000Z"),
  matchStatus: "unresolved",
  importStatus: "pending",
  ...overrides,
});

test("UserIntegration accepts a connected Stremio integration with a fake credential envelope", async () => {
  const integration = await UserIntegration.create(integrationInput());

  assert.equal(integration.provider, "stremio");
  assert.equal(integration.status, "connected");
  assert.equal(integration.credentialEnvelope?.keyVersion, 1);
  assert.equal(integration.credentialVersion, 0);
});

test("legacy integration documents without credentialVersion hydrate with generation zero", async () => {
  const userId = new mongoose.Types.ObjectId();
  await UserIntegration.collection.insertOne({
    userId,
    provider: "stremio",
    status: "connected",
    credentialEnvelope: fakeCredentialEnvelope,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const integration = await UserIntegration.findOne({ userId }).select("+credentialEnvelope");
  assert.equal(integration?.credentialVersion, 0);
});

test("UserIntegration enforces one provider connection per user", async () => {
  const userId = new mongoose.Types.ObjectId();
  await UserIntegration.create(integrationInput({ userId }));

  await assert.rejects(
    UserIntegration.create(integrationInput({ userId })),
    (error: any) => error?.code === 11000
  );
});

test("UserIntegration validates statuses and permits disconnected integrations without credentials", async () => {
  await assert.rejects(
    new UserIntegration(integrationInput({ status: "invalid" })).validate(),
    /status/
  );

  const disconnected = await UserIntegration.create(
    integrationInput({ status: "disconnected", credentialEnvelope: undefined })
  );
  assert.equal(disconnected.credentialEnvelope, undefined);
});

test("UserIntegration enforces lifecycle credential invariants when the envelope is selected", async () => {
  await assert.rejects(
    new UserIntegration(
      integrationInput({ status: "connected", credentialEnvelope: undefined })
    ).validate(),
    /require a credential envelope/
  );
  await assert.rejects(
    new UserIntegration(
      integrationInput({ status: "disconnected", credentialEnvelope: fakeCredentialEnvelope })
    ).validate(),
    /cannot retain a credential envelope/
  );

  const connected = await UserIntegration.create(integrationInput());
  const ordinaryRead = await UserIntegration.findById(connected._id);
  assert.equal(ordinaryRead?.credentialEnvelope, undefined);
  ordinaryRead!.lastErrorCode = "transient_provider_error";
  await ordinaryRead!.save();
});

test("UserIntegration has no plaintext password or auth-key fields", async () => {
  assert.equal(UserIntegration.schema.path("password"), undefined);
  assert.equal(UserIntegration.schema.path("authKey"), undefined);

  const integration = new UserIntegration({
    ...integrationInput(),
    password: "must-not-persist",
    authKey: "must-not-persist",
  });
  const storedShape = integration.toObject() as unknown as Record<string, unknown>;
  assert.equal(storedShape.password, undefined);
  assert.equal(storedShape.authKey, undefined);
});

test("credential envelope fields are bounded and validated", async () => {
  await assert.rejects(
    new UserIntegration(
      integrationInput({
        credentialEnvelope: { ...fakeCredentialEnvelope, keyVersion: 1.5 },
      })
    ).validate(),
    /keyVersion/
  );
  await assert.rejects(
    new UserIntegration(
      integrationInput({
        credentialEnvelope: { ...fakeCredentialEnvelope, iv: "x".repeat(257) },
      })
    ).validate(),
    /iv/
  );
});

test("IntegrationMediaState accepts movie and future TV episode states", async () => {
  const integrationId = new mongoose.Types.ObjectId();
  const movie = await IntegrationMediaState.create(stateInput(integrationId));
  const episode = await IntegrationMediaState.create(
    stateInput(integrationId, {
      providerMediaType: "tv_episode",
      providerItemId: "tt1234567:1:2",
      identifierNamespace: "provider",
    })
  );

  assert.equal(movie.providerMediaType, "movie");
  assert.equal(episode.providerMediaType, "tv_episode");
});

test("IntegrationMediaState enforces provider identity within an integration", async () => {
  const integrationId = new mongoose.Types.ObjectId();
  await IntegrationMediaState.create(stateInput(integrationId));

  await assert.rejects(
    IntegrationMediaState.create(stateInput(integrationId)),
    (error: any) => error?.code === 11000
  );
});

test("integration and namespace both participate in provider identity", async () => {
  const firstIntegrationId = new mongoose.Types.ObjectId();
  const secondIntegrationId = new mongoose.Types.ObjectId();
  await IntegrationMediaState.create(stateInput(firstIntegrationId));
  await IntegrationMediaState.create(stateInput(secondIntegrationId));
  await IntegrationMediaState.create(
    stateInput(firstIntegrationId, { identifierNamespace: "provider" })
  );

  assert.equal(await IntegrationMediaState.countDocuments(), 3);
});

test("completed and removed are independent and may both be true", async () => {
  const state = await IntegrationMediaState.create(
    stateInput(new mongoose.Types.ObjectId(), { completed: true, removed: true })
  );

  assert.equal(state.completed, true);
  assert.equal(state.removed, true);
});

test("history import reference is optional and unique when present", async () => {
  const historyEntryId = new mongoose.Types.ObjectId();
  const withoutHistory = await IntegrationMediaState.create(
    stateInput(new mongoose.Types.ObjectId())
  );
  assert.equal(withoutHistory.importedHistoryEntryId, undefined);

  await IntegrationMediaState.create(
    stateInput(new mongoose.Types.ObjectId(), {
      importedHistoryEntryId: historyEntryId,
      importStatus: "imported",
    })
  );
  await assert.rejects(
    IntegrationMediaState.create(
      stateInput(new mongoose.Types.ObjectId(), {
        importedHistoryEntryId: historyEntryId,
        importStatus: "imported",
      })
    ),
    (error: any) => error?.code === 11000
  );
});

test("suppression status supports bounded policy reasons", async () => {
  const state = await IntegrationMediaState.create(
    stateInput(new mongoose.Types.ObjectId(), {
      importStatus: "suppressed",
      suppressionReason: "local_history_deleted",
    })
  );
  assert.equal(state.suppressionReason, "local_history_deleted");

  await assert.rejects(
    new IntegrationMediaState(
      stateInput(new mongoose.Types.ObjectId(), {
        importStatus: "suppressed",
        suppressionReason: "arbitrary-provider-payload",
      })
    ).validate(),
    /suppressionReason/
  );
});

test("IntegrationMediaState rejects invalid enums and malformed TMDB IDs", async () => {
  await assert.rejects(
    new IntegrationMediaState(
      stateInput(new mongoose.Types.ObjectId(), { matchStatus: "unknown_status" })
    ).validate(),
    /matchStatus/
  );
  await assert.rejects(
    new IntegrationMediaState(
      stateInput(new mongoose.Types.ObjectId(), { matchedTmdbId: 0 })
    ).validate(),
    /matchedTmdbId/
  );
  await assert.rejects(
    new IntegrationMediaState(
      stateInput(new mongoose.Types.ObjectId(), { matchedTmdbId: 1.5 })
    ).validate(),
    /matchedTmdbId/
  );
});

test("provider revisions remain opaque strings", async () => {
  const state = await IntegrationMediaState.create(
    stateInput(new mongoose.Types.ObjectId(), { providerRevision: "etag/W/abc-123" })
  );

  assert.equal(state.providerRevision, "etag/W/abc-123");
  assert.equal(IntegrationMediaState.schema.path("providerRevision")?.instance, "String");
});

test("raw provider payloads and rewatch counters are not schema fields", async () => {
  for (const field of ["rawProvider", "providerPayload", "timesWatched", "rewatchCount", "watchOrdinal"]) {
    assert.equal(IntegrationMediaState.schema.path(field), undefined);
  }

  const state = new IntegrationMediaState({
    ...stateInput(new mongoose.Types.ObjectId()),
    rawProvider: { private: "must-not-persist" },
    timesWatched: 99,
  });
  const storedShape = state.toObject() as unknown as Record<string, unknown>;
  assert.equal(storedShape.rawProvider, undefined);
  assert.equal(storedShape.timesWatched, undefined);
});
