import { describe, expect, test } from "vitest";
import type { HistoryEntry } from "../store/useWatchHistoryStore";
import {
  buildTimeline,
  describeTvSessionEpisodes,
  historyCalendarDay,
  sortTimelineItems,
  timelineItemIsRated,
  timelineItemMatchesSearch,
  timelineItemRatingSortValue,
  timelineItemYear,
  TvSessionTimelineItem,
} from "./historyTimeline";

const member = { _id: "u1", name: "Zad" };
let counter = 0;

const base = (): Omit<HistoryEntry, "mediaType" | "movie" | "tv"> => ({
  _id: `e${++counter}`,
  scope: "personal",
  group: null,
  createdBy: member,
  participants: [member],
  watchedAt: "2026-09-17T00:00:00.000Z",
  watchedLocation: "",
  watchedNotes: "",
  averageRating: null,
  ratingCount: 0,
  currentUserRating: null,
  ratings: [],
});

const movie = (title: string, watchedAt: string, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  ...base(),
  mediaType: "movie",
  movie: { _id: `m-${title}`, title, imdbID: "", poster: `/${title}.jpg`, vote_average: 7 },
  tv: null,
  watchedAt,
  ...over,
});

const episode = (
  series: { id: number; title: string },
  season: number,
  ep: number,
  watchedAt: string,
  over: Partial<HistoryEntry> = {}
): HistoryEntry => ({
  ...base(),
  mediaType: "tv_episode",
  movie: null,
  tv: {
    seriesTmdbId: series.id,
    seasonNumber: season,
    episodeNumber: ep,
    episodeTmdbId: season * 1000 + ep,
    seriesTitle: series.title,
    episodeTitle: `${series.title} ${season}x${ep}`,
    posterPath: `/${series.id}.jpg`,
    backdropPath: `/${series.id}-bd.jpg`,
    stillPath: "",
    airDate: null,
  },
  watchedAt,
  ...over,
});

const LIONESS = { id: 199925, title: "Special Ops: Lioness" };
const SEVERANCE = { id: 95396, title: "Severance" };
const D17 = "2026-09-17T00:00:00.000Z";
const D18 = "2026-09-18T00:00:00.000Z";

const sessions = (items: ReturnType<typeof buildTimeline>) => items.filter((item): item is TvSessionTimelineItem => item.kind === "tv_session");

describe("historyCalendarDay", () => {
  test("is the UTC date, with an explicit midnight boundary", () => {
    expect(historyCalendarDay("2026-09-17T23:59:59Z")).toBe("2026-09-17");
    expect(historyCalendarDay("2026-09-18T00:00:00Z")).toBe("2026-09-18");
    expect(historyCalendarDay("2026-09-17T00:00:00.000Z")).toBe("2026-09-17");
    // A negative-offset local time that is already the next day in UTC.
    expect(historyCalendarDay("2026-09-17T20:00:00-05:00")).toBe("2026-09-18");
    expect(historyCalendarDay(new Date("2026-01-01T12:00:00Z"))).toBe("2026-01-01");
    expect(historyCalendarDay("not a date")).toBe("");
    expect(historyCalendarDay("")).toBe("");
    expect(historyCalendarDay(null)).toBe("");
  });
});

describe("buildTimeline — movies", () => {
  test("a single movie is one item wrapping that entry", () => {
    const entry = movie("Heat", D17);
    const items = buildTimeline([entry]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "movie", id: entry._id, calendarDay: "2026-09-17" });
    expect((items[0] as any).entry).toBe(entry);
  });

  test("the same movie twice on the same day stays two items — movies never group", () => {
    const first = movie("Heat", D17, { watchedLocation: "Home" });
    const second = movie("Heat", D17, { watchedLocation: "Home" });
    const items = buildTimeline([first, second]);
    expect(items.map((item) => item.kind)).toEqual(["movie", "movie"]);
    expect(items.map((item) => item.id)).toEqual([first._id, second._id]);
  });
});

