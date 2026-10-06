import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import Group from "../models/Groups";
import User from "../models/user";
import groupRouter from "../routes/groupRoutes";
import { inviteLimiter } from "../middleware/rateLimits";
import { api, createGroup, createUser, startTestServer, TestServer } from "./helpers";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";

let mongo: IsolatedTestMongo;
let server: TestServer;
let member: Awaited<ReturnType<typeof createUser>>;
let hidden: Awaited<ReturnType<typeof createUser>>;
let outsider: Awaited<ReturnType<typeof createUser>>;
let group: Awaited<ReturnType<typeof createGroup>>;
const streamKey = process.env.STREAM_API_KEY;
const streamSecret = process.env.STREAM_API_SECRET;

before(async () => {
  process.env.JWT_SECRET = "invitation-privacy-test-secret";
  // Acceptance must exercise local membership without contacting Stream.
  delete process.env.STREAM_API_KEY;
  delete process.env.STREAM_API_SECRET;
  mongo = await startIsolatedTestMongo("invitation_privacy_test");
  await User.init();
  member = await createUser("Member");
  hidden = await createUser("HiddenInvitee");
  outsider = await createUser("Outsider");
  await User.updateOne({ _id: hidden.user._id }, { username: "hidden_invitee", discoverable: false });
  server = await startTestServer(app => app.use("/api/groups", groupRouter));
});
beforeEach(async () => {
  group = await createGroup(member.user._id, [member.user._id]);
  await inviteLimiter.resetKey("127.0.0.1");
});
after(async () => {
  if (server) await server.close();
  if (mongo) await mongo.stop();
  if (streamKey === undefined) delete process.env.STREAM_API_KEY;
  else process.env.STREAM_API_KEY = streamKey;
  if (streamSecret === undefined) delete process.env.STREAM_API_SECRET;
  else process.env.STREAM_API_SECRET = streamSecret;
});

test("known exact email invites a hidden user without returning their profile", async () => {
  const result = await api(server, member.token).post("/api/groups/invite-by-email", {
    groupId: group._id, email: ` ${hidden.user.email.toUpperCase()} `, inviterName: "Spoofed",
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { method: "in-app", msg: "In-app invitation sent." });
  const stored = await Group.findById(group._id);
  assert.equal(stored?.pendingInvitations.length, 1);
  assert.equal(stored?.pendingInvitations[0].userId.toString(), hidden.user._id.toString());
  assert.equal(stored?.pendingInvitations[0].inviterName, member.user.name);
  assert.ok(!stored?.members.some(id => id.equals(hidden.user._id)));
  const raw = await User.collection.findOne({ _id: hidden.user._id });
  assert.equal(raw?.discoverable, false);
});

test("exact-email invitation requires authentication and group context", async () => {
  const payload = { groupId: group._id, email: hidden.user.email };
  assert.equal((await api(server).post("/api/groups/invite-by-email", payload)).status, 401);
  assert.equal((await api(server, member.token).post("/api/groups/invite-by-email", { email: hidden.user.email })).status, 400);
});

test("outsider cannot look up or invite a hidden account through a group", async () => {
  const original = User.findOne;
  let lookedUp = false;
  User.findOne = ((...args: Parameters<typeof User.findOne>) => {
    if (args[0] && Object.prototype.hasOwnProperty.call(args[0], "email")) lookedUp = true;
    return original.apply(User, args);
  }) as typeof User.findOne;
  try {
    const result = await api(server, outsider.token).post("/api/groups/invite-by-email", {
      groupId: group._id, email: hidden.user.email,
    });
    assert.equal(result.status, 403);
    assert.equal(lookedUp, false);
    assert.equal((await Group.findById(group._id))?.pendingInvitations.length, 0);
  } finally { User.findOne = original; }
});

test("partial email and name queries are not valid invitations", async () => {
  for (const email of ["hidden", "HiddenInvitee", "hidden@", ".*"]) {
    assert.equal((await api(server, member.token).post("/api/groups/invite-by-email", { groupId: group._id, email })).status, 400);
  }
  assert.equal((await Group.findById(group._id))?.pendingInvitations.length, 0);
});

test("recipient can accept an exact-email invitation while remaining hidden", async () => {
  await api(server, member.token).post("/api/groups/invite-by-email", { groupId: group._id, email: hidden.user.email });
  const accepted = await api(server, hidden.token).post("/api/groups/respond", { groupId: group._id, response: "accept" });
  assert.equal(accepted.status, 200);
  const stored = await Group.findById(group._id);
  assert.ok(stored?.members.some(id => id.equals(hidden.user._id)));
  assert.equal(stored?.pendingInvitations.length, 0);
  assert.equal((await User.collection.findOne({ _id: hidden.user._id }))?.discoverable, false);
});

test("duplicate invitations do not duplicate recipients", async () => {
  const payload = { groupId: group._id, email: hidden.user.email };
  assert.equal((await api(server, member.token).post("/api/groups/invite-by-email", payload)).status, 200);
  assert.equal((await api(server, member.token).post("/api/groups/invite-by-email", payload)).status, 400);
  assert.equal((await Group.findById(group._id))?.pendingInvitations.length, 1);
});

test("existing ID invitations remain authorized and require recipient acceptance", async () => {
  const payload = { groupId: group._id, members: [hidden.user._id] };
  assert.equal((await api(server, outsider.token).post("/api/groups/invite", payload)).status, 403);
  assert.equal((await api(server, member.token).post("/api/groups/invite", payload)).status, 200);
  const stored = await Group.findById(group._id);
  assert.equal(stored?.pendingInvitations.length, 1);
  assert.ok(!stored?.members.some(id => id.equals(hidden.user._id)));
});

test("group invitation links still work for authorized members", async () => {
  assert.equal((await api(server, outsider.token).post(`/api/groups/${group._id}/invite-link`)).status, 403);
  const result = await api(server, member.token).post(`/api/groups/${group._id}/invite-link`);
  assert.equal(result.status, 200);
  assert.equal(typeof result.body.token, "string");
  assert.equal(typeof result.body.url, "string");
});
