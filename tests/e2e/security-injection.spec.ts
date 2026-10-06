import { test, expect } from "@playwright/test";
import { clearTestDatabase } from "./helpers/db";
import { addMovieToWatchlist, createTestUsers } from "./helpers/api";
import { createUserFactory, testMovie } from "./helpers/factory";

const apiBaseURL = () => process.env.E2E_API_URL || "http://localhost:5000";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe("injection and directory disclosure", () => {
  test.beforeEach(async () => {
    await clearTestDatabase();
  });

  test("the bulk user directory endpoints are gone", async ({ request }) => {
    const factory = createUserFactory();
    const [session] = await createTestUsers(request, factory.users(1));

    const all = await request.get(`${apiBaseURL()}/api/user/all`, {
      headers: auth(session.token),
    });
    expect(all.status()).toBe(404);

    const authSearch = await request.get(`${apiBaseURL()}/api/auth/search?query=.`, {
      headers: auth(session.token),
    });
    expect(authSearch.status()).toBe(404);
  });

  test("legacy user search respects discovery privacy and never returns emails", async ({ request }) => {
    const factory = createUserFactory();
    const [session, visible, hidden] = await createTestUsers(request, factory.users(3));
    for (const [account, username, discoverable] of [
      [visible, "privacy_visible", true], [hidden, "privacy_hidden", false],
    ] as const) {
      const updated = await request.put(`${apiBaseURL()}/api/profile`, {
        headers: auth(account.token), data: { username, discoverable },
      });
      expect(updated.ok()).toBeTruthy();
    }

    // Regex metacharacters are rejected before querying the database.
    const wildcard = await request.get(`${apiBaseURL()}/api/user/search?q=${encodeURIComponent(".*")}`, {
      headers: auth(session.token),
    });
    expect(wildcard.status()).toBe(400);

    // A catastrophic-backtracking payload must not hang the database.
    const started = Date.now();
    const redos = await request.get(
      `${apiBaseURL()}/api/user/search?q=${encodeURIComponent("(a+)+$")}`,
      { headers: auth(session.token) }
    );
    expect(redos.status()).toBe(400);
    expect(Date.now() - started).toBeLessThan(5000);

    // Only opted-in username prefixes resolve, without leaking IDs or email.
    const byName = await request.get(`${apiBaseURL()}/api/user/search?q=privacy_`, {
      headers: auth(session.token),
    });
    expect(byName.ok()).toBeTruthy();
    const results = await byName.json();
    expect(results.map((user: any) => user.username)).toEqual(["privacy_visible"]);
    expect(results.every((user: any) => user.email === undefined && user._id === undefined)).toBeTruthy();
    const byEmail = await request.get(`${apiBaseURL()}/api/user/search?q=${encodeURIComponent(hidden.user.email)}`, {
      headers: auth(session.token),
    });
    expect(byEmail.status()).toBe(400);

    // Single characters are too coarse to be a browsing primitive.
    const tooShort = await request.get(`${apiBaseURL()}/api/user/search?q=a`, {
      headers: auth(session.token),
    });
    expect(tooShort.status()).toBe(400);
  });

  test("comment lookup rejects Mongo operator injection", async ({ request }) => {
    const factory = createUserFactory();
    const [author, attacker] = await createTestUsers(request, factory.users(2));

    const { movie } = await addMovieToWatchlist(request, author.token, testMovie);
    const created = await request.post(`${apiBaseURL()}/api/comments`, {
      headers: auth(author.token),
      data: { movieId: movie._id, text: "a private-ish comment" },
    });
    expect(created.ok()).toBeTruthy();

    // ?movieId[$ne]=null used to return every comment in the database.
    const injected = await request.get(
      `${apiBaseURL()}/api/comments?movieId%5B%24ne%5D=null`,
      { headers: auth(attacker.token) }
    );
    expect(injected.status()).toBe(400);

    const missing = await request.get(`${apiBaseURL()}/api/comments?movieId=not-an-id`, {
      headers: auth(attacker.token),
    });
    expect(missing.status()).toBe(400);

    // The legitimate lookup still works.
    const legit = await request.get(`${apiBaseURL()}/api/comments?movieId=${movie._id}`, {
      headers: auth(author.token),
    });
    expect(legit.ok()).toBeTruthy();
    const comments = await legit.json();
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe("a private-ish comment");
  });
});
