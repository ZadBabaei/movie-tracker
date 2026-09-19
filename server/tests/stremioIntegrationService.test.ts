import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, afterEach, before, test } from "node:test";
import mongoose from "mongoose";
import UserIntegration from "../models/UserIntegration";
import { createCredentialCrypto } from "../services/integrations/credentialCrypto";
import {
  createStremioIntegrationService,
} from "../services/integrations/stremioIntegrationService";
import {
  StremioClientError,
  StremioConnectionClient,
} from "../services/integrations/stremioClient";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";

let testMongo: IsolatedTestMongo;
const cryptoService = createCredentialCrypto({
  INTEGRATION_ENCRYPTION_ACTIVE_KEY_VERSION: "1",
  INTEGRATION_ENCRYPTION_KEY_V1: crypto.randomBytes(32).toString("base64"),
});

before(async () => {
  testMongo = await startIsolatedTestMongo("movie_tracker_integration_lifecycle_test");
  await UserIntegration.syncIndexes();
});

afterEach(async () => {
  await UserIntegration.deleteMany({});
});

after(async () => {
  await testMongo.stop();
});

const clientWith = ({
  login = async () => ({ authKey: "fake-auth-key" }),
  logout = async () => ({ revoked: true as const }),
}: Partial<StremioConnectionClient> = {}): StremioConnectionClient => ({ login, logout });

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("first connection stores only an encrypted envelope and returns sanitized status", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const service = createStremioIntegrationService({
    client: clientWith(),
    cryptoService,
  });

  const result = await service.connect(userId, "person@example.test", "fake-password");
  assert.equal(result.status, "connected");
  assert.equal("credentialEnvelope" in result, false);

  const ordinary = await UserIntegration.findOne({ userId });
  assert.equal(ordinary?.credentialEnvelope, undefined);
  const stored = await UserIntegration.findOne({ userId }).select("+credentialEnvelope");
  assert.ok(stored?.credentialEnvelope);
  assert.notEqual(stored.credentialEnvelope.ciphertext, "fake-auth-key");
  assert.equal(cryptoService.decryptCredential(stored.credentialEnvelope), "fake-auth-key");

  const raw = await mongoose.connection.collection("userintegrations").findOne({
    _id: stored._id,
  });
  const serialized = JSON.stringify(raw);
  assert.equal(serialized.includes("person@example.test"), false);
  assert.equal(serialized.includes("fake-password"), false);
  assert.equal(serialized.includes("fake-auth-key"), false);
});

test("connection service rejects malformed or oversized credentials before provider login", async () => {
  let loginCalled = false;
  const service = createStremioIntegrationService({
    client: clientWith({
      login: async () => {
        loginCalled = true;
        return { authKey: "fake-auth-key" };
      },
    }),
    cryptoService,
  });

  await assert.rejects(
    service.connect(new mongoose.Types.ObjectId().toString(), "invalid-email", "fake-password"),
    /invalid_input/
  );
  await assert.rejects(
    service.connect(
      new mongoose.Types.ObjectId().toString(),
      "person@example.test",
      "x".repeat(1025)
    ),
    /invalid_input/
  );
  assert.equal(loginCalled, false);
});

test("invalid credentials create nothing and failed reconnect preserves the existing credential", async () => {
  const newUserId = new mongoose.Types.ObjectId().toString();
  const invalidClient = clientWith({
    login: async () => {
      throw new StremioClientError("invalid_credentials");
    },
  });
  const invalidService = createStremioIntegrationService({ client: invalidClient, cryptoService });
  await assert.rejects(
    invalidService.connect(newUserId, "person@example.test", "wrong-password"),
    (error: unknown) => error instanceof StremioClientError && error.code === "invalid_credentials"
  );
  assert.equal(await UserIntegration.countDocuments(), 0);

  const existingUserId = new mongoose.Types.ObjectId().toString();
  const workingService = createStremioIntegrationService({
    client: clientWith({ login: async () => ({ authKey: "working-auth-key" }) }),
    cryptoService,
  });
  await workingService.connect(existingUserId, "person@example.test", "working-password");
  const before = await UserIntegration.findOne({ userId: existingUserId }).select("+credentialEnvelope");

  await assert.rejects(
    invalidService.connect(existingUserId, "person@example.test", "wrong-password")
  );
  const after = await UserIntegration.findOne({ userId: existingUserId }).select("+credentialEnvelope");
  assert.equal(
    JSON.stringify(after?.credentialEnvelope),
    JSON.stringify(before?.credentialEnvelope)
  );
  assert.equal(after?.status, "connected");
});

test("successful reconnect replaces the credential, revokes the old session, and keeps one record", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const issuedKeys = ["old-fake-auth-key", "new-fake-auth-key"];
  const revoked: string[] = [];
  const client = clientWith({
    login: async () => ({ authKey: issuedKeys.shift()! }),
    logout: async (authKey) => {
      revoked.push(authKey);
      return { revoked: true };
    },
  });
  const service = createStremioIntegrationService({ client, cryptoService });

  await service.connect(userId, "person@example.test", "first-password");
  await service.connect(userId, "person@example.test", "second-password");

  const stored = await UserIntegration.findOne({ userId }).select("+credentialEnvelope");
  assert.equal(cryptoService.decryptCredential(stored!.credentialEnvelope!), "new-fake-auth-key");
  assert.deepEqual(revoked, ["old-fake-auth-key"]);
  assert.equal(await UserIntegration.countDocuments({ userId }), 1);
});

