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
