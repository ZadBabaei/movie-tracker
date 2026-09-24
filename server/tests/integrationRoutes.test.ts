import assert from "node:assert/strict";
import { test } from "node:test";
import { createIntegrationRouter } from "../routes/integrationRoutes";
import { StremioIntegrationService } from "../services/integrations/stremioIntegrationService";
import { StremioClientError } from "../services/integrations/stremioClient";
import {
  StremioPipelineError,
  StremioPipelineService,
} from "../services/integrations/stremioPipelineService";

const userId = "64b64b64b64b64b64b64b64b";

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

const serviceWith = (
  overrides: Partial<StremioIntegrationService> = {}
): StremioIntegrationService => ({
  listForUser: async () => [],
  connect: async () => ({
    provider: "stremio",
    status: "connected",
    connected: true,
    lastSyncStartedAt: null,
    lastSyncCompletedAt: null,
    lastSuccessfulSyncAt: null,
    lastSyncStatus: null,
    lastErrorCode: null,
  }),
  disconnect: async () => ({
    provider: "stremio",
    status: "disconnected",
    connected: false,
    remoteRevocationConfirmed: true,
  }),
  markReauthRequired: async () => false,
  ...overrides,
});

const pipelineWith = (
  override?: StremioPipelineService["syncCurrentStremioIntegration"]
): StremioPipelineService => ({
  syncCurrentStremioIntegration:
    override ??
    (async () => ({
      provider: "stremio",
      status: "success",
      snapshot: {
        snapshotItems: 1,
        movieStates: 1,
        ignoredItems: 0,
        observed: 1,
        upserted: 1,
        matched: 0,
        modified: 0,
      },
      matching: {
        examined: 1,
        matched: 1,
        movieMissing: 0,
        unsupported: 0,
        retryableErrors: 0,
        skippedStale: 0,
      },
      import: {
        examined: 1,
        imported: 1,
        alreadyImported: 0,
        timestampUnavailable: 0,
        invalidMatch: 0,
        skippedStale: 0,
      },
    })),
});

const handler = (router: ReturnType<typeof createIntegrationRouter>, path: string, method: string, index = -1) => {
  const layer: any = (router as any).stack.find(
    (candidate: any) => candidate.route?.path === path && candidate.route?.methods?.[method]
  );
  const stack = layer.route.stack;
  return stack[index < 0 ? stack.length - 1 : index].handle;
};

test("integration routes reject unauthenticated requests", async () => {
  const router = createIntegrationRouter({ lifecycleService: serviceWith() });
  for (const [path, method] of [
    ["/", "get"],
    ["/stremio/connect", "post"],
    ["/stremio/sync", "post"],
    ["/stremio", "delete"],
  ] as const) {
    const authenticate = handler(router, path, method, 0);
    const res = response();
    let continued = false;
    await authenticate({ headers: {} }, res, () => {
      continued = true;
    });

    assert.equal(res.state.statusCode, 401);
    assert.equal(continued, false);
  }
});

test("GET lists only the authenticated user's sanitized integrations", async () => {
  let requestedUserId = "";
  const router = createIntegrationRouter({
    lifecycleService: serviceWith({
      listForUser: async (value) => {
        requestedUserId = value;
        return [
          {
            provider: "stremio",
            status: "connected",
            connected: true,
            lastSyncStartedAt: null,
            lastSyncCompletedAt: null,
            lastSuccessfulSyncAt: null,
            lastSyncStatus: null,
            lastErrorCode: null,
          },
        ];
      },
    }),
  });
  const res = response();
  await handler(router, "/", "get")({ user: { id: userId }, body: {} }, res);

  assert.equal(requestedUserId, userId);
  assert.equal(JSON.stringify(res.state.body).includes("credentialEnvelope"), false);
});

