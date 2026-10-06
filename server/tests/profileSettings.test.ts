import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import User from "../models/user";
import profileRouter from "../routes/profileRoutes";
import userRouter from "../routes/userRoutes";
import { api, createUser, startTestServer, TestServer } from "./helpers";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";

let mongo: IsolatedTestMongo;
let server: TestServer;
let owner: Awaited<ReturnType<typeof createUser>>;
let other: Awaited<ReturnType<typeof createUser>>;
before(async () => {
  process.env.JWT_SECRET = "profile-settings-test-secret";
  mongo = await startIsolatedTestMongo("profile_settings_test");
  await User.init();
  owner = await createUser("Owner");
  other = await createUser("Other");
  server = await startTestServer(app => {
    app.use("/api/profile", profileRouter);
    app.use("/api/users", userRouter);
  });
});
after(async () => {
  if (server) await server.close();
  if (mongo) await mongo.stop();
});

test("legacy user without username receives private defaults", async () => {
  await User.collection.updateOne({ _id: owner.user._id }, {
    $unset: { username: "", discoverable: "", shareWatchHistory: "" },
  });
  const result = await api(server, owner.token).get("/api/profile");
  assert.equal(result.status, 200);
  assert.equal(result.body.username, null);
  assert.equal(result.body.discoverable, false);
  assert.equal(result.body.shareWatchHistory, false);
  assert.equal(new User().discoverable, false);
  assert.equal(new User().shareWatchHistory, false);
});

test("valid usernames are trimmed and normalized", async () => {
  for (const [input, expected] of [[" Zad ", "zad"], ["zad_01", "zad_01"], ["zad.movie", "zad.movie"]]) {
    const result = await api(server, owner.token).put("/api/profile", { username: input });
    assert.equal(result.status, 200);
    assert.equal(result.body.username, expected);
    const raw = await User.collection.findOne({ _id: owner.user._id });
    assert.equal(raw?.username, expected);
  }
});

test("MongoDB enforces case-insensitive uniqueness and API returns 409", async () => {
  await api(server, owner.token).put("/api/profile", { username: "zad" });
  const result = await api(server, other.token).put("/api/profile", { username: "ZAD" });
  assert.equal(result.status, 409);
  assert.equal(result.body.msg, "Username is already taken");
  await assert.rejects(User.create({ name: "Duplicate", email: "duplicate@example.com", password: "hash", username: " ZAD " }),
    (error: any) => error.code === 11000 && error.keyPattern.username === 1);
  const sameOwner = await api(server, owner.token).put("/api/profile", { username: "ZAD" });
  assert.equal(sameOwner.status, 200);
});

for (const input of ["bad-name", "bad name", "ab", "a".repeat(31), "admin", "API", "auth", "login", "signup", "history", "profile", "settings", "users", "zad@gmail.com", "@zad", ".zad", "zad.", "zad..movie", "zäd", 123, {}, false]) {
  test(`rejects invalid username ${JSON.stringify(input)}`, async () => {
    const result = await api(server, owner.token).put("/api/profile", { username: input });
    assert.equal(result.status, 400);
    assert.equal(typeof result.body.msg, "string");
    assert.ok(result.body.msg.length > 0);
  });
}

test("privacy settings accept explicit booleans and can be disabled", async () => {
  for (const field of ["discoverable", "shareWatchHistory"]) {
    for (const value of [true, false]) {
      const result = await api(server, owner.token).put("/api/profile", { [field]: value });
      assert.equal(result.status, 200);
      assert.equal(result.body[field], value);
      const raw = await User.collection.findOne({ _id: owner.user._id });
      assert.equal(raw?.[field], value);
    }
    for (const value of ["true", 1, null]) {
      assert.equal((await api(server, owner.token).put("/api/profile", { [field]: value })).status, 400);
    }
  }
});

test("username changes and removal release the unique name", async () => {
  const client = api(server, owner.token);
  for (const removal of [null, "", "   "]) {
    assert.equal((await client.put("/api/profile", { username: "changed" })).status, 200);
    const result = await client.put("/api/profile", { username: removal });
    assert.equal(result.status, 200);
    assert.equal(result.body.username, null);
  }
  assert.equal((await api(server, other.token).put("/api/profile", { username: "changed" })).status, 200);
  await User.create({ name: "No handle", email: "no-handle@example.com", password: "hash", username: null });
});

test("unrelated profile updates preserve settings and support email", async () => {
  const client = api(server, owner.token);
  await client.put("/api/profile", { username: "owner", discoverable: true });
  const result = await client.put("/api/profile", { name: " Updated Owner ", email: " Owner@Example.com " });
  assert.equal(result.status, 200);
  assert.equal(result.body.name, "Updated Owner");
  assert.equal(result.body.email, "owner@example.com");
  assert.equal(result.body.username, "owner");
  assert.equal(result.body.discoverable, true);
  assert.equal(result.body.shareWatchHistory, false);
  assert.equal(result.body.password, undefined);
});

test("unrelated lookups do not select settings and user search does not expose email", async () => {
  const user = await User.findById(owner.user._id).lean();
  for (const key of ["username", "discoverable", "shareWatchHistory"]) assert.equal(user?.[key as keyof typeof user], undefined);
  const result = await api(server, other.token).get("/api/users/search?q=Owner");
  assert.equal(result.status, 200);
  assert.ok(result.body.length > 0);
  for (const user of result.body) {
    for (const key of ["email", "username", "discoverable", "shareWatchHistory"]) assert.equal(user[key], undefined);
  }
});

test("settings require authentication", async () => {
  assert.equal((await api(server).put("/api/profile", { discoverable: true })).status, 401);
  assert.equal((await api(server).get("/api/profile")).status, 401);
});

test("partial username index excludes missing and null values", async () => {
  const indexes = await mongoose.connection.collection("users").indexes();
  const index = indexes.find(index => index.name === "unique_profile_username");
  assert.equal(index?.unique, true);
  assert.deepEqual(index?.partialFilterExpression, { username: { $type: "string" } });
});

test("concurrent claims have exactly one winner", async () => {
  const results = await Promise.all([
    api(server, owner.token).put("/api/profile", { username: "race.claim" }),
    api(server, other.token).put("/api/profile", { username: "RACE.CLAIM" }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
});

test("index failure blocks username writes while other settings remain usable", async () => {
  const model = require("../models/user") as { ensureUsernameIndex: () => Promise<string> };
  const original = model.ensureUsernameIndex;
  model.ensureUsernameIndex = async () => { throw new Error("Index unavailable"); };
  try {
    const before = await User.collection.findOne({ _id: owner.user._id });
    const result = await api(server, owner.token).put("/api/profile", { username: "blocked", discoverable: true });
    assert.equal(result.status, 503);
    assert.equal(result.body.msg, "Username settings are temporarily unavailable");
    const after = await User.collection.findOne({ _id: owner.user._id });
    assert.equal(after?.username, before?.username);
    assert.equal(after?.discoverable, before?.discoverable);
    assert.equal((await api(server, owner.token).put("/api/profile", { discoverable: false })).status, 200);
  } finally {
    model.ensureUsernameIndex = original;
  }
});
