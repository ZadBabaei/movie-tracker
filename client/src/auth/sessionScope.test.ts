import { beforeEach, describe, expect, it, vi } from "vitest";
import * as historyApi from "../api/historyApi";
import { useChatStore } from "../store/useChatStore";
import { useGroupStore } from "../store/useGroupStore";
import { usePollStore } from "../store/usePollStore";
import { useUserStore } from "../store/useUserStore";
import { useWatchHistoryStore, type HistoryEntry } from "../store/useWatchHistoryStore";
import { useWatchlistStore } from "../store/useWatchlistStore";
import { acceptAuthenticatedSession, endAuthenticatedSession } from "./sessionScope";

const testStorage = vi.hoisted(() => {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  vi.stubGlobal("localStorage", localStorage);
  return localStorage;
});

vi.mock("../api/historyApi", () => ({
  fetchPersonalHistory: vi.fn(),
  fetchGroupHistory: vi.fn(),
  updateHistoryEntry: vi.fn(),
  deleteHistoryEntry: vi.fn(),
  rateHistoryEntry: vi.fn(),
}));

const tokenFor = (id: string) => {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${encode({ alg: "none" })}.${encode({ id })}.signature`;
};

const entry = (id: string): HistoryEntry => ({
  _id: id,
  mediaType: "movie",
  scope: "personal",
  group: null,
  createdBy: { _id: "account-a", name: "Account A" },
  movie: { _id: "movie-a", title: "Private movie", imdbID: "tt0000001", vote_average: 8 },
  tv: null,
  participants: [{ _id: "account-a", name: "Account A" }],
  watchedAt: "2026-09-30T00:00:00.000Z",
  watchedLocation: "",
  watchedNotes: "",
  averageRating: null,
  ratingCount: 0,
  currentUserRating: null,
  ratings: [],
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
};

beforeEach(() => {
  testStorage.clear();
  endAuthenticatedSession();
  vi.mocked(historyApi.fetchPersonalHistory).mockReset();
});

describe("authenticated session isolation", () => {
  it("clears every user-scoped store on logout", () => {
    acceptAuthenticatedSession(tokenFor("account-a"));
    useWatchHistoryStore.setState({ personal: { items: [entry("a-history")], total: 1, nextCursor: null } });
    useWatchlistStore.setState({ movies: [{ _id: "a-watchlist", title: "Private", imdbID: "tt1", vote_average: 7 }] });
    useGroupStore.setState({ groupList: [{ _id: "a-group", name: "Private group", members: [] }] });
    usePollStore.setState({ pollHistory: [{ _id: "a-poll", name: "Private poll", round: 1, status: "active", createdAt: "2026-09-30" }] });
    useChatStore.setState({ messages: [{ role: "user", content: "private message" }] });
    useUserStore.setState({ profile: { _id: "account-a", name: "Account A", email: "private@example.test", avatar: "", firstLogin: false } });
    localStorage.setItem("history:activeTab", "a-group");

    endAuthenticatedSession();

    expect(useWatchHistoryStore.getState().personal.items).toEqual([]);
    expect(useWatchlistStore.getState().movies).toEqual([]);
    expect(useGroupStore.getState().groupList).toEqual([]);
    expect(usePollStore.getState().pollHistory).toEqual([]);
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useUserStore.getState().profile).toBeNull();
    expect(localStorage.getItem("history:activeTab")).toBeNull();
  });

  it("clears Account A data before accepting Account B", () => {
    acceptAuthenticatedSession(tokenFor("account-a"));
    useWatchHistoryStore.setState({ personal: { items: [entry("a-history")], total: 1, nextCursor: null } });

    acceptAuthenticatedSession(tokenFor("account-b"));

    expect(useWatchHistoryStore.getState().personal.items).toEqual([]);
  });

  it("discards a late Account A history response after Account B signs in", async () => {
    const request = deferred<any>();
    vi.mocked(historyApi.fetchPersonalHistory).mockReturnValueOnce(request.promise);
    acceptAuthenticatedSession(tokenFor("account-a"));
    const loading = useWatchHistoryStore.getState().fetchPersonal();

    acceptAuthenticatedSession(tokenFor("account-b"));
    request.resolve({ items: [entry("a-history")], nextCursor: null, stats: { total: 1 } });
    await loading;

    expect(useWatchHistoryStore.getState().personal.items).toEqual([]);
    expect(useWatchHistoryStore.getState().errors).toEqual({});
  });

  it("keeps Account B empty when its history fetch fails", async () => {
    acceptAuthenticatedSession(tokenFor("account-a"));
    useWatchHistoryStore.setState({ personal: { items: [entry("a-history")], total: 1, nextCursor: null } });
    acceptAuthenticatedSession(tokenFor("account-b"));
    vi.mocked(historyApi.fetchPersonalHistory).mockRejectedValueOnce(new Error("network failure"));

    await useWatchHistoryStore.getState().fetchPersonal();

    expect(useWatchHistoryStore.getState().personal.items).toEqual([]);
    expect(useWatchHistoryStore.getState().errors.personal).toBe("Unable to load your watch history.");
  });
});
