import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createStremioClient,
  StremioClientError,
} from "../services/integrations/stremioClient";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const errorCode = (code: string) => (error: unknown) =>
  error instanceof StremioClientError && error.code === code;

test("login sends the verified contract and extracts only authKey", async () => {
  let requestBody: any;
  const client = createStremioClient({
    fetchImpl: (async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({ result: { authKey: "fake-auth-key", unexpected: "ignored" } });
    }) as typeof fetch,
  });

  const result = await client.login("person@example.test", "fake-password");
  assert.deepEqual(result, { authKey: "fake-auth-key" });
  assert.deepEqual(requestBody, {
    type: "Login",
    email: "person@example.test",
    password: "fake-password",
    facebook: false,
  });
});

test("HTTP 200 provider errors are normalized independently of HTTP status", async () => {
  const client = createStremioClient({
    fetchImpl: (async () =>
      jsonResponse({ error: { code: 99, message: "unexpected provider text" } })) as typeof fetch,
  });

  await assert.rejects(client.login("person@example.test", "fake-password"), errorCode("provider_protocol_error"));
});

test("invalid login credentials are normalized", async () => {
  const client = createStremioClient({
    fetchImpl: (async () =>
      jsonResponse({ error: { code: 2, message: "provider credential details" } })) as typeof fetch,
  });

  await assert.rejects(client.login("person@example.test", "fake-password"), errorCode("invalid_credentials"));
});

test("malformed login success, network failure, and non-JSON responses are normalized", async () => {
  const malformed = createStremioClient({
    fetchImpl: (async () => jsonResponse({ result: {} })) as typeof fetch,
  });
  await assert.rejects(malformed.login("person@example.test", "fake-password"), errorCode("provider_protocol_error"));

  const network = createStremioClient({
    fetchImpl: (async () => {
      throw new Error("socket failed with provider details");
    }) as typeof fetch,
  });
  await assert.rejects(network.login("person@example.test", "fake-password"), errorCode("network_error"));

  const nonJson = createStremioClient({
    fetchImpl: (async () => new Response("not-json", { status: 200 })) as typeof fetch,
  });
  await assert.rejects(nonJson.login("person@example.test", "fake-password"), errorCode("provider_protocol_error"));
});

test("logout sends only authKey and accepts verified success shape", async () => {
  let requestBody: any;
  const client = createStremioClient({
    fetchImpl: (async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({ result: { success: true } });
    }) as typeof fetch,
  });

  assert.deepEqual(await client.logout("fake-auth-key"), { revoked: true });
  assert.deepEqual(requestBody, { authKey: "fake-auth-key" });
});

test("logout normalizes invalid sessions and never places authKey in errors", async () => {
  const fakeAuthKey = "fake-auth-key-that-must-not-leak";
  const invalidSession = createStremioClient({
    fetchImpl: (async () =>
      jsonResponse({ error: { code: 1, message: fakeAuthKey } })) as typeof fetch,
  });

  await assert.rejects(invalidSession.logout(fakeAuthKey), (error: unknown) => {
    assert.equal(errorCode("invalid_session")(error), true);
    assert.equal(String(error).includes(fakeAuthKey), false);
    return true;
  });
});

test("full snapshot uses the verified datastoreGet contract and returns bounded DTOs", async () => {
  let requestedUrl = "";
  let requestBody: any;
  const client = createStremioClient({
    fetchImpl: (async (url, init) => {
      requestedUrl = String(url);
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({
        result: [
          {
            _id: "tt1234567",
            type: "movie",
            removed: true,
            _mtime: "2026-01-02T03:04:05.000Z",
            state: { timesWatched: 2, lastWatched: "2026-01-01T00:00:00.000Z" },
            name: "must not escape",
            poster: "must not escape",
            watched: "must not escape",
          },
        ],
      });
    }) as typeof fetch,
  });

  const snapshot = await client.getLibrarySnapshot("fake-auth-key");
  assert.equal(requestedUrl.endsWith("/datastoreGet"), true);
  assert.deepEqual(requestBody, {
    authKey: "fake-auth-key",
    collection: "libraryItem",
    ids: [],
    all: true,
  });
  assert.deepEqual(snapshot, [
    {
      id: "tt1234567",
      type: "movie",
      removed: true,
      revision: "2026-01-02T03:04:05.000Z",
      state: { timesWatched: 2, lastWatched: "2026-01-01T00:00:00.000Z" },
    },
  ]);
  assert.equal(JSON.stringify(snapshot).includes("must not escape"), false);
});

test("snapshot errors, malformed results, and timeout failures are normalized", async () => {
  const invalidSession = createStremioClient({
    fetchImpl: (async () =>
      jsonResponse({ error: { code: 1, message: "raw session detail" } })) as typeof fetch,
  });
  await assert.rejects(
    invalidSession.getLibrarySnapshot("fake-auth-key"),
    errorCode("invalid_session")
  );

  const apiFailure = createStremioClient({
    fetchImpl: (async () =>
      jsonResponse({ error: { code: 99, message: "raw provider failure" } })) as typeof fetch,
  });
  await assert.rejects(
    apiFailure.getLibrarySnapshot("fake-auth-key"),
    errorCode("provider_protocol_error")
  );

  const malformed = createStremioClient({
    fetchImpl: (async () => jsonResponse({ result: { items: [] } })) as typeof fetch,
  });
  await assert.rejects(
    malformed.getLibrarySnapshot("fake-auth-key"),
    errorCode("provider_protocol_error")
  );

  const unavailable = createStremioClient({
    fetchImpl: (async () => new Response("temporarily unavailable", { status: 503 })) as typeof fetch,
  });
  await assert.rejects(
    unavailable.getLibrarySnapshot("fake-auth-key"),
    errorCode("provider_unavailable")
  );

  const timeout = createStremioClient({
    timeoutMs: 5,
    fetchImpl: ((_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("timed out")));
      })) as typeof fetch,
  });
  await assert.rejects(
    timeout.getLibrarySnapshot("fake-auth-key"),
    errorCode("network_error")
  );
});