describe("buildTimeline — TV sessions", () => {
  test("two episodes of one series on one day fold into one session with both records", () => {
    const e1 = episode(LIONESS, 1, 1, D17);
    const e2 = episode(LIONESS, 1, 2, D17);
    const items = buildTimeline([e2, e1]);
    expect(items).toHaveLength(1);
    const session = items[0] as TvSessionTimelineItem;
    expect(session).toMatchObject({
      kind: "tv_session",
      id: "tv:199925:2026-09-17",
      seriesTmdbId: 199925,
      seriesTitle: "Special Ops: Lioness",
      calendarDay: "2026-09-17",
      posterPath: "/199925.jpg",
      backdropPath: "/199925-bd.jpg",
      episodeSummary: "S01 · E01–E02",
      watchCount: 2,
    });
    expect(session.entries).toEqual([e2, e1]);
  });

  test("episodes from different seasons on the same day share one session", () => {
    const items = buildTimeline([episode(LIONESS, 2, 1, D17), episode(LIONESS, 1, 8, D17), episode(LIONESS, 2, 2, D17)]);
    expect(items).toHaveLength(1);
    expect((items[0] as TvSessionTimelineItem).episodeSummary).toBe("S01 · E08 · S02 · E01–E02");
  });

  test("the same series on different days is two sessions", () => {
    const items = buildTimeline([episode(LIONESS, 1, 2, D18), episode(LIONESS, 1, 1, D17)]);
    expect(items.map((item) => item.id)).toEqual(["tv:199925:2026-09-18", "tv:199925:2026-09-17"]);
  });

  test("different series on the same day are separate sessions", () => {
    const items = buildTimeline([episode(LIONESS, 1, 1, D17), episode(SEVERANCE, 1, 1, D17)]);
    expect(items.map((item) => item.id)).toEqual(["tv:199925:2026-09-17", "tv:95396:2026-09-17"]);
  });

  test("participants, location, season and episode play no part in the key", () => {
    const other = { _id: "u2", name: "Bea" };
    const items = buildTimeline([
      episode(LIONESS, 1, 1, D17, { participants: [member], watchedLocation: "Home" }),
      episode(LIONESS, 3, 4, D17, { participants: [member, other], watchedLocation: "Cinema" }),
    ]);
    expect(items).toHaveLength(1);
  });

  test("the same episode twice on the same day is one session that keeps both records", () => {
    const a = episode(LIONESS, 1, 1, D17);
    const b = episode(LIONESS, 1, 1, D17);
    const c = episode(LIONESS, 1, 2, D17);
    const items = buildTimeline([c, b, a]);
    expect(items).toHaveLength(1);
    const session = items[0] as TvSessionTimelineItem;
    expect(session.entries).toHaveLength(3);
    expect(session.entries.map((entry) => entry._id)).toEqual([c._id, b._id, a._id]);
    expect(session.watchCount).toBe(3);
    expect(session.episodeSummary).toBe("S01 · E01 ×2, E02");
  });

  test("session artwork falls back to the first entry that has it", () => {
    const bare = episode(LIONESS, 1, 1, D17);
    bare.tv!.posterPath = "";
    bare.tv!.backdropPath = "";
    const items = buildTimeline([bare, episode(LIONESS, 1, 2, D17)]);
    expect((items[0] as TvSessionTimelineItem).posterPath).toBe("/199925.jpg");
  });
});

describe("describeTvSessionEpisodes", () => {
  const tv = (season: number, ep: number) => ({ tv: { seasonNumber: season, episodeNumber: ep } as any });
  test("covers contiguous, non-contiguous, cross-season, rewatch and specials", () => {
    expect(describeTvSessionEpisodes([tv(1, 1), tv(1, 2), tv(1, 3), tv(1, 4)])).toBe("S01 · E01–E04");
    expect(describeTvSessionEpisodes([tv(1, 5), tv(1, 1), tv(1, 3)])).toBe("S01 · E01, E03, E05");
    expect(describeTvSessionEpisodes([tv(2, 2), tv(1, 8), tv(2, 1)])).toBe("S01 · E08 · S02 · E01–E02");
    expect(describeTvSessionEpisodes([tv(1, 1), tv(1, 1), tv(1, 2)])).toBe("S01 · E01 ×2, E02");
    expect(describeTvSessionEpisodes([tv(1, 3), tv(1, 3)])).toBe("S01 · E03 ×2");
    expect(describeTvSessionEpisodes([tv(0, 1), tv(0, 2)])).toBe("Specials · E01–E02");
    expect(describeTvSessionEpisodes([tv(0, 1), tv(1, 1)])).toBe("Specials · E01 · S01 · E01");
    expect(describeTvSessionEpisodes([tv(1, 7)])).toBe("S01 · E07");
    expect(describeTvSessionEpisodes([])).toBe("");
  });
});

describe("ordering", () => {
  test("movies and sessions interleave chronologically, newest first, sessions sorting by their newest entry", () => {
    const m19 = movie("Alien", "2026-09-19T00:00:00.000Z");
    const s17a = episode(LIONESS, 1, 1, "2026-09-17T21:00:00.000Z");
    const m17 = movie("Heat", "2026-09-17T20:00:00.000Z");
    const s17b = episode(LIONESS, 1, 2, "2026-09-17T19:00:00.000Z");
    const m16 = movie("Zodiac", "2026-09-16T00:00:00.000Z");
    // Input is newest-first as the API returns it.
    const items = buildTimeline([m19, s17a, m17, s17b, m16]);
    expect(items.map((item) => (item.kind === "movie" ? item.entry.movie!.title : item.id))).toEqual([
      "Alien",
      "tv:199925:2026-09-17",
      "Heat",
      "Zodiac",
    ]);
    expect(items[1].sortAt).toBe(new Date("2026-09-17T21:00:00.000Z").getTime());
  });

  test("ties keep input order deterministically", () => {
    const a = movie("A", D17);
    const b = episode(SEVERANCE, 1, 1, D17);
    const c = movie("C", D17);
    expect(buildTimeline([a, b, c]).map((item) => item.id)).toEqual([a._id, "tv:95396:2026-09-17", c._id]);
    expect(buildTimeline([c, b, a]).map((item) => item.id)).toEqual([c._id, "tv:95396:2026-09-17", a._id]);
  });
});

