import { test, expect, APIRequestContext } from "@playwright/test";
import { clearTestDatabase } from "./helpers/db";
import { createGroup, createPoll, createTestUsers } from "./helpers/api";
import { createUserFactory, pollMovies } from "./helpers/factory";

const apiBaseURL = () => process.env.E2E_API_URL || "http://localhost:5000";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// A user who belongs to no group at all must not be able to read or mutate
// another group's data. Every case here was exploitable before the fix.
test.describe("group authorization boundary", () => {
  test.beforeEach(async () => {
    await clearTestDatabase();
  });

  const setup = async (request: APIRequestContext) => {
    const factory = createUserFactory();
    const [owner, outsider] = await createTestUsers(request, factory.users(2));
    const group = await createGroup(request, owner.token, `${factory.runId} Private Group`);
    const poll = await createPoll(
      request,
      owner.token,
      group._id,
      pollMovies,
      `${factory.runId} Private Poll`
    );
    return { owner, outsider, group, poll };
  };

  test("an outsider cannot read a private group", async ({ request }) => {
    const { outsider, group } = await setup(request);

    const byId = await request.get(`${apiBaseURL()}/api/groups/${group._id}`, {
      headers: auth(outsider.token),
    });
    expect(byId.status()).toBe(403);

    const bySlug = await request.get(`${apiBaseURL()}/api/groups/slug/${group.slug}`, {
      headers: auth(outsider.token),
    });
    expect(bySlug.status()).toBe(403);

    // The member roster (names + emails) used to leak through the chat token.
    const chatToken = await request.post(`${apiBaseURL()}/api/chat/token`, {
      headers: auth(outsider.token),
      data: { groupId: group._id },
    });
    expect(chatToken.status()).toBe(403);
  });

  test("an outsider cannot invite themselves into a group", async ({ request }) => {
    const { outsider, group } = await setup(request);

    const invite = await request.post(`${apiBaseURL()}/api/groups/invite`, {
      headers: auth(outsider.token),
      data: { groupId: group._id, members: [outsider.user._id], inviterName: "spoofed" },
    });
    expect(invite.status()).toBe(403);

    // Accepting is a second, independent path into the group.
    const respond = await request.post(`${apiBaseURL()}/api/groups/respond`, {
      headers: auth(outsider.token),
      data: { groupId: group._id, response: "accept" },
    });
    expect(respond.status()).toBe(403);

    const byEmail = await request.post(`${apiBaseURL()}/api/groups/invite-by-email`, {
      headers: auth(outsider.token),
      data: { groupId: group._id, email: "someone@example.com", inviterName: "spoofed" },
    });
    expect(byEmail.status()).toBe(403);

    const leave = await request.post(`${apiBaseURL()}/api/groups/${group._id}/leave`, {
      headers: auth(outsider.token),
      data: {},
    });
    expect(leave.status()).toBe(403);
  });

  test("an outsider cannot read or manipulate a group's polls", async ({ request }) => {
    const { outsider, group, poll } = await setup(request);
    const headers = auth(outsider.token);

    const create = await request.post(`${apiBaseURL()}/api/polls/create`, {
      headers,
      data: { groupId: group._id, movies: pollMovies, name: "hijacked poll" },
    });
    expect(create.status()).toBe(403);

    const vote = await request.post(`${apiBaseURL()}/api/polls/vote`, {
      headers,
      data: {
        pollId: poll._id,
        rankings: [
          { movieTmdbId: pollMovies[0].tmdbId, rank: 1 },
          { movieTmdbId: pollMovies[1].tmdbId, rank: 2 },
        ],
      },
    });
    expect(vote.status()).toBe(403);

    const addMovie = await request.post(`${apiBaseURL()}/api/polls/${poll._id}/add-movie`, {
      headers,
      data: { movie: { tmdbId: "999", title: "Injected" } },
    });
    expect(addMovie.status()).toBe(403);

    for (const url of [
      `/api/polls/${poll._id}`,
      `/api/polls/${poll._id}/results`,
      `/api/polls/group/${group._id}/active`,
      `/api/polls/group/${group._id}/history`,
    ]) {
      const response = await request.get(`${apiBaseURL()}${url}`, { headers });
      expect(response.status(), `GET ${url} should be forbidden`).toBe(403);
    }
  });

  test("a member can invite someone who then accepts", async ({ request }) => {
    const { owner, outsider, group } = await setup(request);

    const invite = await request.post(`${apiBaseURL()}/api/groups/invite`, {
      headers: auth(owner.token),
      data: { groupId: group._id, members: [outsider.user._id] },
    });
    expect(invite.ok()).toBeTruthy();

    const inbox = await request.get(`${apiBaseURL()}/api/inbox`, {
      headers: auth(outsider.token),
    });
    expect(inbox.ok()).toBeTruthy();
    const invitations = await inbox.json();
    expect(invitations.some((item: any) => item._id === group._id)).toBeTruthy();
    // The inviter name comes from the authenticated user, not the request body.
    expect(invitations[0].content).toContain(owner.user.name);

    const accept = await request.post(`${apiBaseURL()}/api/groups/respond`, {
      headers: auth(outsider.token),
      data: { groupId: group._id, response: "accept" },
    });
    expect(accept.ok()).toBeTruthy();

    const nowVisible = await request.get(`${apiBaseURL()}/api/groups/${group._id}`, {
      headers: auth(outsider.token),
    });
    expect(nowVisible.ok()).toBeTruthy();
  });

  test("members keep full access to their own group", async ({ request }) => {
    const { owner, group, poll } = await setup(request);
    const headers = auth(owner.token);

    const byId = await request.get(`${apiBaseURL()}/api/groups/${group._id}`, { headers });
    expect(byId.ok()).toBeTruthy();

    const bySlug = await request.get(`${apiBaseURL()}/api/groups/slug/${group.slug}`, { headers });
    expect(bySlug.ok()).toBeTruthy();

    const activePoll = await request.get(
      `${apiBaseURL()}/api/polls/group/${group._id}/active`,
      { headers }
    );
    expect(activePoll.ok()).toBeTruthy();

    const history = await request.get(
      `${apiBaseURL()}/api/polls/group/${group._id}/history`,
      { headers }
    );
    expect(history.ok()).toBeTruthy();

    const single = await request.get(`${apiBaseURL()}/api/polls/${poll._id}`, { headers });
    expect(single.ok()).toBeTruthy();

    const results = await request.get(`${apiBaseURL()}/api/polls/${poll._id}/results`, { headers });
    expect(results.ok()).toBeTruthy();

    const vote = await request.post(`${apiBaseURL()}/api/polls/vote`, {
      headers,
      data: {
        pollId: poll._id,
        rankings: [
          { movieTmdbId: pollMovies[0].tmdbId, rank: 1 },
          { movieTmdbId: pollMovies[1].tmdbId, rank: 2 },
        ],
      },
    });
    expect(vote.ok()).toBeTruthy();
  });
});
