import { chromium } from "@playwright/test";

const baseURL = process.env.DASHBOARD_VERIFY_URL || "http://127.0.0.1:4173";
const screenshotPath = process.env.DASHBOARD_SCREENSHOT || "test-results/analytics-dashboard.png";
const tokenPart = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${tokenPart({ alg: "none", typ: "JWT" })}.${tokenPart({ exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`;

const analytics = {
  meta: {
    rangeDays: 30,
    generatedAt: new Date().toISOString(),
    trackingSince: "2026-07-01T00:00:00.000Z",
    geographySource: "Approximate request-region headers",
  },
  overview: {
    totalUsers: 1284,
    newUsers: 146,
    previousNewUsers: 119,
    userGrowthRate: 22.7,
    activeUsers: 611,
    dau: 87,
    wau: 338,
    mau: 611,
    totalGroups: 372,
    moviesWatched: 2941,
    totalPolls: 824,
    openBugReports: 7,
  },
  trend: Array.from({ length: 30 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 6, index + 1)).toISOString().slice(0, 10),
    activeUsers: 20 + ((index * 13) % 44),
    newUsers: 2 + ((index * 7) % 13),
    events: 80 + ((index * 31) % 140),
  })),
  features: [
    ["groups", "Groups", 486, 2380, 79.5, 12],
    ["watchlist", "Watchlist", 421, 1942, 68.9, 8],
    ["polls", "Polls & voting", 347, 1184, 56.8, 19],
    ["chat", "Group chat", 312, 2210, 51.1, 4],
    ["coming_soon", "Coming soon", 205, 643, 33.6, -3],
    ["ratings", "Ratings", 178, 418, 29.1, 11],
  ].map(([feature, label, uniqueUsers, uses, adoptionRate, change]) => ({ feature, label, uniqueUsers, uses, adoptionRate, change })),
  countries: [
    ["CA", 221, 1482], ["US", 174, 1021], ["GB", 72, 438], ["DE", 46, 310], ["AU", 39, 247], ["NL", 21, 119],
  ].map(([country, users, events]) => ({ country, users, events })),
  devices: [
    { device: "desktop", users: 334, events: 2184 },
    { device: "mobile", users: 249, events: 1720 },
    { device: "tablet", users: 28, events: 148 },
  ],
  funnel: [
    ["registered", "Registered", 146, 100],
    ["group", "Created or joined a group", 112, 76.7],
    ["watchlist", "Added a movie", 91, 62.3],
    ["vote", "Voted in a poll", 64, 43.8],
    ["watched", "Marked a movie watched", 49, 33.6],
  ].map(([key, label, users, conversionRate]) => ({ key, label, users, conversionRate })),
};

const runViewport = async (browser, viewport, viewportScreenshot) => {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  await context.addInitScript((authToken) => localStorage.setItem("token", authToken), token);
  await context.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (!new URL(url).pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }
    if (url.includes("/api/analytics/admin/overview")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(analytics) });
      return;
    }
    if (url.includes("/api/profile")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ _id: "owner-1", name: "Owner", email: "owner@example.com", avatar: "", firstLogin: false, isAdmin: true }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(`${baseURL}/dashboard`, { waitUntil: "networkidle" });
  try {
    await page.getByRole("heading", { name: "Audience & product intelligence" }).waitFor();
    await page.getByRole("heading", { name: "Feature signal" }).waitFor();
    await page.getByText("1.3K").first().waitFor();
  } catch (error) {
    await page.screenshot({ path: "test-results/analytics-dashboard-error.png", fullPage: true });
    console.error("Verification URL:", page.url());
    console.error("Page text:", (await page.locator("body").innerText()).slice(0, 2000));
    console.error("Captured errors:", errors);
    throw error;
  }

  const overlay = await page.locator(".vite-error-overlay, #webpack-dev-server-client-overlay").count();
  if (overlay) throw new Error("A development error overlay is visible");
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  if (viewportScreenshot) await page.screenshot({ path: viewportScreenshot, fullPage: true });

  await context.close();
};

const browser = await chromium.launch({ headless: true });
try {
  await runViewport(browser, { width: 1440, height: 1000 }, screenshotPath);
  await runViewport(browser, { width: 390, height: 844 }, "test-results/analytics-dashboard-mobile.png");
  console.log(`Dashboard verified at desktop and mobile widths. Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}