describe("search / filter / sort helpers", () => {
  const rated = (entry: HistoryEntry, value: number, mine = true) => ({
    ...entry,
    averageRating: mine ? null : value,
    currentUserRating: mine ? value : null,
  });

  test("a query matching one episode keeps the whole session intact", () => {
    const [session] = buildTimeline([episode(LIONESS, 1, 1, D17), episode(LIONESS, 1, 2, D17)]);
    expect(timelineItemMatchesSearch(session, "lioness 1x2")).toBe(true);
    expect(timelineItemMatchesSearch(session, "S01E02")).toBe(true);
    expect(timelineItemMatchesSearch(session, "s01e01")).toBe(true);
    expect(timelineItemMatchesSearch(session, "severance")).toBe(false);
    expect((session as TvSessionTimelineItem).entries).toHaveLength(2);
    const [film] = buildTimeline([movie("Heat", D17)]);
    expect(timelineItemMatchesSearch(film, "HEAT")).toBe(true);
    expect(timelineItemMatchesSearch(film, "")).toBe(true);
  });

  test("this-year filtering uses the calendar day of the item", () => {
    const [session, film] = buildTimeline([episode(LIONESS, 1, 1, "2026-01-01T00:00:00.000Z"), movie("Old", "2025-12-31T23:59:59.000Z")]);
    expect(timelineItemYear(session)).toBe(2026);
    expect(timelineItemYear(film)).toBe(2025);
  });

  test("rated filtering keeps a session when any entry is rated, without touching its entries", () => {
    const unrated = episode(LIONESS, 1, 1, D17);
    const [session] = buildTimeline([unrated, rated(episode(LIONESS, 1, 2, D17), 8)]);
    expect(timelineItemIsRated(session)).toBe(true);
    expect((session as TvSessionTimelineItem).entries).toHaveLength(2);
    const [bare] = buildTimeline([episode(LIONESS, 1, 1, D17)]);
    expect(timelineItemIsRated(bare)).toBe(false);
    const [film] = buildTimeline([rated(movie("Heat", D17), 9, false)]);
    expect(timelineItemIsRated(film)).toBe(true);
  });

  test("title sort uses movie title vs series title", () => {
    const items = buildTimeline([movie("Zodiac", D17), episode(SEVERANCE, 1, 1, D17), movie("Alien", D17), episode(LIONESS, 1, 1, D17)]);
    expect(sortTimelineItems(items, "title").map((item) => (item.kind === "movie" ? item.entry.movie!.title : item.seriesTitle))).toEqual([
      "Alien",
      "Severance",
      "Special Ops: Lioness",
      "Zodiac",
    ]);
  });

  test("rating sort uses the mean of rated entries for a session and treats unrated as lowest", () => {
    const items = buildTimeline([
      rated(movie("Heat", D17), 9),
      episode(SEVERANCE, 1, 1, D18),
      rated(episode(LIONESS, 1, 1, D17), 10),
      episode(LIONESS, 1, 2, D17),
      rated(episode(LIONESS, 1, 3, D17), 6, false),
    ]);
    const lioness = items.find((item) => item.id === "tv:199925:2026-09-17")!;
    expect(timelineItemRatingSortValue(lioness)).toBe(8);
    expect(timelineItemRatingSortValue(items.find((item) => item.id === "tv:95396:2026-09-18")!)).toBeNull();
    expect(sortTimelineItems(items, "rating").map((item) => item.id)).toEqual([items.find((i) => i.kind === "movie")!.id, "tv:199925:2026-09-17", "tv:95396:2026-09-18"]);
  });
});

describe("regrouping after mutations", () => {
  test("moving one episode to another day splits the session", () => {
    const e1 = episode(LIONESS, 1, 1, D17);
    const e2 = episode(LIONESS, 1, 2, D17);
    expect(buildTimeline([e2, e1]).map((item) => item.id)).toEqual(["tv:199925:2026-09-17"]);
    const moved = { ...e2, watchedAt: D18 };
    const after = buildTimeline([moved, e1]);
    expect(after.map((item) => item.id)).toEqual(["tv:199925:2026-09-18", "tv:199925:2026-09-17"]);
    expect(sessions(after).map((session) => session.episodeSummary)).toEqual(["S01 · E02", "S01 · E01"]);
  });

  test("deleting one occurrence of a rewatched episode leaves the other", () => {
    const first = episode(LIONESS, 1, 1, D17);
    const second = episode(LIONESS, 1, 1, D17);
    const before = buildTimeline([second, first])[0] as TvSessionTimelineItem;
    expect(before.episodeSummary).toBe("S01 · E01 ×2");
    const after = buildTimeline([second, first].filter((entry) => entry._id !== first._id))[0] as TvSessionTimelineItem;
    expect(after.entries.map((entry) => entry._id)).toEqual([second._id]);
    expect(after.episodeSummary).toBe("S01 · E01");
    expect(after.watchCount).toBe(1);
  });
});
