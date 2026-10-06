import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import User from "../models/user";
import userDiscoveryRouter from "../routes/userDiscoveryRoutes";
import legacyUserRouter from "../routes/userRoutes";
import { userSearchLimiter } from "../middleware/rateLimits";
import { api, createUser, startTestServer, TestServer } from "./helpers";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";

let mongo: IsolatedTestMongo;
let server: TestServer;
let caller: Awaited<ReturnType<typeof createUser>>;
let secondCaller: Awaited<ReturnType<typeof createUser>>;
const names = (body: { username: string }[]) => body.map(user => user.username);

before(async () => {
  process.env.JWT_SECRET = "user-discovery-test-secret";
  mongo = await startIsolatedTestMongo("user_discovery_test");
  await User.init();
  caller = await createUser("Caller");
  secondCaller = await createUser("SecondCaller");
  await User.updateOne({ _id: caller.user._id }, { username: "zad_self", discoverable: true });
  let counter = 0;
  const seed = (username: string | null | undefined, discoverable: boolean, extras = {}) => User.create({
    name: "Visible name", email: `seed-${++counter}@example.com`, password: "private-hash",
    username, discoverable, shareWatchHistory: false, ...extras,
  });
  await seed("zaddy", true);
  await seed("zad.movie", true);
  const visible = await seed("zad", true, { avatar: "https://example.com/avatar.png", passwordResetToken: "private-reset", tokenVersion: 7 });
  await User.collection.updateOne({ _id: visible._id }, { $set: {
    integrationState: { credential: "private" }, stremio: { authKey: "private" }, privateMetadata: "private",
  } });
  await seed("zad_hidden", false);
  await seed(null, true);
  await seed(undefined, true);
  await seed("alice", true, { name: "Zad Name", email: "zad@example.com" });
  const legacy = await seed("zad_legacy", false);
  await User.collection.updateOne({ _id: legacy._id }, { $unset: { discoverable: "" } });
  await seed("zz_top", true);
  await seed("12_movie", true);
  for (let index = 24; index >= 0; index--) await seed(`limit_${String(index).padStart(2, "0")}`, true);
  // Give the real planner a representative narrow-prefix index choice.
  await User.collection.insertMany(Array.from({ length: 300 }, (_, index) => ({
    name: "Other", email: `plan-${index}@example.com`, password: "private",
    username: `other_${index}`, discoverable: false,
  })));
  server = await startTestServer(app => {
    app.use("/api/users", userDiscoveryRouter);
    app.use("/api/user", legacyUserRouter);
  });
});
beforeEach(async () => {
  await userSearchLimiter.resetKey(caller.user._id.toString());
  await userSearchLimiter.resetKey(secondCaller.user._id.toString());
});
after(async () => {
  if (server) await server.close();
  if (mongo) await mongo.stop();
});

const search = (query: string) => api(server, caller.token).get(`/api/users/search?q=${encodeURIComponent(query)}`);

test("authentication required and invalid tokens rejected", async () => {
  assert.equal((await api(server).get("/api/users/search?q=za")).status, 401);
  assert.equal((await api(server, "invalid-token").get("/api/users/search?q=za")).status, 401);
});

test("discoverable users returned, hidden and legacy users excluded, sharing not required", async () => {
  const result = await search("za");
  assert.equal(result.status, 200);
  assert.deepEqual(names(result.body), ["zad", "zad.movie", "zaddy"]);
});

test("current user excluded", async () => {
  const result = await search("zad_self");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, []);
});

test("query lowercased and whitespace trimmed", async () => {
  assert.deepEqual((await search("  ZAD  ")).body, (await search("zad")).body);
});

test("prefix-only matching does not match a substring", async () => {
  assert.deepEqual(names((await search("zad.m")).body), ["zad.movie"]);
  assert.deepEqual((await search("ad")).body, []);
});

test("periods and underscores are literal and prefix boundary handles z and digits", async () => {
  assert.deepEqual(names((await search("zad.")).body), ["zad.movie"]);
  assert.deepEqual((await search("za.")).body, []);
  assert.deepEqual(names((await search("zz_")).body), ["zz_top"]);
  assert.deepEqual(names((await search("12")).body), ["12_movie"]);
});

test("missing query returns 400", async () => {
  assert.equal((await api(server, caller.token).get("/api/users/search")).status, 400);
});

for (const query of ["", " ", "z", "a".repeat(31)]) {
  test(`invalid length ${JSON.stringify(query)} returns 400`, async () => {
    const result = await search(query);
    assert.equal(result.status, 400);
    assert.equal(result.body.msg, "Search query must be between 2 and 30 characters");
  });
}

test("30-character query accepted", async () => {
  assert.equal((await search("a".repeat(30))).status, 200);
});

