import { describe, expect, test } from "vitest";
import type { HistoryEntry } from "../store/useWatchHistoryStore";
import { groupOccurrencesByMonth, parseSeriesScope, parseSeriesTmdbId, seriesHistoryPath, sortOccurrences, summarizeSeriesHistory } from "./seriesHistory";

const member = { _id: "u1", name: "Zad", avatar: "" };
const entry = (id: string, watchedAt: string, seasonNumber: number, episodeNumber: number, mediaType: HistoryEntry["mediaType"] = "tv_episode"): HistoryEntry => ({
  _id: id,
  mediaType,
  scope: "personal",
  group: null,
  createdBy: member,
  movie: mediaType === "movie" ? { _id: "mv", title: "Heat", imdbID: "tmdb-949", poster: "/heat.jpg", vote_average: 8 } : null,
  tv: mediaType === "movie" ? null : { seriesTmdbId: 95396, seasonNumber, episodeNumber, episodeTmdbId: null, seriesTitle: "Severance", episodeTitle: "", posterPath: id === "a" ? "/p.jpg" : "", backdropPath: "", stillPath: id === "b" ? "/still.jpg" : "", airDate: null },
  participants: [member],
  watchedAt,
  watchedLocation: "",
  watchedNotes: "",
  averageRating: null,
  ratingCount: 0,
  currentUserRating: null,
  ratings: [],
});

describe("series route parsing", () => {
  test("accepts only positive integers as the series id", () => {
    expect(parseSeriesTmdbId("95396")).toBe(95396);
    for (const bad of [undefined, "", "0", "-1", "1.5", "abc", "12abc", " 12", "99999999999999999999"]) expect(parseSeriesTmdbId(bad)).toBeNull();
  });

  test("defaults to personal and validates group ids", () => {
    expect(parseSeriesScope(new URLSearchParams(""))).toEqual({ scope: "personal", groupId: null, invalid: false });
    expect(parseSeriesScope(new URLSearchParams("scope=personal"))).toEqual({ scope: "personal", groupId: null, invalid: false });
    expect(parseSeriesScope(new URLSearchParams("scope=group&groupId=6aaea452ff0f6834ac031999"))).toEqual({ scope: "group", groupId: "6aaea452ff0f6834ac031999", invalid: false });
    expect(parseSeriesScope(new URLSearchParams("scope=group"))).toMatchObject({ scope: "group", invalid: true });
    expect(parseSeriesScope(new URLSearchParams("scope=group&groupId=nope"))).toMatchObject({ scope: "group", invalid: true });
    expect(seriesHistoryPath(95396, "personal")).toBe("/history/tv/95396?scope=personal");
    expect(seriesHistoryPath(95396, "group", "abc")).toBe("/history/tv/95396?scope=group&groupId=abc");
  });
});

describe("series history summary", () => {
  const rows = [
    entry("a", "2024-05-10T00:00:00.000Z", 1, 3),
    entry("b", "2024-05-10T00:00:00.000Z", 1, 3), // same-day rewatch, distinct _id
    entry("c", "2024-06-01T00:00:00.000Z", 2, 1),
    entry("d", "2024-04-02T00:00:00.000Z", 1, 1),
    entry("m", "2024-07-01T00:00:00.000Z", 0, 0, "movie"),
  ];

  test("counts every occurrence, dedupes episodes and seasons, and ignores non-TV rows", () => {
    expect(summarizeSeriesHistory(rows)).toEqual({
      watchCount: 4,
      uniqueEpisodes: 3,
      seasonsWatched: 2,
      firstWatchedAt: "2024-04-02T00:00:00.000Z",
      latestWatchedAt: "2024-06-01T00:00:00.000Z",
      seriesTitle: "Severance",
      posterPath: "/p.jpg",
      backdropPath: "/still.jpg",
    });
    expect(summarizeSeriesHistory([])).toMatchObject({ watchCount: 0, uniqueEpisodes: 0, firstWatchedAt: null, latestWatchedAt: null, seriesTitle: "" });
  });

  test("sorts newest first with _id descending as the tie-break and never merges rows", () => {
    expect(sortOccurrences(rows.slice(0, 4)).map((row) => row._id)).toEqual(["c", "b", "a", "d"]);
    const months = groupOccurrencesByMonth(rows.slice(0, 4));
    expect(months.map((month) => [month.key, month.month, month.entries.map((row) => row._id)])).toEqual([
      ["2024-06", "June", ["c"]],
      ["2024-05", "May", ["b", "a"]],
      ["2024-04", "April", ["d"]],
    ]);
  });
});
