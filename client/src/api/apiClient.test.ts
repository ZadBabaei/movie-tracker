import { describe, expect, test } from "vitest";
import { shouldClearAppSession } from "./apiClient";

describe("API client authentication errors", () => {
  test("keeps Movie Tracker auth for known Stremio 401 responses", () => {
    expect(shouldClearAppSession(401, "invalid_credentials", true)).toBe(false);
    expect(shouldClearAppSession(401, "stremio_reauth_required", true)).toBe(false);
  });

  test("clears stale Movie Tracker auth when an integration request has no provider code", () => {
    expect(shouldClearAppSession(401, undefined, true)).toBe(true);
    expect(shouldClearAppSession(401, "invalid_credentials", false)).toBe(true);
    expect(shouldClearAppSession(503, "stremio_provider_unavailable", true)).toBe(false);
  });
});
