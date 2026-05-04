import { defineConfig, devices } from "@playwright/test";

const clientPort = process.env.E2E_CLIENT_PORT || "3000";
const serverPort = process.env.E2E_SERVER_PORT || "5000";
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${clientPort}`;
const apiURL = process.env.E2E_API_URL || `http://localhost:${serverPort}`;
const e2eMongoURI = process.env.E2E_MONGODB_URI;
const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "true";

const getDatabaseName = (uri: string) => {
  try {
    const normalized = uri.replace(/^mongodb\+srv:/, "mongodb:");
    const parsed = new URL(normalized);
    return parsed.pathname.replace(/^\//, "").split("?")[0].toLowerCase();
  } catch {
    return "";
  }
};

const assertSafeE2EDatabase = (uri?: string): asserts uri is string => {
  if (!uri) {
    throw new Error(
      "E2E_MONGODB_URI is required. E2E tests must not use MONGODB_URI or server/.env."
    );
  }

  const dbName = getDatabaseName(uri);
  if (!dbName || (!dbName.includes("e2e") && !dbName.includes("test"))) {
    throw new Error(
      `Refusing to run E2E against database "${dbName || "(missing database name)"}". ` +
        "Use an E2E/test database name, for example movie-tracker-e2e."
    );
  }
};

assertSafeE2EDatabase(e2eMongoURI);

const webServer = [
  {
    command: "npm run dev",
    cwd: "./server",
    url: `${apiURL}/api/health`,
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
    env: {
      ...process.env,
      PORT: serverPort,
      MONGODB_URI: e2eMongoURI,
      E2E_MONGODB_URI: e2eMongoURI,
      JWT_SECRET: process.env.JWT_SECRET || "movie-tracker-e2e-secret",
      NODE_ENV: "test",
      ALLOWED_ORIGINS: baseURL,
      APP_URL: baseURL,
    },
  },
  {
    command: "npm start",
    cwd: "./client",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
    env: {
      ...process.env,
      PORT: clientPort,
      BROWSER: "none",
      REACT_APP_API_URL: apiURL,
    },
  },
];

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  ...(skipWebServer ? {} : { webServer }),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
