import { APIRequestContext, Page, expect } from "@playwright/test";
import { TestUserInput } from "./factory";

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  firstLogin?: boolean;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  password: string;
}

const apiBaseURL = () => process.env.E2E_API_URL || "http://localhost:5000";

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

export const createTestUser = async (
  request: APIRequestContext,
  input: TestUserInput
): Promise<AuthSession> => {
  const register = await request.post(`${apiBaseURL()}/api/auth/register`, {
    data: input,
  });
  expect([200, 400]).toContain(register.status());

  const login = await request.post(`${apiBaseURL()}/api/auth/login`, {
    data: {
      email: input.email,
      password: input.password,
    },
  });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return { token: body.token, user: body.user, password: input.password };
};

export const createTestUsers = async (
  request: APIRequestContext,
  users: TestUserInput[]
) => Promise.all(users.map((user) => createTestUser(request, user)));

export const loginByApi = async (
  request: APIRequestContext,
  input: TestUserInput
): Promise<AuthSession> => {
  const login = await request.post(`${apiBaseURL()}/api/auth/login`, {
    data: {
      email: input.email,
      password: input.password,
    },
  });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return { token: body.token, user: body.user, password: input.password };
};

export const seedBrowserAuth = async (page: Page, session: AuthSession) => {
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("token", token);
    window.localStorage.setItem("user", JSON.stringify(user));
    window.localStorage.setItem("userId", user._id);
  }, session);
};

export const createGroup = async (
  request: APIRequestContext,
  token: string,
  groupName: string
) => {
  const response = await request.post(`${apiBaseURL()}/api/groups/create`, {
    headers: authHeaders(token),
    data: { groupName },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).group;
};

export const generateInviteLink = async (
  request: APIRequestContext,
  token: string,
  groupId: string
) => {
  const response = await request.post(`${apiBaseURL()}/api/groups/${groupId}/invite-link`, {
    headers: authHeaders(token),
    data: {},
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
};

export const joinGroupByInvite = async (
  request: APIRequestContext,
  token: string,
  inviteToken: string
) => {
  const response = await request.post(`${apiBaseURL()}/api/groups/join-by-link/${inviteToken}`, {
    headers: authHeaders(token),
    data: {},
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
};

export const addMovieToWatchlist = async (
  request: APIRequestContext,
  token: string,
  movie: {
    imdbID: string;
    title: string;
    poster_path?: string;
    vote_average?: number;
  }
) => {
  const response = await request.post(`${apiBaseURL()}/api/watchlist`, {
    headers: authHeaders(token),
    data: { movie },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
};

export const getGroup = async (
  request: APIRequestContext,
  token: string,
  groupId: string
) => {
  const response = await request.get(`${apiBaseURL()}/api/groups/${groupId}`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
};

export const createPoll = async (
  request: APIRequestContext,
  token: string,
  groupId: string,
  movies: any[],
  name = "E2E movie night poll"
) => {
  const response = await request.post(`${apiBaseURL()}/api/polls/create`, {
    headers: authHeaders(token),
    data: {
      groupId,
      movies,
      name,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
};

export const submitVote = async (
  request: APIRequestContext,
  token: string,
  pollId: string,
  rankings: { movieTmdbId: string; rank: number }[]
) => {
  const response = await request.post(`${apiBaseURL()}/api/polls/vote`, {
    headers: authHeaders(token),
    data: { pollId, rankings },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
};
