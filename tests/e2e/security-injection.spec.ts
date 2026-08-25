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

  test("user search escapes the term and never returns emails", async ({ request }) => {
    const factory = createUserFactory();
    const [session] = await createTestUsers(request, factory.users(3));

    // A regex metacharacter query used to match every user. Escaped, it is a
    // literal that matches nobody.
    const wildcard = await request.get(`${apiBaseURL()}/api/user/search?q=${encodeURIComponent(".*")}`, {
      headers: auth(session.token),
    });
    expect(wildcard.ok()).toBeTruthy();
    expect(await wildcard.json()).toEqual([]);

    // A catastrophic-backtracking payload must not hang the database.
    const started = Date.now();
    const redos = await request.get(
      `${apiBaseURL()}/api/user/search?q=${encodeURIComponent("(a+)+$")}`,
      { headers: auth(session.token) }
    );
    expect(redos.ok()).toBeTruthy();
    expect(Date.now() - started).toBeLessThan(5000);

    // A real name still resolves, but without leaking the address.
    const byName = await request.get(`${apiBaseURL()}/api/user/search?q=${encodeURIComponent("E2E User")}`, {
      headers: auth(session.token),
    });
    expect(byName.ok()).toBeTruthy();
    const results = await byName.json();
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((user: any) => user.email === undefined)).toBeTruthy();

    // Single characters are too coarse to be a browsing primitive.
    const tooShort = await request.get(`${apiBaseURL()}/api/user/search?q=a`, {
      headers: auth(session.token),
    });
    expect(await tooShort.json()).toEqual([]);
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
