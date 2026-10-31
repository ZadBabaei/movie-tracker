import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import User from "../models/user";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";
import { createUser, startTestServer, TestServer } from "./helpers";

// The route module must be importable with no key at all, so it is loaded
// only after OPENAI_API_KEY has been removed.
const savedKey = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;

type AssistantModule = typeof import("../routes/assistantRoutes");
let assistant: AssistantModule;
let originalCreateOpenAI: AssistantModule["assistantClients"]["createOpenAI"];
let createdWithKeys: string[];
let completionRequests: Record<string, any>[];

let testMongo: IsolatedTestMongo;
let server: TestServer;

const fakeOpenAI = (chunks: string[]) => ({
  chat: {
    completions: {
      create: async (request: Record<string, any>) => {
        completionRequests.push(request);
        return (async function* () {
          for (const content of chunks) yield { choices: [{ delta: { content } }] };
        })();
      },
    },
  },
});

before(async () => {
  assistant = await import("../routes/assistantRoutes");
  originalCreateOpenAI = assistant.assistantClients.createOpenAI;
  testMongo = await startIsolatedTestMongo("movie_tracker_assistant_test");
  process.env.JWT_SECRET = process.env.JWT_SECRET || "assistant-test-secret";
  server = await startTestServer((app) => app.use("/api/assistant", assistant.default));
});

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  createdWithKeys = [];
  completionRequests = [];
  assistant.resetAssistantClientCache();
  assistant.assistantClients.createOpenAI = ((apiKey: string) => {
    createdWithKeys.push(apiKey);
    return fakeOpenAI(["Try ", "Arrival."]);
  }) as any;
});

afterEach(async () => {
  assistant.assistantClients.createOpenAI = originalCreateOpenAI;
  await User.deleteMany({});
});

after(async () => {
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedKey;
  await server.close();
  await testMongo.stop();
});

const chat = async (token: string | null, body: unknown = { message: "Recommend a movie", history: [] }) => {
  const response = await fetch(`${server.baseUrl}/api/assistant/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, type: response.headers.get("content-type") || "", text: await response.text() };
};

test("assistant routes load without OPENAI_API_KEY and create no client", () => {
  assert.equal(typeof assistant.default, "function");
  assert.deepEqual(createdWithKeys, []);
});

test("chat responds 503 without OPENAI_API_KEY and never creates a client", async () => {
  const { token } = await createUser("NoKey");
  const response = await chat(token);
  assert.equal(response.status, 503);
  assert.equal(JSON.parse(response.text).msg, "The AI assistant is not available right now.");
  assert.deepEqual(createdWithKeys, []);
  assert.deepEqual(completionRequests, []);
});

test("a blank OPENAI_API_KEY is treated as missing", async () => {
  process.env.OPENAI_API_KEY = "   ";
  const { token } = await createUser("BlankKey");
  const response = await chat(token);
  assert.equal(response.status, 503);
  assert.deepEqual(createdWithKeys, []);
});

test("authentication is still required before the configuration check", async () => {
  const response = await chat(null);
  assert.equal(response.status, 401);
  assert.deepEqual(createdWithKeys, []);
});

test("with OPENAI_API_KEY set, chat streams the completion and reuses one client", async () => {
  process.env.OPENAI_API_KEY = "sk-synthetic-test-key";
  const { token } = await createUser("WithKey");

  const first = await chat(token);
  assert.equal(first.status, 200);
  assert.match(first.type, /text\/event-stream/);
  const events = first.text
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
  assert.deepEqual(events, [{ content: "Try " }, { content: "Arrival." }, { done: true }]);

  const second = await chat(token);
  assert.equal(second.status, 200);
  assert.deepEqual(createdWithKeys, ["sk-synthetic-test-key"]);
  assert.equal(completionRequests.length, 2);
  assert.equal(completionRequests[0].stream, true);
  assert.equal(completionRequests[0].messages.at(-1).content, "Recommend a movie");
});

test("chat still validates the message when the assistant is configured", async () => {
  process.env.OPENAI_API_KEY = "sk-synthetic-test-key";
  const { token } = await createUser("BadMessage");
  const response = await chat(token, { message: 42 });
  assert.equal(response.status, 400);
  assert.deepEqual(completionRequests, []);
});
