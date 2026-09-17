import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { buildTvEpisodeHistoryPayload, createTvEpisodeHistoryEntries } from "../api/historyApi";
import type { TvEpisodeDetails, TvSeriesDetails } from "../api/tmdb";
import { describeEpisodeSelection, toTvWatchIdentity, useAddTvWatch } from "./useAddTvWatch";

const post = vi.hoisted(() => vi.fn());
vi.mock("../api/apiClient", () => ({ default: { post } }));

const series = {
  seriesTmdbId: 199925,
  seriesTitle: "Special Ops: Lioness",
  posterPath: "/lioness.jpg",
  backdropPath: "/lioness-bd.jpg",
} as TvSeriesDetails;

const episode = (episodeNumber: number, over: Partial<TvEpisodeDetails> = {}) =>
  ({
    seriesTmdbId: 199925,
    episodeTmdbId: 4321000 + episodeNumber,
    seasonNumber: 1,
    episodeNumber,
    episodeTitle: `Ep ${episodeNumber}`,
    airDate: "2023-07-23",
    stillPath: episodeNumber === 2 ? null : `/e${episodeNumber}.jpg`,
    runtime: 45,
    overview: null,
    voteAverage: null,
    voteCount: null,
    productionCode: null,
    cast: [],
    guestStars: [],
    crew: [],
    externalIds: null,
    ...over,
  }) as TvEpisodeDetails;

const identity = (episodeNumber: number, over: Partial<TvEpisodeDetails> = {}) => toTvWatchIdentity(series, episode(episodeNumber, over));

beforeEach(() => {
  // jsdom here runs with an opaque origin, so Storage is unusable; the auth
  // header helper only needs getItem.
  vi.stubGlobal("localStorage", { getItem: () => "test-token", setItem: () => undefined, removeItem: () => undefined });
  post.mockReset();
  post.mockImplementation(async (_url: string, payload: any) => ({ data: { entry: { _id: `id-${payload.tv.episodeNumber}`, ...payload } } }));
});

describe("TV history payloads", () => {
  test("personal payload carries the tv identity and never a movieId", () => {
    const payload = buildTvEpisodeHistoryPayload(identity(1), { scopeId: "personal", watchedAt: "2024-04-01", watchedNotes: "" });
    expect(payload).toEqual({
      mediaType: "tv_episode",
      tv: {
        seriesTmdbId: 199925,
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTmdbId: 4321001,
        seriesTitle: "Special Ops: Lioness",
        episodeTitle: "Ep 1",
        posterPath: "/lioness.jpg",
        backdropPath: "/lioness-bd.jpg",
        stillPath: "/e1.jpg",
        airDate: "2023-07-23",
      },
      scope: "personal",
      watchedAt: "2024-04-01",
    });
    expect("movieId" in payload).toBe(false);
    expect("groupId" in payload).toBe(false);
    expect("participants" in payload).toBe(false);
  });

  test("omits optional fields that are missing instead of sending placeholders", () => {
    const payload = buildTvEpisodeHistoryPayload(identity(2, { episodeTmdbId: null, airDate: null }), { scopeId: "personal" });
    expect(payload.tv).toEqual({
      seriesTmdbId: 199925,
      seasonNumber: 1,
      episodeNumber: 2,
      seriesTitle: "Special Ops: Lioness",
      episodeTitle: "Ep 2",
      posterPath: "/lioness.jpg",
      backdropPath: "/lioness-bd.jpg",
    });
    expect("watchedAt" in payload).toBe(false);
  });

  test("group payload carries groupId and participants", () => {
    const payload = buildTvEpisodeHistoryPayload(identity(1), {
      scopeId: "group-1",
      participants: ["u1", "u2"],
      watchedLocation: "Couch",
    });
    expect(payload).toMatchObject({ scope: "group", groupId: "group-1", participants: ["u1", "u2"], watchedLocation: "Couch" });
    expect("movieId" in payload).toBe(false);
  });

  test("one episode → one request; several episodes → one request each", async () => {
    await createTvEpisodeHistoryEntries([identity(1)], { scopeId: "personal" });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe("/api/history");

    post.mockClear();
    const result = await createTvEpisodeHistoryEntries([identity(1), identity(2), identity(3)], { scopeId: "personal" });
    expect(post).toHaveBeenCalledTimes(3);
    expect(post.mock.calls.map((call) => call[1].tv.episodeNumber)).toEqual([1, 2, 3]);
    expect(result.succeeded).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
  });

  test("the same episode can be recorded again later", async () => {
    await createTvEpisodeHistoryEntries([identity(1)], { scopeId: "personal", watchedAt: "2024-01-01" });
    await createTvEpisodeHistoryEntries([identity(1)], { scopeId: "personal", watchedAt: "2024-06-01" });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][1].watchedAt).toBe("2024-01-01");
    expect(post.mock.calls[1][1].watchedAt).toBe("2024-06-01");
  });

  test("partial failure is reported per episode", async () => {
    post.mockImplementation(async (_url: string, payload: any) => {
      if ([3, 5].includes(payload.tv.episodeNumber)) {
        throw { response: { data: { msg: "Server hiccup" } } };
      }
      return { data: { entry: { _id: `id-${payload.tv.episodeNumber}` } } };
    });
    const result = await createTvEpisodeHistoryEntries([1, 2, 3, 4, 5].map((n) => identity(n)), { scopeId: "personal" });
    expect(result.succeeded.map((item) => item.episode.episodeNumber)).toEqual([1, 2, 4]);
    expect(result.failed.map((item) => [item.episode.episodeNumber, item.message])).toEqual([
      [3, "Server hiccup"],
      [5, "Server hiccup"],
    ]);
  });
});

