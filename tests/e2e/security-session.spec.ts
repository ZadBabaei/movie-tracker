import { test, expect } from "@playwright/test";
import { MongoClient, ObjectId } from "mongodb";
import { clearTestDatabase } from "./helpers/db";
import { createTestUsers } from "./helpers/api";
import { createUserFactory } from "./helpers/factory";

const apiBaseURL = () => process.env.E2E_API_URL || "http://localhost:5000";

const expiryOf = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).exp as number;

// The e2e server renews sessions older than one second; wait past that so a
// reissued token genuinely carries a later expiry.
const passRenewalWindow = () => new Promise((resolve) => setTimeout(resolve, 1500));
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const withUsers = async (run: (users: ReturnType<MongoClient["db"]>) => Promise<void>) => {
  const client = new MongoClient(process.env.E2E_MONGODB_URI as string);
  await client.connect();
  try {
    await run(client.db());
  } finally {
    await client.close();
  }
};

test.describe("session invalidation", () => {
  test.beforeEach(async () => {
    await clearTestDatabase();
  });

  test("a revoked session stops working immediately", async ({ request }) => {
    const factory = createUserFactory();
    const [session] = await createTestUsers(request, factory.users(1));

    const before = await request.get(`${apiBaseURL()}/api/profile`, {
      headers: auth(session.token),
    });
    expect(before.ok()).toBeTruthy();

    // Bumping tokenVersion is what a password reset does.
    await withUsers(async (db) => {
      await db
        .collection("users")
        .updateOne({ _id: new ObjectId(session.user._id) }, { $inc: { tokenVersion: 1 } });
    });

    const after = await request.get(`${apiBaseURL()}/api/profile`, {
      headers: auth(session.token),
    });
    expect(after.status()).toBe(401);
  });

  test("an active session slides forward so the device stays signed in", async ({ request }) => {
    const factory = createUserFactory();
    const [session] = await createTestUsers(request, factory.users(1));

    const originalExpiry = expiryOf(session.token);
    await passRenewalWindow();

    const response = await request.get(`${apiBaseURL()}/api/profile`, {
      headers: auth(session.token),
    });
    expect(response.ok()).toBeTruthy();

    const renewed = response.headers()["x-refreshed-token"];
    expect(renewed, "an aged session should come back renewed").toBeTruthy();
    // The whole point: the device's session now expires later than it did.
    expect(expiryOf(renewed)).toBeGreaterThan(originalExpiry);

    const withRenewed = await request.get(`${apiBaseURL()}/api/profile`, {
      headers: auth(renewed),
    });
    expect(withRenewed.ok()).toBeTruthy();
  });

  test("renewal cannot outlive a revoked session", async ({ request }) => {
    const factory = createUserFactory();
    const [session] = await createTestUsers(request, factory.users(1));

    await passRenewalWindow();

    const first = await request.get(`${apiBaseURL()}/api/profile`, {
      headers: auth(session.token),
    });
    const renewed = first.headers()["x-refreshed-token"];
    expect(renewed).toBeTruthy();

    await withUsers(async (db) => {
      await db
        .collection("users")
        .updateOne({ _id: new ObjectId(session.user._id) }, { $inc: { tokenVersion: 1 } });
    });

    // A token handed out moments ago is still rejected once the session is revoked.
    const after = await request.get(`${apiBaseURL()}/api/profile`, {
      headers: auth(renewed),
    });
    expect(after.status()).toBe(401);
  });

  test("a deleted account's token stops working immediately", async ({ request }) => {
    const factory = createUserFactory();
    const [session] = await createTestUsers(request, factory.users(1));

    await withUsers(async (db) => {
      await db.collection("users").deleteOne({ _id: new ObjectId(session.user._id) });
    });

    const after = await request.get(`${apiBaseURL()}/api/profile`, {
      headers: auth(session.token),
    });
    expect(after.status()).toBe(401);
  });

  test("tokens without the expected issuer and audience are rejected", async ({ request }) => {
    // A JWT signed with the right secret but no iss/aud claims — the shape of
    // every token issued before this hardening landed.
    const legacyToken = [
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      "eyJpZCI6IjY1MDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsIm5hbWUiOiJMZWdhY3kiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMH0",
      "invalidsignaturebutissuercheckcomesfirst",
    ].join(".");

    const response = await request.get(`${apiBaseURL()}/api/profile`, {
      headers: auth(legacyToken),
    });
    expect(response.status()).toBe(401);
  });
});
