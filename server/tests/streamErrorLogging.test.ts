import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import util from "node:util";
import { after, before, describe, test } from "node:test";
import { StreamChat } from "stream-chat";
import Group from "../models/Groups";
import InvitationLink from "../models/InvitationLink";
import chatRoutes from "../routes/chatRoutes";
import groupRoutes from "../routes/groupRoutes";
import { globalErrorHandler } from "../middleware/globalErrorHandler";
import { describeError } from "../utils/safeLog";
import { api, createGroup, createUser, startTestServer, TestServer } from "./helpers";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";

// Everything here is synthetic: a random Stream secret, a fake Stream server on
// 127.0.0.1 and an isolated local MongoDB. No real credential or external call.

type Mode = "401" | "500" | "reset" | "refused";
const MODES: Mode[] = ["401", "500", "reset", "refused"];
const API_KEY = "t1-key";
const API_SECRET = crypto.randomBytes(24).toString("hex");

let fake: http.Server;
let fakeUrl = "";
let closedUrl = "";
let fakeMode: Mode = "500";
const seenAuthHeaders = new Set<string>();
let needles: string[] = [];
let mongo: IsolatedTestMongo;
let server: TestServer;

const baseUrlFor = (mode: Mode) => (mode === "refused" ? closedUrl : fakeUrl);

const useStreamMode = (mode: Mode) => {
  fakeMode = mode;
  // The routes call StreamChat.getInstance(key, secret) unmodified; seeding the
  // singleton with a local baseURL points them at the fake server.
  (StreamChat as unknown as { _instance?: StreamChat })._instance = undefined;
  return StreamChat.getInstance(API_KEY, API_SECRET, { baseURL: baseUrlFor(mode) });
};

const captureLogs = async <T>(run: () => Promise<T>): Promise<{ result: T; output: string }> => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(util.format(...args));
  };
  try {
    return { result: await run(), output: lines.join("\n") };
  } finally {
    console.error = original;
  }
};

const assertClean = (text: string, label: string) => {
  for (const needle of needles) {
    assert.ok(!text.includes(needle), `${label}: output contains credential material`);
  }
  assert.ok(!text.includes(API_SECRET), `${label}: output contains the API secret`);
  assert.ok(!/authorization/i.test(text), `${label}: output contains an Authorization header`);
  assert.ok(!/eyJ[A-Za-z0-9_-]{5,}/.test(text), `${label}: output contains JWT-shaped text`);
};

const tokenParts = (header: string) => {
  const token = header.replace(/^Bearer\s+/i, "");
  const [, payload, signature] = token.split(".");
  return [token, payload, signature];
};

before(async () => {
  process.env.JWT_SECRET = "stream-error-logging-test-secret";
  process.env.STREAM_API_KEY = API_KEY;
  process.env.STREAM_API_SECRET = API_SECRET;

  fake = http.createServer((req, res) => {
    const header = req.headers.authorization;
    if (header) seenAuthHeaders.add(header);
    req.resume();
    req.on("end", () => {
      if (fakeMode === "reset") {
        req.socket.destroy();
        return;
      }
      const status = fakeMode === "401" ? 401 : 500;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: status === 401 ? 40 : 99, message: `fake stream ${status}`, StatusCode: status }));
    });
  });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  fakeUrl = `http://127.0.0.1:${(fake.address() as net.AddressInfo).port}`;

  // Reserve a port and release it so connections to it are refused.
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  closedUrl = `http://127.0.0.1:${(probe.address() as net.AddressInfo).port}`;
  await new Promise<void>((resolve) => probe.close(() => resolve()));

  // Prime: let the SDK send one request so the real server token is known.
  const primer = useStreamMode("500");
  await captureLogs(() => primer.upsertUser({ id: "primer" }).catch(() => undefined));
  assert.ok(seenAuthHeaders.size > 0, "fake server never saw an Authorization header");
  needles = [...seenAuthHeaders].flatMap(tokenParts).filter((part): part is string => !!part && part.length > 8);
  assert.ok(needles.length >= 3, "expected token, payload and signature needles");

  mongo = await startIsolatedTestMongo("stream_error_logging_test");
  server = await startTestServer((app) => {
    app.use("/api/chat", chatRoutes);
    app.use("/api/groups", groupRoutes);
    app.get("/boom", async (_req, _res, next) => {
      try {
        await StreamChat.getInstance(API_KEY, API_SECRET).upsertUser({ id: "boom" });
      } catch (error) {
        next(error);
      }
    });
    app.use(globalErrorHandler);
  });
});

