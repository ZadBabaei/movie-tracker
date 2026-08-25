import { test, expect } from "@playwright/test";

const apiBaseURL = () => process.env.E2E_API_URL || "http://localhost:5000";

test.describe("transport and abuse hardening", () => {
  test("security headers are set on API responses", async ({ request }) => {
    const response = await request.get(`${apiBaseURL()}/api/health`);
    expect(response.ok()).toBeTruthy();

    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["strict-transport-security"]).toBeTruthy();
    expect(headers["x-frame-options"] || headers["content-security-policy"]).toBeTruthy();
    // Helmet removes the framework fingerprint.
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("password reset requests are rate limited", async ({ request }) => {
    let sawRateLimit = false;

    // The limiter is strict in every environment, so a burst must trip it.
    // Asserting only "eventually 429" keeps this stable when the suite is
    // re-run inside the same rate-limit window.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await request.post(`${apiBaseURL()}/api/auth/forgot-password`, {
        data: { email: `rate-limit-probe-${attempt}@example.com` },
      });
      if (response.status() === 429) {
        sawRateLimit = true;
        break;
      }
    }

    expect(sawRateLimit).toBeTruthy();
  });

  test("oversized request bodies are rejected outside the bug report route", async ({ request }) => {
    const bigPayload = { email: "a@example.com", password: "x".repeat(200_000) };

    const rejected = await request.post(`${apiBaseURL()}/api/auth/login`, {
      data: bigPayload,
      failOnStatusCode: false,
    });
    expect(rejected.status()).toBe(413);

    // Bug reports keep the larger limit for screenshot payloads, so the same
    // body must not be rejected for being too large there.
    const bugRoute = await request.post(`${apiBaseURL()}/api/bug-reports`, {
      data: bigPayload,
      failOnStatusCode: false,
    });
    expect(bugRoute.status()).not.toBe(413);
  });
});
