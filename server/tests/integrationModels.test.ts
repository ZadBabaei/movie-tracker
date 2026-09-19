import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, afterEach, before, test } from "node:test";
import mongoose from "mongoose";
import IntegrationMediaState from "../models/IntegrationMediaState";
import UserIntegration from "../models/UserIntegration";

let mongoProcess: ReturnType<typeof spawn> | undefined;
let mongoDirectory = "";

const reservePort = async () =>
  new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a MongoDB test port."));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

const waitForPort = async (port: number, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for isolated MongoDB test process.");
};

before(async () => {
  const port = await reservePort();
  mongoDirectory = await mkdtemp(path.join(tmpdir(), "movie-tracker-integration-models-"));
  mongoProcess = spawn(
    "mongod",
    ["--dbpath", mongoDirectory, "--port", String(port), "--bind_ip", "127.0.0.1", "--quiet"],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let mongoError = "";
  mongoProcess.stderr?.on("data", (chunk) => {
    mongoError += chunk.toString();
  });
  mongoProcess.once("error", (error) => {
    mongoError += error.message;
  });

  try {
    await waitForPort(port);
    await mongoose.connect(`mongodb://127.0.0.1:${port}/movie_tracker_integration_models_test`);
    await UserIntegration.syncIndexes();
    await IntegrationMediaState.syncIndexes();
  } catch (error) {
    throw new Error(`Failed to start isolated MongoDB: ${mongoError || String(error)}`);
  }
});

afterEach(async () => {
  await Promise.all([UserIntegration.deleteMany({}), IntegrationMediaState.deleteMany({})]);
});

after(async () => {
  await mongoose.disconnect();
  if (mongoProcess && mongoProcess.exitCode === null) {
    const exited = new Promise<void>((resolve) => mongoProcess?.once("exit", () => resolve()));
    mongoProcess.kill();
    await exited;
  }
  if (mongoDirectory) await rm(mongoDirectory, { recursive: true, force: true });
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
