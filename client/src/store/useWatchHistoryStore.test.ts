import { beforeEach, expect, test, vi } from "vitest";
import { useWatchHistoryStore } from "./useWatchHistoryStore";
import * as api from "../api/historyApi";

vi.mock("../api/historyApi", () => ({ fetchPersonalHistory: vi.fn(), deleteHistoryEntry: vi.fn() }));

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

test("keeps filtered pages in their own buckets and never touches the unfiltered one", async () => {
  vi.mocked(api.fetchPersonalHistory).mockResolvedValue({ items: [{ _id: "tv-9", mediaType: "tv_episode", watchedAt: "2026-10-05T12:00:00Z" }], nextCursor: null, stats: { total: 4 } } as any);
  await useWatchHistoryStore.getState().fetchPersonal(false, 1, "tv");
  expect(api.fetchPersonalHistory).toHaveBeenCalledWith({ limit: 100, type: "tv", monthPage: 1 });
  const state = useWatchHistoryStore.getState();
  expect(state.personal.items).toEqual([]);
  expect(state.typed["personal:tv"]).toMatchObject({ total: 4, items: [{ _id: "tv-9" }] });
  expect(state.typed["personal:movie"]).toBeUndefined();
  expect(state.loading["personal:tv"]).toBe(false);
});

test("a filtered load-more carries the type and appends to the filtered bucket", async () => {
  const first = { _id: "tv-1", mediaType: "tv_episode", watchedAt: "2026-10-05T12:00:00Z", tv: { seriesTmdbId: 1 } };
  const second = { _id: "tv-0", mediaType: "tv_episode", watchedAt: "2026-10-01T12:00:00Z", tv: { seriesTmdbId: 1 } };
  useWatchHistoryStore.setState({ typed: { "personal:tv": { items: [first as any], total: 9, nextCursor: "tv-1" } } });
  vi.mocked(api.fetchPersonalHistory).mockResolvedValue({ items: [second], nextCursor: null, stats: { total: 9 } } as any);
  await useWatchHistoryStore.getState().fetchPersonal(true, undefined, "tv");
  expect(api.fetchPersonalHistory).toHaveBeenCalledWith({ limit: 100, type: "tv", cursor: "tv-1" });
  expect(useWatchHistoryStore.getState().typed["personal:tv"]).toEqual({ items: [first, second], total: 9, nextCursor: null });
});

test("deleting and replacing entries applies to filtered buckets too", async () => {
  vi.mocked(api.deleteHistoryEntry).mockResolvedValue({});
  const movie = { _id: "m-1", mediaType: "movie", watchedAt: "2026-10-04T12:00:00Z", group: null };
  useWatchHistoryStore.setState({
    personal: { items: [movie as any], total: 1, nextCursor: null },
    typed: { "personal:movie": { items: [movie as any], total: 1, nextCursor: null }, "personal:tv": { items: [], total: 2, nextCursor: null } },
  });
  useWatchHistoryStore.getState().replaceEntry({ ...movie, watchedNotes: "edited" } as any);
  expect((useWatchHistoryStore.getState().typed["personal:movie"].items[0] as any).watchedNotes).toBe("edited");
  await useWatchHistoryStore.getState().deleteEntry("m-1");
  const { typed, personal } = useWatchHistoryStore.getState();
  expect(typed["personal:movie"]).toMatchObject({ items: [], total: 0 });
  expect(typed["personal:tv"].total).toBe(2);
  expect(personal.total).toBe(0);
});
