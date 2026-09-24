import { describe, expect, test, vi } from "vitest";
import type { HistoryEntry } from "../store/useWatchHistoryStore";
import { buildTimeline, TvSessionTimelineItem } from "./historyTimeline";
import { completeTrailingDay, CONTINUATION_PAGE_SIZE, HistoryPage, MAX_CONTINUATION_PAGES } from "./historyPagination";

const member = { _id: "u1", name: "Zad" };
let counter = 0;

const entry = (kind: "movie" | "tv", day: string, series = 1, ep = 1): HistoryEntry => ({
  _id: `e${++counter}`,
  mediaType: kind === "movie" ? "movie" : "tv_episode",
  scope: "personal",
  group: null,
  createdBy: member,
  movie: kind === "movie" ? { _id: "m", title: `Movie ${counter}`, imdbID: "", poster: "", vote_average: 0 } : null,
  tv:
    kind === "tv"
      ? { seriesTmdbId: series, seasonNumber: 1, episodeNumber: ep, episodeTmdbId: null, seriesTitle: `Series ${series}`, episodeTitle: "", posterPath: "", backdropPath: "", stillPath: "", airDate: null }
      : null,
  participants: [member],
  watchedAt: `${day}T00:00:00.000Z`,
  watchedLocation: "",
  watchedNotes: "",
  averageRating: null,
  ratingCount: 0,
  currentUserRating: null,
  ratings: [],
});

/** Simulates the server: newest-first list, cursor = "everything after this id". */
const serverFrom = (all: HistoryEntry[]) =>
  vi.fn(async (cursor: string, limit: number): Promise<HistoryPage> => {
    const start = all.findIndex((item) => item._id === cursor) + 1;
    const slice = all.slice(start, start + limit);
    const hasMore = start + limit < all.length;
    return { items: slice, nextCursor: hasMore ? slice[slice.length - 1]._id : null };
  });

const firstPage = (all: HistoryEntry[], size: number): HistoryPage => ({
  items: all.slice(0, size),
  nextCursor: all.length > size ? all[size - 1]._id : null,
});

describe("completeTrailingDay", () => {
  test("does nothing when there is no next page", async () => {
    const all = [entry("tv", "2026-09-17", 1, 1), entry("tv", "2026-09-17", 1, 2)];
    const fetchMore = serverFrom(all);
    const result = await completeTrailingDay(firstPage(all, 5), fetchMore);
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
    expect(fetchMore).not.toHaveBeenCalled();
  });

  test("does nothing when the trailing day holds no TV episode", async () => {
    const all = [entry("tv", "2026-09-18"), entry("movie", "2026-09-17"), entry("movie", "2026-09-17"), entry("tv", "2026-09-16")];
    const fetchMore = serverFrom(all);
    const result = await completeTrailingDay(firstPage(all, 2), fetchMore);
    expect(result.items.map((item) => item._id)).toEqual([all[0]._id, all[1]._id]);
    expect(result.nextCursor).toBe(all[1]._id);
    expect(fetchMore).not.toHaveBeenCalled();
  });

  test("a session that starts before the boundary is completed from the next page", async () => {
    const all = [
      entry("movie", "2026-09-18"),
      entry("tv", "2026-09-17", 1, 1), // raw 2 — last on the page
      entry("tv", "2026-09-17", 1, 2), // raw 3
      entry("tv", "2026-09-17", 1, 3), // raw 4
      entry("movie", "2026-09-16"), // raw 5 — first of the earlier day
      entry("tv", "2026-09-15", 1, 4),
    ];
    const fetchMore = serverFrom(all);
    const result = await completeTrailingDay(firstPage(all, 2), fetchMore);
    expect(result.items.map((item) => item._id)).toEqual(all.slice(0, 4).map((item) => item._id));
    expect(result.nextCursor).toBe(all[3]._id);
    expect(fetchMore).toHaveBeenCalledTimes(1);
    expect(fetchMore).toHaveBeenCalledWith(all[1]._id, CONTINUATION_PAGE_SIZE);

    const session = buildTimeline(result.items).find((item) => item.kind === "tv_session") as TvSessionTimelineItem;
    expect(session.episodeSummary).toBe("S01 · E01–E03");

    // Continuing from the returned cursor yields exactly the untouched records.
    const next = await fetchMore(result.nextCursor!, 10);
    expect(next.items.map((item) => item._id)).toEqual([all[4]._id, all[5]._id]);
  });

  test("an interleaved movie on the same day does not stop completion, and the earlier-day record is not consumed", async () => {
    const all = [
      entry("tv", "2026-09-17", 1, 1), // page
      entry("movie", "2026-09-17"), // continuation, same day, different media
      entry("tv", "2026-09-17", 2, 1), // other series, same day
      entry("tv", "2026-09-17", 1, 2), // same session again
      entry("tv", "2026-09-16", 1, 3), // next day — must stay ahead of the cursor
    ];
    const fetchMore = serverFrom(all);
    const result = await completeTrailingDay(firstPage(all, 1), fetchMore);
    expect(result.items.map((item) => item._id)).toEqual(all.slice(0, 4).map((item) => item._id));
    expect(result.nextCursor).toBe(all[3]._id);
    const timeline = buildTimeline(result.items);
    expect(timeline.map((item) => item.id)).toEqual(["tv:1:2026-09-17", all[1]._id, "tv:2:2026-09-17"]);
    expect((timeline[0] as TvSessionTimelineItem).entries).toHaveLength(2);
  });

  test("keeps paging while the day continues and stops when history ends", async () => {
    const all = [entry("movie", "2026-09-18"), ...Array.from({ length: 60 }, (_, index) => entry("tv", "2026-09-17", 1, index + 1))];
    const fetchMore = serverFrom(all);
    const result = await completeTrailingDay(firstPage(all, 2), fetchMore);
    expect(result.items).toHaveLength(61);
    expect(result.nextCursor).toBeNull();
    expect(fetchMore).toHaveBeenCalledTimes(Math.ceil(59 / CONTINUATION_PAGE_SIZE));
  });

  test("is capped so a pathological day cannot pull everything", async () => {
    const all = Array.from({ length: (MAX_CONTINUATION_PAGES + 2) * CONTINUATION_PAGE_SIZE }, (_, index) => entry("tv", "2026-09-17", 1, index + 1));
    const fetchMore = serverFrom(all);
    const result = await completeTrailingDay(firstPage(all, 1), fetchMore);
    expect(fetchMore).toHaveBeenCalledTimes(MAX_CONTINUATION_PAGES);
    expect(result.items).toHaveLength(1 + MAX_CONTINUATION_PAGES * CONTINUATION_PAGE_SIZE);
    expect(result.nextCursor).toBe(result.items[result.items.length - 1]._id);
  });

  test("never duplicates a record already on the page", async () => {
    const a = entry("tv", "2026-09-17", 1, 1);
    const b = entry("tv", "2026-09-17", 1, 2);
    const fetchMore = vi.fn(async (): Promise<HistoryPage> => ({ items: [a, b], nextCursor: null }));
    const result = await completeTrailingDay({ items: [a], nextCursor: a._id }, fetchMore);
    expect(result.items.map((item) => item._id)).toEqual([a._id, b._id]);
  });
});