test("connect validates input and ignores any body userId", async () => {
  let connectedUserId = "";
  const router = createIntegrationRouter({
    lifecycleService: serviceWith({
      connect: async (value) => {
        connectedUserId = value;
        return serviceWith().connect(value, "", "");
      },
    }),
  });
  const connect = handler(router, "/stremio/connect", "post");
  const malformed = response();
  await connect({ user: { id: userId }, body: { email: "bad", password: "" } }, malformed);
  assert.equal(malformed.state.statusCode, 400);

  const valid = response();
  await connect({
    user: { id: userId },
    body: {
      userId: "another-user",
      email: "person@example.test",
      password: "fake-password",
    },
  }, valid);
  assert.equal(connectedUserId, userId);
  assert.equal(JSON.stringify(valid.state.body).includes("credentialEnvelope"), false);
});

test("connect provider failures are sanitized", async () => {
  const fakeSecret = "secret-that-must-not-leak";
  const router = createIntegrationRouter({
    lifecycleService: serviceWith({
      connect: async () => {
        throw new StremioClientError("invalid_credentials");
      },
    }),
  });
  const res = response();
  await handler(router, "/stremio/connect", "post")(
    {
      user: { id: userId },
      body: { email: "person@example.test", password: fakeSecret },
    },
    res
  );

  assert.equal(res.state.statusCode, 401);
  assert.equal(res.state.body.code, "invalid_credentials");
  assert.equal(JSON.stringify(res.state.body).includes(fakeSecret), false);
});

test("disconnect uses the authenticated user and returns no credential data", async () => {
  let disconnectedUserId = "";
  const router = createIntegrationRouter({
    lifecycleService: serviceWith({
      disconnect: async (value) => {
        disconnectedUserId = value;
        return {
          provider: "stremio",
          status: "disconnected",
          connected: false,
          remoteRevocationConfirmed: false,
        };
      },
    }),
  });
  const res = response();
  await handler(router, "/stremio", "delete")(
    { user: { id: userId }, body: { userId: "another-user" } },
    res
  );

  assert.equal(disconnectedUserId, userId);
  assert.equal(JSON.stringify(res.state.body).includes("credential"), false);
});

test("manual sync uses only the authenticated user and returns a bounded summary", async () => {
  let synchronizedUserId = "";
  const router = createIntegrationRouter({
    lifecycleService: serviceWith(),
    pipelineService: pipelineWith(async (value) => {
      synchronizedUserId = value;
      return pipelineWith().syncCurrentStremioIntegration(value);
    }),
  });
  const res = response();
  await handler(router, "/stremio/sync", "post")(
    {
      user: { id: userId },
      body: { userId: "another-user", integrationId: "another-integration" },
    },
    res
  );

  assert.equal(synchronizedUserId, userId);
  assert.equal(res.state.statusCode, 200);
  assert.deepEqual(Object.keys(res.state.body), ["provider", "status", "snapshot", "matching", "import"]);
  assert.equal(
    /integrationId|credential|authKey|password|raw/i.test(JSON.stringify(res.state.body)),
    false
  );
});

test("manual sync maps stable pipeline failures without exposing lower-level details", async () => {
  const cases = [
    ["stremio_not_connected", 409],
    ["stremio_reauth_required", 401],
    ["stremio_provider_unavailable", 503],
    ["integration_changed", 409],
    ["stremio_sync_failed", 500],
  ] as const;

  for (const [code, status] of cases) {
    const router = createIntegrationRouter({
      lifecycleService: serviceWith(),
      pipelineService: pipelineWith(async () => {
        throw new StremioPipelineError(code);
      }),
    });
    const res = response();
    await handler(router, "/stremio/sync", "post")({ user: { id: userId }, body: {} }, res);
    assert.equal(res.state.statusCode, status);
    assert.equal(res.state.body.code, code);
  }

  const router = createIntegrationRouter({
    lifecycleService: serviceWith(),
    pipelineService: pipelineWith(async () => {
      throw new Error("database details that must not leak");
    }),
  });
  const res = response();
  await handler(router, "/stremio/sync", "post")({ user: { id: userId }, body: {} }, res);
  assert.equal(res.state.statusCode, 500);
  assert.equal(JSON.stringify(res.state.body).includes("database details"), false);
});