test("maximum 20 results with deterministic ascending order", async () => {
  const result = await search("limit_");
  const expected = Array.from({ length: 20 }, (_, index) => `limit_${String(index).padStart(2, "0")}`);
  assert.equal(result.status, 200);
  assert.deepEqual(names(result.body), expected);
  assert.deepEqual((await search("limit_")).body, result.body);
});

test("does not search email or display name", async () => {
  assert.equal((await search("zad@example.com")).status, 400);
  assert.deepEqual((await search("example")).body, []);
  assert.ok(!names((await search("za")).body).includes("alice"));
});

test("response allows only username, displayName, and optional avatar", async () => {
  const result = await search("za");
  assert.deepEqual(result.body, [
    { username: "zad", displayName: "Visible name", avatar: "https://example.com/avatar.png" },
    { username: "zad.movie", displayName: "Visible name" },
    { username: "zaddy", displayName: "Visible name" },
  ]);
  for (const user of result.body) {
    for (const field of ["_id", "id", "name", "email", "password", "passwordResetToken", "passwordResetExpires", "tokenVersion", "provider", "googleId", "discoverable", "shareWatchHistory", "watchlist", "favorites", "favoriteGroups", "role", "firstLogin", "createdAt", "updatedAt", "integrationState", "stremio", "privateMetadata"]) {
      assert.equal(Object.prototype.hasOwnProperty.call(user, field), false, field);
    }
  }
});

for (const query of [".*", "za|ad", "$ne", "za[", "za\\", "@zad", "za d", "zäd", "(a+)+$"]) {
  test(`special query ${JSON.stringify(query)} safely rejected`, async () => {
    assert.equal((await search(query)).status, 400);
  });
}

for (const suffix of ["q=za&q=ad", "q[$ne]=za", "q[]=za"]) {
  test(`non-string query ${suffix} rejected`, async () => {
    assert.equal((await api(server, caller.token).get(`/api/users/search?${suffix}`)).status, 400);
  });
}

test("valid empty result and hidden account indistinguishable from nonexistent", async () => {
  const hidden = await search("zad_hidden");
  const nonexistent = await search("not_here");
  assert.equal(hidden.status, 200);
  assert.deepEqual(hidden, nonexistent);
  assert.deepEqual(hidden.body, []);
});

test("prefix query uses existing unique username index without blocking sort", async () => {
  const explain = await User.collection.find({
    discoverable: true, _id: { $ne: caller.user._id },
    username: { $type: "string", $gte: "zad", $lt: "zae" },
  }, { projection: { username: 1, name: 1, avatar: 1, _id: 0 } })
    .collation({ locale: "simple" }).sort({ username: 1 }).limit(20).explain("executionStats");
  const plan = JSON.stringify(explain.queryPlanner.winningPlan);
  assert.ok(plan.includes('"indexName":"unique_profile_username"'), plan);
  assert.ok(!plan.includes('"stage":"COLLSCAN"'), plan);
  assert.ok(!plan.includes('"stage":"SORT"'), plan);
  assert.ok(explain.executionStats.totalKeysExamined < 20);
});

test("rate limit allows 60 requests, rejects 61st, and isolates accounts", async () => {
  for (let index = 0; index < 60; index++) assert.equal((await search("not_here")).status, 200);
  // Switching to the legacy alias cannot bypass the same account's limit.
  const response = await fetch(`${server.baseUrl}/api/user/search?q=not_here`, {
    headers: { Authorization: `Bearer ${caller.token}` },
  });
  assert.equal(response.status, 429);
  assert.equal((await response.json() as { msg: string }).msg, "Too many user searches. Please try again in a minute.");
  assert.ok(Number(response.headers.get("retry-after")) > 0);
  assert.equal(response.headers.get("ratelimit-limit"), "60");
  assert.equal((await api(server, secondCaller.token).get("/api/users/search?q=not_here")).status, 200);
});

test("database failure returns a client-safe error", async () => {
  const original = User.find;
  User.find = (() => { throw new Error("private database details"); }) as typeof User.find;
  try {
    const result = await search("za");
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { msg: "Server error" });
  } finally {
    User.find = original;
  }
});

test("legacy search is authenticated and identical to privacy-filtered username discovery", async () => {
  assert.equal((await api(server).get("/api/user/search?q=za")).status, 401);
  const modern = await search("za");
  const legacy = await api(server, caller.token).get("/api/user/search?q=za");
  assert.deepEqual(legacy, modern);
  assert.deepEqual(names(legacy.body), ["zad", "zad.movie", "zaddy"]);
  for (const query of ["zad_hidden", "zad_self", "zad_legacy", "Visible", "ad", "zad@example.com"]) {
    const result = await api(server, caller.token).get(`/api/user/search?q=${encodeURIComponent(query)}`);
    assert.deepEqual(result, await search(query));
    if (query !== "zad@example.com") assert.deepEqual(result.body, []);
    else assert.equal(result.status, 400);
  }
});