test("concurrent reconnects revoke every displaced key but never the final stored key", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  await UserIntegration.create({
    userId,
    provider: "stremio",
    status: "connected",
    credentialEnvelope: cryptoService.encryptCredential("old-fake-auth-key"),
  });

  const issuedKeys = ["key-a", "key-b"];
  const revoked: string[] = [];
  const oldRevocationStarted = deferred();
  const releaseOldRevocation = deferred();
  const client = clientWith({
    login: async () => ({ authKey: issuedKeys.shift()! }),
    logout: async (authKey) => {
      if (authKey === "old-fake-auth-key") {
        oldRevocationStarted.resolve();
        await releaseOldRevocation.promise;
      }
      revoked.push(authKey);
      return { revoked: true };
    },
  });
  const service = createStremioIntegrationService({ client, cryptoService });

  const reconnectA = service.connect(userId, "person@example.test", "password-a");
  await oldRevocationStarted.promise;
  const reconnectB = service.connect(userId, "person@example.test", "password-b");
  await reconnectB;
  releaseOldRevocation.resolve();
  await reconnectA;

  const integrations = await UserIntegration.find({ userId }).select("+credentialEnvelope");
  assert.equal(integrations.length, 1);
  const finalAuthKey = cryptoService.decryptCredential(integrations[0].credentialEnvelope!);
  assert.equal(finalAuthKey, "key-b");
  assert.deepEqual(new Set(revoked), new Set(["old-fake-auth-key", "key-a"]));
  assert.equal(revoked.includes(finalAuthKey), false);
});

test("concurrent first connects retain one winner and revoke every superseded key", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const issued = ["first-key-a", "first-key-b"];
  const revoked: string[] = [];
  const client = clientWith({
    login: async () => ({ authKey: issued.shift()! }),
    logout: async (authKey) => {
      revoked.push(authKey);
      return { revoked: true };
    },
  });
  const service = createStremioIntegrationService({ client, cryptoService });

  await Promise.all([
    service.connect(userId, "person@example.test", "password-a"),
    service.connect(userId, "person@example.test", "password-b"),
  ]);

  const integrations = await UserIntegration.find({ userId }).select("+credentialEnvelope");
  assert.equal(integrations.length, 1);
  const finalAuthKey = cryptoService.decryptCredential(integrations[0].credentialEnvelope!);
  const superseded = ["first-key-a", "first-key-b"].filter((key) => key !== finalAuthKey);
  assert.deepEqual(revoked, superseded);
  assert.equal(revoked.includes(finalAuthKey), false);
});

test("old-session revocation failure does not roll back a successful reconnect", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const issuedKeys = ["old-fake-auth-key", "new-fake-auth-key"];
  const client = clientWith({
    login: async () => ({ authKey: issuedKeys.shift()! }),
    logout: async () => {
      throw new StremioClientError("network_error");
    },
  });
  const service = createStremioIntegrationService({ client, cryptoService });
  await service.connect(userId, "person@example.test", "first-password");

  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const result = await service.connect(userId, "person@example.test", "second-password");
    assert.equal(result.status, "connected");
  } finally {
    console.warn = originalWarn;
  }

  const stored = await UserIntegration.findOne({ userId }).select("+credentialEnvelope");
  assert.equal(cryptoService.decryptCredential(stored!.credentialEnvelope!), "new-fake-auth-key");
  assert.equal(stored?.status, "connected");
});

test("disconnect revokes remotely, removes local credentials, and is idempotent", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const revoked: string[] = [];
  const client = clientWith({
    logout: async (authKey) => {
      revoked.push(authKey);
      return { revoked: true };
    },
  });
  const service = createStremioIntegrationService({ client, cryptoService });
  await service.connect(userId, "person@example.test", "fake-password");

  const first = await service.disconnect(userId);
  const second = await service.disconnect(userId);
  const stored = await UserIntegration.findOne({ userId }).select("+credentialEnvelope");

  assert.deepEqual(revoked, ["fake-auth-key"]);
  assert.equal(first.remoteRevocationConfirmed, true);
  assert.equal(second.remoteRevocationConfirmed, false);
  assert.equal(stored?.status, "disconnected");
  assert.equal(stored?.credentialEnvelope, undefined);
});

test("logout failure still destroys the local credential", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const service = createStremioIntegrationService({
    client: clientWith({
      logout: async () => {
        throw new StremioClientError("network_error");
      },
    }),
    cryptoService,
  });
  await service.connect(userId, "person@example.test", "fake-password");

  const originalWarn = console.warn;
  console.warn = () => undefined;
  let result;
  try {
    result = await service.disconnect(userId);
  } finally {
    console.warn = originalWarn;
  }
  const stored = await UserIntegration.findOne({ userId }).select("+credentialEnvelope");
  assert.equal(result!.remoteRevocationConfirmed, false);
  assert.equal(stored?.status, "disconnected");
  assert.equal(stored?.credentialEnvelope, undefined);
});

test("invalid provider sessions transition to reauth_required without retaining credentials", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const service = createStremioIntegrationService({ client: clientWith(), cryptoService });
  await service.connect(userId, "person@example.test", "fake-password");

  await service.markReauthRequired(userId);
  const stored = await UserIntegration.findOne({ userId }).select("+credentialEnvelope");
  assert.equal(stored?.status, "reauth_required");
  assert.equal(stored?.lastErrorCode, "provider_session_invalid");
  assert.equal(stored?.credentialEnvelope, undefined);
});
