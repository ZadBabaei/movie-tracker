import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
import authRouter from "../routes/authRoutes";
import User from "../models/user";
import { passwordResetLimiter } from "../middleware/rateLimits";
import {
  assertEmailConfig,
  emailTransports,
  getEmailConfig,
  resetEmailClientCache,
} from "../utils/emailService";
import { buildPasswordResetLink, getAppUrl } from "../utils/deploymentConfig";
import { IsolatedTestMongo, startIsolatedTestMongo } from "./helpers/testMongo";
import { startTestServer, TestServer } from "./helpers";

const ENV_KEYS = [
  "NODE_ENV", "RAILWAY_ENVIRONMENT", "RAILWAY_ENVIRONMENT_NAME", "APP_URL",
  "EMAIL_PROVIDER", "EMAIL_FROM", "RESEND_API_KEY",
  "EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASS",
  "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalTransports = { ...emailTransports };

const RESEND_KEY = "re_test_key_never_logged";
const SMTP_PASS = "smtp-password-never-logged";
const PROD_APP_URL = "https://movies.example.test";

interface SentEmail { from: string; to: string; subject: string; html?: string; text?: string }
let resendSends: SentEmail[];
let resendResult: { error: { name: string; message: string } | null };
let smtpTransportsCreated: Record<string, unknown>[];
let errorLogs: string[];
const originalConsoleError = console.error;

let testMongo: IsolatedTestMongo;
let server: TestServer;

const setEnv = (values: Partial<Record<(typeof ENV_KEYS)[number], string>>) => {
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
};

// Production-like configuration: Railway env, Resend, and SMTP credentials
// that are present but must never be used.
const useProductionResend = () => setEnv({
  NODE_ENV: "production",
  RAILWAY_ENVIRONMENT_NAME: "production",
  APP_URL: `${PROD_APP_URL}/`,
  EMAIL_PROVIDER: "resend",
  EMAIL_FROM: "Movie Tracker <no-reply@movies.example.test>",
  RESEND_API_KEY: RESEND_KEY,
  SMTP_USER: "sender@example.test",
  SMTP_PASS,
});

before(async () => {
  testMongo = await startIsolatedTestMongo("movie_tracker_password_reset_test");
  process.env.JWT_SECRET = process.env.JWT_SECRET || "password-reset-test-secret";
  server = await startTestServer((app) => app.use("/api/auth", authRouter));
});

beforeEach(async () => {
  for (const key of ENV_KEYS) delete process.env[key];
  resendSends = [];
  resendResult = { error: null };
  smtpTransportsCreated = [];
  errorLogs = [];
  resetEmailClientCache();
  emailTransports.createResendClient = (() => ({
    emails: {
      send: async (payload: SentEmail) => {
        resendSends.push(payload);
        return resendResult.error
          ? { data: null, error: resendResult.error }
          : { data: { id: "email-id" }, error: null };
      },
    },
  })) as any;
  emailTransports.createSmtpTransport = ((options: Record<string, unknown>) => {
    smtpTransportsCreated.push(options);
    return { sendMail: async () => ({}) };
  }) as any;
  console.error = (...args: unknown[]) => {
    errorLogs.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  await passwordResetLimiter.resetKey("127.0.0.1");
  await passwordResetLimiter.resetKey("::ffff:127.0.0.1");
});

afterEach(async () => {
  console.error = originalConsoleError;
  Object.assign(emailTransports, originalTransports);
  await User.deleteMany({});
});

after(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await server.close();
  await testMongo.stop();
});

const post = async (path: string, body: unknown) => {
  const response = await fetch(`${server.baseUrl}/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
};

const createLocalUser = async (password = "old-password-1") =>
  User.create({
    name: "Reset User",
    email: "reset.user@example.test",
    password: await bcrypt.hash(password, 10),
    provider: "local",
  });

const tokenFromEmail = (email: SentEmail) => {
  const match = /\/reset-password\/([a-f0-9]{64})/.exec(email.html || "");
  assert.ok(match, "reset link present in email");
  return match[1];
};

test("EMAIL_PROVIDER=resend selects Resend even when SMTP credentials exist", () => {
  useProductionResend();
  assert.equal(getEmailConfig().provider, "resend");
  setEnv({ NODE_ENV: "development", RAILWAY_ENVIRONMENT_NAME: "" });
  assert.equal(getEmailConfig().provider, "resend");
});

test("deployed environments prefer Resend over SMTP when EMAIL_PROVIDER is unset", () => {
  useProductionResend();
  delete process.env.EMAIL_PROVIDER;
  assert.equal(getEmailConfig().provider, "resend");
});

test("local development keeps SMTP when EMAIL_PROVIDER is unset and SMTP credentials exist", () => {
  setEnv({ RESEND_API_KEY: RESEND_KEY, SMTP_USER: "sender@example.test", SMTP_PASS });
  assert.equal(getEmailConfig().provider, "smtp");
  delete process.env.SMTP_PASS;
  assert.equal(getEmailConfig().provider, "resend");
  assert.match(assertEmailConfig().from, /onboarding@resend\.dev/);
});

test("Resend configuration is validated without leaking secrets", () => {
  useProductionResend();
  setEnv({ EMAIL_FROM: "Movie Tracker <onboarding@resend.dev>" });
  assert.throws(() => assertEmailConfig(), /verified domain/);
  delete process.env.EMAIL_FROM;
  assert.throws(() => assertEmailConfig(), /EMAIL_FROM/);
  setEnv({ EMAIL_FROM: "no-reply@movies.example.test", RESEND_API_KEY: "" });
  assert.throws(() => assertEmailConfig(), /RESEND_API_KEY must be set/);
  setEnv({ EMAIL_PROVIDER: "sendgrid" });
  assert.throws(() => getEmailConfig(), /EMAIL_PROVIDER must be/);
});

test("APP_URL falls back to localhost only outside deployed environments", () => {
  assert.equal(getAppUrl(), "http://localhost:3000");
  setEnv({ APP_URL: "http://127.0.0.1:3001/" });
  assert.equal(getAppUrl(), "http://127.0.0.1:3001");

  for (const deployed of [{ NODE_ENV: "production" }, { RAILWAY_ENVIRONMENT_NAME: "production" }]) {
    for (const key of ENV_KEYS) delete process.env[key];
    setEnv(deployed);
    assert.throws(() => getAppUrl(), /APP_URL must be set/);
    for (const bad of ["http://localhost:3000", "https://localhost", "https://127.0.0.1", "http://movies.example.test", "not a url"]) {
      setEnv({ APP_URL: bad });
      assert.throws(() => getAppUrl(), /APP_URL/, bad);
    }
    setEnv({ APP_URL: `${PROD_APP_URL}//` });
    assert.equal(buildPasswordResetLink("a".repeat(64)), `${PROD_APP_URL}/reset-password/${"a".repeat(64)}`);
  }
});