after(async () => {
  (StreamChat as unknown as { _instance?: StreamChat })._instance = undefined;
  if (server) await server.close();
  if (fake) await new Promise<void>((resolve) => fake.close(() => resolve()));
  if (mongo) await mongo.stop();
});

describe("describeError", () => {
  test("returns only bounded name, code, status and message", () => {
    const error = Object.assign(new Error("upstream failed"), {
      name: "StreamApiError",
      code: 17,
      status: 403,
      request: { _header: `GET / HTTP/1.1\r\nAuthorization: eyJhbGciOi.eyJzZXJ2ZXIi.c2lnbmF0dXJl\r\n` },
      config: { headers: { Authorization: "eyJhbGciOi.eyJzZXJ2ZXIi.c2lnbmF0dXJl" } },
    });
    const described = describeError(error);
    assert.deepEqual(described, { name: "StreamApiError", message: "upstream failed", code: 17, status: 403 });
    for (const text of [JSON.stringify(described), util.inspect(described, { depth: null })]) {
      assert.ok(!/eyJ|Authorization|_header/.test(text));
    }
  });

  test("takes status from an axios-style response and string codes", () => {
    const described = describeError({ name: "AxiosError", message: "boom", code: "ECONNRESET", response: { status: 502 } });
    assert.deepEqual(described, { name: "AxiosError", message: "boom", code: "ECONNRESET", status: 502 });
  });

  test("withholds messages that carry credential content", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzZXJ2ZXIiOnRydWV9.dGVzdHNpZ25hdHVyZXZhbHVl";
    const secret = "synthetic-secret-value-1234";
    const previous = process.env.STREAM_API_SECRET;
    process.env.STREAM_API_SECRET = secret;
    try {
      const samples = [
        `request failed with ${jwt}`,
        "Authorization: abc",
        "sent Bearer abcdef",
        "GET /x?api_key=zzz failed",
        "token=abc123 rejected",
        `x ${secret} y`,
        "opaque ".concat("A".repeat(40)),
      ];
      for (const sample of samples) {
        const { message } = describeError(new Error(sample));
        assert.ok(message.startsWith("[message withheld"), `not withheld: ${sample.slice(0, 20)}`);
        assert.ok(!message.includes(jwt) && !message.includes(secret));
      }
    } finally {
      process.env.STREAM_API_SECRET = previous;
    }
  });

  test("keeps ordinary messages, bounds length and strips control characters", () => {
    assert.equal(describeError(new Error("connect ECONNREFUSED 127.0.0.1:3000")).message, "connect ECONNREFUSED 127.0.0.1:3000");
    const long = describeError(new Error("word ".repeat(100))).message;
    assert.ok(long.length <= 203);
    assert.equal(describeError(new Error("a\r\nforged: line")).message, "a forged: line");
  });

  test("tolerates non-error input, hostile fields and throwing getters", () => {
    assert.deepEqual(describeError(undefined), { name: "Error", message: "" });
    assert.deepEqual(describeError(null), { name: "Error", message: "" });
    assert.deepEqual(describeError(42), { name: "Error", message: "" });
    assert.equal(describeError("plain text").message, "plain text");
    const hostile = {
      get message(): string {
        throw new Error("getter");
      },
      name: "bad name with spaces",
      code: { nested: "object" },
      status: "500",
    };
    assert.deepEqual(describeError(hostile), { name: "Error", message: "" });
    assert.deepEqual(Object.keys(describeError(new Error("x"))).sort(), ["message", "name"]);
  });
});

