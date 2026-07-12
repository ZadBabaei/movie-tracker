import { test, expect } from "@playwright/test";
import { clearTestDatabase } from "./helpers/db";
import {
  createGroup,
  createPoll,
  createTestUsers,
  generateInviteLink,
  joinGroupByInvite,
  seedBrowserAuth,
  submitVote,
} from "./helpers/api";
import { createUserFactory, pollMovies } from "./helpers/factory";

test.describe("poll results", () => {
  test.beforeEach(async () => {
    await clearTestDatabase();
  });

  test("multiple users can vote and completed results are visible", async ({ page, request }) => {
    const factory = createUserFactory();
    const sessions = await createTestUsers(request, factory.users(3));
    const owner = sessions[0];
    const group = await createGroup(request, owner.token, `${factory.runId} Poll Group`);
    const invite = await generateInviteLink(request, owner.token, group._id);

    for (const session of sessions.slice(1)) {
      await joinGroupByInvite(request, session.token, invite.token);
    }

    const poll = await createPoll(request, owner.token, group._id, pollMovies, `${factory.runId} Pick a movie`);
    expect(poll._id).toBeTruthy();

    await submitVote(request, sessions[0].token, poll._id, [
      { movieTmdbId: pollMovies[0].tmdbId, rank: 1 },
      { movieTmdbId: pollMovies[1].tmdbId, rank: 2 },
    ]);
    await submitVote(request, sessions[1].token, poll._id, [
      { movieTmdbId: pollMovies[0].tmdbId, rank: 1 },
      { movieTmdbId: pollMovies[1].tmdbId, rank: 2 },
    ]);
    await submitVote(request, sessions[2].token, poll._id, [
      { movieTmdbId: pollMovies[1].tmdbId, rank: 1 },
      { movieTmdbId: pollMovies[0].tmdbId, rank: 2 },
    ]);

    await seedBrowserAuth(page, owner);
    const historyResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/polls/group/${group._id}/history`) &&
        response.request().method() === "GET"
    );
    await page.goto(`/group/${group.slug || group._id}/chat`);
    const historyResponse = await historyResponsePromise;
    expect(historyResponse.ok()).toBeTruthy();
    const history = await historyResponse.json();
    expect(history.some((item: any) => item._id === poll._id)).toBeTruthy();

    const pollCard = page.getByTestId("poll-history-card").filter({ hasText: `${factory.runId} Pick a movie` });
    await expect(pollCard).toBeVisible();
    await pollCard.click();

    await expect(page.getByTestId("poll-results-modal")).toBeVisible();
    await expect(page.getByText("Tonight's movie has been chosen")).toBeVisible();
    await expect(page.getByText(pollMovies[0].title)).toBeVisible();
  });
});
