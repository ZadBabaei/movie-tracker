import { defineConfig, devices } from "@playwright/test";

const clientPort = process.env.E2E_CLIENT_PORT || "3000";
const serverPort = process.env.E2E_SERVER_PORT || "5000";
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${clientPort}`;

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
  webServer: [
    {
      command: "npm run dev",
      cwd: "./server",
      url: `http://localhost:${serverPort}/api/health`,
      reuseExistingServer: true,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm start",
      cwd: "./client",
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