test("SMTP transport is created with bounded timeouts", async () => {
  setEnv({ EMAIL_PROVIDER: "smtp", SMTP_USER: "sender@example.test", SMTP_PASS });
  await createLocalUser();
  await post("/forgot-password", { email: "reset.user@example.test" });
  assert.equal(smtpTransportsCreated.length, 1);
  const options = smtpTransportsCreated[0];
  for (const key of ["connectionTimeout", "greetingTimeout", "socketTimeout"]) {
    assert.ok(typeof options[key] === "number" && (options[key] as number) <= 30_000, key);
  }
  assert.equal(resendSends.length, 0);
});

test("forgot-password sends through Resend with a production reset link and never touches SMTP", async () => {
  useProductionResend();
  const user = await createLocalUser();
  const response = await post("/forgot-password", { email: "  Reset.User@Example.test " });

  assert.equal(response.status, 200);
  assert.equal(response.body.msg, "If an account exists for that email, we sent a reset link.");
  assert.equal(smtpTransportsCreated.length, 0);
  assert.equal(resendSends.length, 1);
  const [email] = resendSends;
  assert.equal(email.to, user.email);
  assert.equal(email.from, "Movie Tracker <no-reply@movies.example.test>");
  const token = tokenFromEmail(email);
  assert.ok(email.html!.includes(`${PROD_APP_URL}/reset-password/${token}`));
  assert.ok(email.text!.includes(`${PROD_APP_URL}/reset-password/${token}`));
  assert.ok(!/localhost|127\.0\.0\.1/.test(`${email.html}${email.text}`));

  const stored = await User.findById(user._id);
  assert.equal(stored!.passwordResetToken, crypto.createHash("sha256").update(token).digest("hex"));
  assert.ok(stored!.passwordResetExpires! > new Date());
});

