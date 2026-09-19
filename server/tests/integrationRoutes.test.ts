import assert from "node:assert/strict";
import { test } from "node:test";
import { createIntegrationRouter } from "../routes/integrationRoutes";
import { StremioIntegrationService } from "../services/integrations/stremioIntegrationService";
import { StremioClientError } from "../services/integrations/stremioClient";

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
  markReauthRequired: async () => undefined,
  ...overrides,
});

const handler = (router: ReturnType<typeof createIntegrationRouter>, path: string, method: string, index = -1) => {
  const layer: any = (router as any).stack.find(
    (candidate: any) => candidate.route?.path === path && candidate.route?.methods?.[method]
  );
  const stack = layer.route.stack;
  return stack[index < 0 ? stack.length - 1 : index].handle;
};

test("integration routes reject unauthenticated requests", async () => {
  const router = createIntegrationRouter(serviceWith());
  for (const [path, method] of [
    ["/", "get"],
    ["/stremio/connect", "post"],
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
  const router = createIntegrationRouter(
    serviceWith({
      listForUser: async (value) => {
        requestedUserId = value;
        return [{
          provider: "stremio",
          status: "connected",
          connected: true,
          lastSyncCompletedAt: null,
          lastSuccessfulSyncAt: null,
          lastSyncStatus: null,
          lastErrorCode: null,
        }];
      },
    })
  );
  const res = response();
  await handler(router, "/", "get")({ user: { id: userId }, body: {} }, res);

  assert.equal(requestedUserId, userId);
  assert.equal(JSON.stringify(res.state.body).includes("credentialEnvelope"), false);
});

test("connect validates input and ignores any body userId", async () => {
  let connectedUserId = "";
  const router = createIntegrationRouter(
    serviceWith({
      connect: async (value) => {
        connectedUserId = value;
        return serviceWith().connect(value, "", "");
      },
    })
  );
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
  const router = createIntegrationRouter(
    serviceWith({
      connect: async () => {
        throw new StremioClientError("invalid_credentials");
      },
    })
  );
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
  const router = createIntegrationRouter(
    serviceWith({
      disconnect: async (value) => {
        disconnectedUserId = value;
        return {
          provider: "stremio",
          status: "disconnected",
          connected: false,
          remoteRevocationConfirmed: false,
        };
      },
    })
  );
  const res = response();
  await handler(router, "/stremio", "delete")(
    { user: { id: userId }, body: { userId: "another-user" } },
    res
  );

  assert.equal(disconnectedUserId, userId);
  assert.equal(JSON.stringify(res.state.body).includes("credential"), false);
});