describe("harness controls", () => {
  for (const mode of MODES) {
    test(`raw SDK error logging leaks but describeError does not in ${mode} mode`, async () => {
      const client = useStreamMode(mode);
      let caught: unknown;
      try {
        await client.upsertUser({ id: "control" });
      } catch (error) {
        caught = error;
      }
      assert.ok(caught, "expected the fake Stream backend to fail the call");
      const raw = await captureLogs(async () => console.error("raw:", caught));
      assert.ok(needles.some((needle) => raw.output.includes(needle)), "control did not reproduce the leak");
      const safe = await captureLogs(async () => console.error("safe:", describeError(caught)));
      assertClean(safe.output, `describeError ${mode}`);
      assert.match(safe.output, /name:/);
    });
  }
});

describe("route logging with a failing Stream backend", () => {
  for (const mode of MODES) {
    test(`/api/chat/unread-info logs safely in ${mode} mode`, async () => {
      useStreamMode(mode);
      const caller = await createUser("Unread");
      const { result, output } = await captureLogs(() => api(server, caller.token).get("/api/chat/unread-info"));
      assert.equal(result.status, 500);
      assert.deepEqual(result.body, { msg: "Server error" });
      assert.match(output, /Error in \/api\/chat\/unread-info:/);
      assertClean(output, `unread-info ${mode}`);
      assertClean(JSON.stringify(result.body), `unread-info body ${mode}`);
    });

    test(`/api/chat/token logs safely in ${mode} mode`, async () => {
      useStreamMode(mode);
      const caller = await createUser("Token");
      const group = await createGroup(caller.user._id, [caller.user._id]);
      const { result, output } = await captureLogs(() =>
        api(server, caller.token).post("/api/chat/token", { groupId: group._id.toString() })
      );
      assert.equal(result.status, 500);
      assert.deepEqual(result.body, { msg: "Server error" });
      assert.match(output, /Error in \/api\/chat\/token:/);
      assertClean(output, `token ${mode}`);
      assertClean(JSON.stringify(result.body), `token body ${mode}`);
    });

    test(`join-by-link upsert failure logs safely in ${mode} mode`, async () => {
      useStreamMode(mode);
      const owner = await createUser("Owner");
      const joiner = await createUser("Joiner");
      const group = await createGroup(owner.user._id, [owner.user._id]);
      const link = await InvitationLink.create({ groupId: group._id, createdBy: owner.user._id });
      const { result, output } = await captureLogs(() =>
        api(server, joiner.token).post(`/api/groups/join-by-link/${link.token}`)
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.joined, true);
      assert.match(output, /Failed to upsert user to Stream Chat:/);
      assertClean(output, `join-by-link ${mode}`);
      const stored = await Group.findById(group._id).lean();
      assert.ok(stored?.members.some((id) => id.toString() === joiner.user._id.toString()));
    });
  }
});

describe("global error handler with Stream errors", () => {
  for (const mode of MODES) {
    test(`keeps responses and logs safely in ${mode} mode`, async () => {
      useStreamMode(mode);
      const { result, output } = await captureLogs(() => api(server).get("/boom"));
      if (mode === "401") {
        // Client-range statuses keep their real status and are not logged.
        assert.equal(result.status, 401);
        assert.equal(output, "");
      } else {
        assert.equal(result.status, 500);
        assert.deepEqual(result.body, { msg: "Server error" });
        assert.match(output, /Global error handler:/);
      }
      assertClean(output, `global handler ${mode}`);
      assertClean(JSON.stringify(result.body), `global handler body ${mode}`);
    });
  }
});