test("unknown email gets the same generic response and no email", async () => {
  useProductionResend();
  await createLocalUser();
  const response = await post("/forgot-password", { email: "nobody@example.test" });
  assert.equal(response.status, 200);
  assert.equal(response.body.msg, "If an account exists for that email, we sent a reset link.");
  assert.equal(resendSends.length, 0);
});

test("Resend failure keeps the generic response, clears the token, and logs no secrets", async () => {
  useProductionResend();
  resendResult.error = { name: "validation_error", message: "The domain is not verified." };
  const user = await createLocalUser();
  const response = await post("/forgot-password", { email: user.email });

  assert.equal(response.status, 200);
  assert.equal(response.body.msg, "If an account exists for that email, we sent a reset link.");
  const token = tokenFromEmail(resendSends[0]);
  const stored = await User.findById(user._id);
  assert.equal(stored!.passwordResetToken, undefined);
  assert.equal(stored!.passwordResetExpires, undefined);

  const logs = errorLogs.join("\n");
  assert.match(logs, /Failed to send password reset email/);
  assert.match(logs, /domain is not verified/);
  for (const secret of [token, RESEND_KEY, SMTP_PASS, process.env.JWT_SECRET!, "reset-password/"]) {
    assert.ok(!logs.includes(secret), `log must not contain ${secret.slice(0, 12)}`);
  }
});

test("a deployed environment with a localhost APP_URL sends nothing and stores no token", async () => {
  useProductionResend();
  setEnv({ APP_URL: "http://localhost:3000" });
  const user = await createLocalUser();
  const response = await post("/forgot-password", { email: user.email });

  assert.equal(response.status, 200);
  assert.equal(response.body.msg, "If an account exists for that email, we sent a reset link.");
  assert.equal(resendSends.length, 0);
  assert.equal((await User.findById(user._id))!.passwordResetToken, undefined);
  assert.match(errorLogs.join("\n"), /configuration problem.*APP_URL/);
});

test("full reset: new password works, old password fails, token cannot be reused, sessions are revoked", async () => {
  useProductionResend();
  const user = await createLocalUser("old-password-1");
  await post("/forgot-password", { email: user.email });
  const token = tokenFromEmail(resendSends[0]);

  const reset = await post(`/reset-password/${token}`, { password: "new-password-2" });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.msg, "Password reset successful. You can now sign in.");

  const oldLogin = await post("/login", { email: user.email, password: "old-password-1" });
  assert.equal(oldLogin.status, 400);
  const newLogin = await post("/login", { email: user.email, password: "new-password-2" });
  assert.equal(newLogin.status, 200);
  assert.ok(newLogin.body.token);

  const reuse = await post(`/reset-password/${token}`, { password: "another-password-3" });
  assert.equal(reuse.status, 400);
  assert.equal(reuse.body.msg, "Reset link is invalid or has expired.");

  const stored = await User.findById(user._id);
  assert.equal(stored!.tokenVersion, 1);
  assert.equal(stored!.passwordResetToken, undefined);
});

test("expired, malformed, and short-password resets are rejected", async () => {
  const token = crypto.randomBytes(32).toString("hex");
  const user = await createLocalUser("old-password-1");
  user.passwordResetToken = crypto.createHash("sha256").update(token).digest("hex");
  user.passwordResetExpires = new Date(Date.now() - 1000);
  await user.save();

  const expired = await post(`/reset-password/${token}`, { password: "new-password-2" });
  assert.equal(expired.status, 400);
  const malformed = await post("/reset-password/not-a-token", { password: "new-password-2" });
  assert.equal(malformed.status, 400);

  user.passwordResetExpires = new Date(Date.now() + 60_000);
  await user.save();
  const short = await post(`/reset-password/${token}`, { password: "short" });
  assert.equal(short.status, 400);

  const stored = await User.findById(user._id);
  assert.ok(await bcrypt.compare("old-password-1", stored!.password!));
});
