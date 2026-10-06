import { beforeEach, expect, test, vi } from "vitest";
import { useWatchHistoryStore } from "./useWatchHistoryStore";
import * as api from "../api/historyApi";

vi.mock("../api/historyApi", () => ({ fetchPersonalHistory: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  useWatchHistoryStore.setState({ personal: { items: [], total: 0, nextCursor: null }, loading: {}, errors: {} });
});

test("loads older movies after a TV page while retaining existing entries and total", async () => {
  const tv = { _id: "tv-1", mediaType: "tv_episode", watchedAt: "2026-10-05T12:00:00Z", tv: { seriesTmdbId: 1 } };
  const movie = { _id: "movie-1", mediaType: "movie", watchedAt: "2026-10-04T12:00:00Z" };
  useWatchHistoryStore.setState({ personal: { items: [tv as any], total: 163, nextCursor: "tv-1" } });
  vi.mocked(api.fetchPersonalHistory).mockResolvedValue({ items: [movie], nextCursor: null, stats: { total: 27 } } as any);
  await useWatchHistoryStore.getState().fetchPersonal(true);
  expect(api.fetchPersonalHistory).toHaveBeenCalledWith({ limit: 100, cursor: "tv-1" });
  expect(useWatchHistoryStore.getState().personal).toEqual({ items: [tv, movie], total: 163, nextCursor: null });
  await useWatchHistoryStore.getState().fetchPersonal(true);
  expect(api.fetchPersonalHistory).toHaveBeenCalledTimes(1);
});
