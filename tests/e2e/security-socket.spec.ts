import { test, expect, APIRequestContext } from "@playwright/test";
import { clearTestDatabase } from "./helpers/db";
import { createTestUsers } from "./helpers/api";
import { createUserFactory } from "./helpers/factory";

const apiBaseURL = () => process.env.E2E_API_URL || "http://localhost:5000";
const pollingUrl = (sid?: string) =>
  `${apiBaseURL()}/socket.io/?EIO=4&transport=polling${sid ? `&sid=${sid}` : ""}`;

// Drives the Engine.IO polling handshake directly so the test needs no
// socket.io-client dependency at the repo root.
const openSession = async (request: APIRequestContext) => {
  const open = await request.get(pollingUrl());
  expect(open.ok()).toBeTruthy();
  const sid = (await open.text()).match(/"sid":"([^"]+)"/)?.[1];
  expect(sid, "engine.io handshake should return a sid").toBeTruthy();
  return sid as string;
};

const sendConnectPacket = async (
  request: APIRequestContext,
  sid: string,
  auth?: Record<string, string>
) => {
  const post = await request.post(pollingUrl(sid), {
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    data: auth ? `40${JSON.stringify(auth)}` : "40",
  });
  expect(post.ok()).toBeTruthy();

  const poll = await request.get(pollingUrl(sid), { timeout: 10_000 });
  return poll.text();
};

test.describe("socket authentication", () => {
  test.beforeEach(async () => {
    await clearTestDatabase();
  });

  test("rejects a socket connection with no token", async ({ request }) => {
    const sid = await openSession(request);
    const response = await sendConnectPacket(request, sid);

    // 44 is the Socket.IO "connect_error" packet.
    expect(response).toContain("44");
    expect(response).toContain("Unauthorized");
  });

  test("rejects a socket connection with a forged token", async ({ request }) => {
    const sid = await openSession(request);
    const response = await sendConnectPacket(request, sid, { token: "not.a.jwt" });

    expect(response).toContain("44");
    expect(response).toContain("Unauthorized");
  });

  test("accepts a socket connection with a valid token", async ({ request }) => {
    const factory = createUserFactory();
    const [session] = await createTestUsers(request, factory.users(1));

    const sid = await openSession(request);
    const response = await sendConnectPacket(request, sid, { token: session.token });

    // 40 is the Socket.IO "connect" acknowledgement.
    expect(response.startsWith("40")).toBeTruthy();
    expect(response).not.toContain("Unauthorized");
  });
});