describe("describeEpisodeSelection", () => {
  test("uses ranges only for contiguous runs", () => {
    expect(describeEpisodeSelection([{ seasonNumber: 1, episodeNumber: 1 }, { seasonNumber: 1, episodeNumber: 2 }, { seasonNumber: 1, episodeNumber: 3 }])).toBe("S01 · E01–E03");
    expect(describeEpisodeSelection([{ seasonNumber: 1, episodeNumber: 5 }, { seasonNumber: 1, episodeNumber: 1 }, { seasonNumber: 1, episodeNumber: 3 }])).toBe("S01 · E01, E03, E05");
    expect(describeEpisodeSelection([{ seasonNumber: 2, episodeNumber: 1 }, { seasonNumber: 1, episodeNumber: 8 }])).toBe("S01 · E08 · S02 · E01");
    expect(describeEpisodeSelection([{ seasonNumber: 0, episodeNumber: 1 }])).toBe("S00 · E01");
    expect(describeEpisodeSelection([])).toBe("");
  });
});

describe("useAddTvWatch", () => {
  const selection = { series, episodes: [episode(1), episode(2), episode(3)] };

  test("submits each pending episode once, refreshes, and ignores a second submit while in flight", async () => {
    const resolvers: Array<() => void> = [];
    post.mockImplementation(
      (_url: string, payload: any) =>
        new Promise((resolve) => {
          resolvers.push(() => resolve({ data: { entry: { _id: `id-${payload.tv.episodeNumber}` } } }));
        })
    );
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAddTvWatch({ onSaved }));

    act(() => result.current.setPending(selection));
    expect(result.current.pending).toBe(selection);

    let first!: Promise<unknown>;
    act(() => {
      first = result.current.submit("personal", { watchedDate: "2024-04-01", watchedWhere: "", watchedWith: [], watchedNotes: "" });
    });
    expect(result.current.pending).toBeNull();
    await waitFor(() => expect(result.current.submitting).toBe(true));
    expect(post).toHaveBeenCalledTimes(3);

    // A second submit (double click) finds nothing pending and sends nothing;
    // a retry while in flight is blocked by the guard.
    let second: unknown;
    await act(async () => {
      second = await result.current.submit("personal");
    });
    expect(second).toBeNull();
    act(() => result.current.setPending(selection));
    await act(async () => {
      second = await result.current.submit("personal");
    });
    expect(second).toBeNull();
    expect(post).toHaveBeenCalledTimes(3);

    await act(async () => {
      resolvers.forEach((resolve) => resolve());
      await first;
    });
    expect(result.current.submitting).toBe(false);
    expect(result.current.outcome).toMatchObject({ succeeded: 3, failed: [] });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.every((call) => call[1].mediaType === "tv_episode" && !("movieId" in call[1]))).toBe(true);
  });

  test("reports partial failure and retries only the failed episodes", async () => {
    post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.tv.episodeNumber === 2) throw { response: { data: { msg: "Nope" } } };
      return { data: { entry: { _id: `id-${payload.tv.episodeNumber}` } } };
    });
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAddTvWatch({ onSaved }));
    act(() => result.current.setPending(selection));

    let outcome: any;
    await act(async () => {
      outcome = await result.current.submit("group-1", { watchedDate: "2024-04-01", watchedWhere: "Couch", watchedWith: ["u1"], watchedNotes: "" });
    });
    expect(outcome).toMatchObject({ scopeId: "group-1", seriesTitle: "Special Ops: Lioness", succeeded: 2 });
    expect(outcome.failed.map((item: any) => item.episode.episodeNumber)).toEqual([2]);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(result.current.outcome?.failed).toHaveLength(1);
    expect(post).toHaveBeenCalledTimes(3);

    post.mockClear();
    post.mockImplementation(async (_url: string, payload: any) => ({ data: { entry: { _id: `id-${payload.tv.episodeNumber}` } } }));
    await act(async () => {
      await result.current.retryFailed();
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({ scope: "group", groupId: "group-1", participants: ["u1"], watchedLocation: "Couch", tv: { episodeNumber: 2 } });
    expect(result.current.outcome?.failed).toHaveLength(0);
    expect(onSaved).toHaveBeenCalledTimes(2);
  });

  test("a submission with zero successes does not trigger a refresh", async () => {
    post.mockRejectedValue(new Error("offline"));
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAddTvWatch({ onSaved }));
    act(() => result.current.setPending({ series, episodes: [episode(1)] }));
    await act(async () => {
      await result.current.submit("personal");
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.outcome).toMatchObject({ succeeded: 0 });
    expect(result.current.outcome?.failed[0].message).toBe("offline");
  });
});
