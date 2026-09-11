import { test, expect } from "@playwright/test";
import { clearTestDatabase } from "./helpers/db";
import {
  addMovieToWatchlist,
  createGroup,
  createTestUser,
  getGroup,
  getPersonalHistory,
  seedBrowserAuth,
} from "./helpers/api";
import { createUserFactory, testMovie } from "./helpers/factory";

test.describe("watchlist mark watched flow", () => {
  test.beforeEach(async () => {
    await clearTestDatabase();
  });

  test("moves a watchlist movie into group watch history with metadata", async ({ page, request }) => {
    const factory = createUserFactory();
    const owner = await createTestUser(request, factory.user(1));
    const group = await createGroup(request, owner.token, `${factory.runId} Watch History Group`);
    await addMovieToWatchlist(request, owner.token, testMovie);

    await seedBrowserAuth(page, owner);
    await page.goto("/watchlist");

    const movieCard = page.getByTestId("movie-card").filter({ hasText: testMovie.title });
    await expect(movieCard).toBeVisible();
    await movieCard.hover();
    await movieCard.getByTestId("movie-action-watched").click();

    await page.getByTestId("group-select-option").filter({ hasText: group.name }).click();
    await page.getByTestId("group-select-date").fill("2026-04-28");
    await page.getByTestId("group-select-location-input").fill("Home");
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByTestId("group-select-member")).toHaveCount(1);
    await page.getByTestId("group-select-done").click();

    await expect(movieCard).toHaveCount(0);

    const updatedGroup = await getGroup(request, owner.token, group._id);
    const historyItem = updatedGroup.movies.find((entry: any) => entry.movieId?.title === testMovie.title);
    expect(historyItem).toBeTruthy();
    expect(historyItem.watchedWhere || historyItem.watchedLocation).toBe("Home");
    expect(new Date(historyItem.watchedAt || historyItem.watchedDate).toISOString()).toContain("2026-04-28");
    expect(historyItem.watchedWith.map((member: any) => member._id)).toContain(owner.user._id);
  });

  test("moves a watchlist movie into personal history and keeps it after refresh", async ({ page, request }) => {
    const factory = createUserFactory();
    const owner = await createTestUser(request, factory.user(1));
    await addMovieToWatchlist(request, owner.token, testMovie);

    await seedBrowserAuth(page, owner);
    await page.goto("/watchlist");

    const movieCard = page.getByTestId("movie-card").filter({ hasText: testMovie.title });
    await movieCard.hover();
    await movieCard.getByTestId("movie-action-watched").click();
    await page.getByTestId("personal-history-option").click();
    await page.getByTestId("group-select-date").fill("2026-05-02");
    await page.getByTestId("group-select-location-input").fill("Living room");
    await page.getByLabel(/notes/i).fill("A personal rewatch.");
    await page.getByRole("button", { name: /save to history/i }).click();

    await expect(movieCard).toHaveCount(0);
    await page.reload();
    await expect(movieCard).toHaveCount(0);

    const history = await getPersonalHistory(request, owner.token);
    const entry = history.items.find((item: any) => item.movie.title === testMovie.title);
    expect(entry).toBeTruthy();
    expect(entry.scope).toBe("personal");
    expect(entry.watchedLocation).toBe("Living room");
    expect(entry.watchedNotes).toBe("A personal rewatch.");

    await page.goto("/history");
    await expect(page.getByTestId("history-row").filter({ hasText: testMovie.title })).toBeVisible();
  });
});
