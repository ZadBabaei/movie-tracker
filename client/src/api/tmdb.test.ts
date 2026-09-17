import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  TmdbError,
  getTvEpisode,
  getTvSeason,
  getTvSeries,
  getTvSeriesExternalIds,
  isTmdbError,
  normalizeExternalIds,
  normalizeTvEpisodeDetails,
  normalizeTvSearchPage,
  normalizeTvSeasonDetails,
  normalizeTvSeriesDetails,
  searchTv,
  tmdbImageUrl,
  tvSeasonLabel,
} from "./tmdb";

// Trimmed real-shape TMDB payloads (Special Ops: Lioness, id 199925).
const searchPayload = {
  page: 1,
  total_pages: 1,
  total_results: 2,
  results: [
    {
      id: 199925,
      name: "Special Ops: Lioness",
      original_name: "Special Ops: Lioness",
      overview: "Joe attempts to balance her personal and professional life…",
      poster_path: "/lioness.jpg",
      backdrop_path: "/lioness-bd.jpg",
      first_air_date: "2023-07-23",
      vote_average: 7.9,
      vote_count: 250,
      popularity: 120.5,
      genre_ids: [18, 10759],
      origin_country: ["US"],
    },
    // Minimal result: no artwork, no dates, no overview.
    { id: 42, name: "Bare Minimum" },
    // Malformed: no id.
    { name: "Ghost" },
    // Malformed: no name.
    { id: 7 },
  ],
};

const seriesPayload = {
  id: 199925,
  name: "Special Ops: Lioness",
  original_name: "Special Ops: Lioness",
  tagline: "",
  overview: "Joe attempts to balance…",
  poster_path: "/lioness.jpg",
  backdrop_path: "/lioness-bd.jpg",
  first_air_date: "2023-07-23",
  last_air_date: "2025-10-12",
  status: "Returning Series",
  type: "Scripted",
  in_production: true,
  genres: [{ id: 18, name: "Drama" }, { id: 10759, name: "Action & Adventure" }, { id: 0, name: "bad" }],
  number_of_seasons: 2,
  number_of_episodes: 16,
  episode_run_time: [45],
  vote_average: 7.9,
  vote_count: 250,
  popularity: 120.5,
  original_language: "en",
  origin_country: ["US"],
  networks: [{ id: 4330, name: "Paramount+", logo_path: "/pplus.png" }],
  created_by: [{ id: 1120, name: "Taylor Sheridan", profile_path: null }],
  seasons: [
    { id: 300, season_number: 1, name: "Season 1", overview: "", poster_path: "/s1.jpg", air_date: "2023-07-23", episode_count: 8, vote_average: 7.5 },
    { id: 299, season_number: 0, name: "Specials", poster_path: null, air_date: null, episode_count: 2 },
    { id: 301, season_number: 2, name: "Season 2", poster_path: "/s2.jpg", air_date: "2024-10-27", episode_count: 8 },
  ],
  last_episode_to_air: { id: 5001, season_number: 2, episode_number: 8, name: "Finale", air_date: "2024-12-08", runtime: 52, still_path: "/fin.jpg", vote_average: 8.1 },
  next_episode_to_air: null,
  credits: {
    cast: [
      { id: 4000, name: "Zoe Saldaña", character: "Joe", profile_path: "/zoe.jpg", order: 0 },
      { id: 4001, name: "Laysla De Oliveira", character: "Cruz Manuelos", profile_path: null, order: 1 },
      { name: "No Id" },
    ],
  },
  external_ids: { imdb_id: "tt13111040", tvdb_id: 411000, wikidata_id: "Q1", facebook_id: null, instagram_id: "", twitter_id: null },
  images: {
    posters: [{ file_path: "/p1.jpg", width: 500, height: 750, iso_639_1: "en", vote_average: 5.3 }],
    backdrops: [{ file_path: "/b1.jpg", width: 1920, height: 1080, iso_639_1: null, vote_average: 5.4 }, { width: 1 }],
  },
};

const seasonPayload = {
  id: 300,
  season_number: 1,
  name: "Season 1",
  overview: "The first season.",
  poster_path: "/s1.jpg",
  air_date: "2023-07-23",
  vote_average: 7.5,
  episodes: [
    {
      id: 4321002,
      season_number: 1,
      episode_number: 2,
      name: "The Beating",
      overview: "Cruz endures…",
      air_date: "2023-07-23",
      runtime: 48,
      still_path: "/e2.jpg",
      vote_average: 7.6,
      vote_count: 12,
      production_code: "102",
      crew: [{ id: 9001, name: "John Hillcoat", job: "Director", department: "Directing", profile_path: null }],
      guest_stars: [{ id: 9100, name: "Guest One", character: "Kyle", profile_path: "/g1.jpg", order: 3 }],
    },
    {
      id: 4321001,
      season_number: 1,
      episode_number: 1,
      name: "Sacrificial Soldiers",
      overview: "",
      air_date: "2023-07-23",
      runtime: null,
      still_path: null,
      vote_average: 0,
      crew: [],
      guest_stars: [],
    },
    { id: 999, name: "no numbers" },
  ],
};

const episodePayload = {
  id: 4321001,
  season_number: 1,
  episode_number: 1,
  name: "Sacrificial Soldiers",
  overview: "Joe's team…",
  air_date: "2023-07-23",
  runtime: 55,
  still_path: "/e1.jpg",
  vote_average: 7.4,
  vote_count: 30,
  credits: {
    cast: [{ id: 4000, name: "Zoe Saldaña", character: "Joe", profile_path: "/zoe.jpg", order: 0 }],
    guest_stars: [{ id: 9100, name: "Guest One", character: "Kyle", profile_path: null, order: 5 }],
    crew: [{ id: 9001, name: "John Hillcoat", job: "Director", department: "Directing" }],
  },
  external_ids: { imdb_id: "tt27000001", tvdb_id: null, wikidata_id: null },
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("VITE_TMDB_API_KEY", "test-key");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const requestedUrl = (call = 0) => new URL(String(fetchMock.mock.calls[call][0]));

describe("normalization", () => {
  test("search page keeps valid results and drops malformed ones", () => {
    const page = normalizeTvSearchPage(searchPayload);
    expect(page.totalResults).toBe(2);
    expect(page.results.map((result) => result.seriesTmdbId)).toEqual([199925, 42]);
    const [lioness, bare] = page.results;
    expect(lioness.seriesTitle).toBe("Special Ops: Lioness");
    expect(lioness.firstAirDate).toBe("2023-07-23");
    expect(lioness.genreIds).toEqual([18, 10759]);
    expect(bare).toMatchObject({ posterPath: null, backdropPath: null, overview: null, firstAirDate: null, voteAverage: null, genreIds: [] });
  });

  test("series details normalize metadata, seasons, cast, external ids and images", () => {
    const series = normalizeTvSeriesDetails(seriesPayload);
    expect(series.seriesTmdbId).toBe(199925);
    expect(series.tagline).toBeNull();
    expect(series.status).toBe("Returning Series");
    expect(series.numberOfSeasons).toBe(2);
    expect(series.numberOfEpisodes).toBe(16);
    expect(series.episodeRunTime).toBe(45);
    expect(series.genres).toEqual([{ id: 18, name: "Drama" }, { id: 10759, name: "Action & Adventure" }]);
    expect(series.networks[0]).toEqual({ id: 4330, name: "Paramount+", logoPath: "/pplus.png" });
    expect(series.createdBy[0].name).toBe("Taylor Sheridan");
    expect(series.cast).toHaveLength(2);
    expect(series.cast[1].profilePath).toBeNull();
    expect(series.externalIds).toEqual({ imdbId: "tt13111040", tvdbId: 411000, wikidataId: "Q1", facebookId: null, instagramId: null, twitterId: null });
    expect(series.images.posters).toHaveLength(1);
    expect(series.images.backdrops).toHaveLength(1);
    expect(series.lastEpisodeToAir?.episodeNumber).toBe(8);
    expect(series.nextEpisodeToAir).toBeNull();
  });

  test("seasons are sorted and season 0 is marked as specials, not folded into season 1", () => {
    const { seasons } = normalizeTvSeriesDetails(seriesPayload);
    expect(seasons.map((season) => season.seasonNumber)).toEqual([0, 1, 2]);
    expect(seasons[0]).toMatchObject({ seasonNumber: 0, isSpecials: true, name: "Specials", posterPath: null, airDate: null, episodeCount: 2 });
    expect(seasons[1]).toMatchObject({ seasonNumber: 1, isSpecials: false });
    expect(tvSeasonLabel(0)).toBe("Specials");
    expect(tvSeasonLabel(0, "Extras")).toBe("Extras");
    expect(tvSeasonLabel(3)).toBe("Season 3");
    const specials = normalizeTvSeasonDetails({ season_number: 0, episodes: [{ id: 1, season_number: 0, episode_number: 1 }] }, 199925);
    expect(specials.isSpecials).toBe(true);
    expect(specials.name).toBe("Specials");
    expect(specials.episodes[0].seasonNumber).toBe(0);
  });

  test("season details normalize episodes in order with crew and guest stars", () => {
    const season = normalizeTvSeasonDetails(seasonPayload, 199925);
    expect(season.seriesTmdbId).toBe(199925);
    expect(season.episodeCount).toBe(2);
    expect(season.episodes.map((episode) => episode.episodeNumber)).toEqual([1, 2]);
    const second = season.episodes[1];
    expect(second.episodeTmdbId).toBe(4321002);
    expect(second.episodeTitle).toBe("The Beating");
    expect(second.runtime).toBe(48);
    expect(second.crew[0]).toMatchObject({ personTmdbId: 9001, job: "Director" });
    expect(second.guestStars[0]).toMatchObject({ personTmdbId: 9100, character: "Kyle" });
    expect(second.externalIds).toBeNull();
  });

  test("episode with missing still, runtime, overview and credits stays explicit-null", () => {
    const first = normalizeTvSeasonDetails(seasonPayload, 199925).episodes[0];
    expect(first).toMatchObject({
      episodeNumber: 1,
      stillPath: null,
      runtime: null,
      overview: null,
      cast: [],
      guestStars: [],
      crew: [],
      externalIds: null,
    });
    expect(first.voteAverage).toBe(0);
  });

  test("episode details normalize cast, guest stars, crew and external ids", () => {
    const episode = normalizeTvEpisodeDetails(episodePayload, 199925);
    expect(episode).toMatchObject({ seriesTmdbId: 199925, seasonNumber: 1, episodeNumber: 1, episodeTmdbId: 4321001, runtime: 55, stillPath: "/e1.jpg" });
    expect(episode.cast[0].name).toBe("Zoe Saldaña");
    expect(episode.guestStars[0].character).toBe("Kyle");
    expect(episode.crew[0].job).toBe("Director");
    expect(episode.externalIds).toEqual({ imdbId: "tt27000001", tvdbId: null, wikidataId: null, facebookId: null, instagramId: null, twitterId: null });
  });

  test("missing external ids are all null and non-IMDb ids are ignored", () => {
    expect(normalizeExternalIds(undefined)).toEqual({ imdbId: null, tvdbId: null, wikidataId: null, facebookId: null, instagramId: null, twitterId: null });
    expect(normalizeExternalIds({ imdb_id: "tmdb-123" }).imdbId).toBeNull();
    const series = normalizeTvSeriesDetails({ ...seriesPayload, external_ids: undefined, images: undefined, credits: undefined, episode_run_time: [] });
    expect(series.externalIds.imdbId).toBeNull();
    expect(series.cast).toEqual([]);
    expect(series.images).toEqual({ posters: [], backdrops: [] });
    expect(series.episodeRunTime).toBeNull();
  });

  test("minimal series payload normalizes; malformed identity throws", () => {
    const series = normalizeTvSeriesDetails({ id: 5, name: "Tiny" });
    expect(series).toMatchObject({ seriesTmdbId: 5, seriesTitle: "Tiny", posterPath: null, backdropPath: null, overview: null, status: null, numberOfSeasons: null, seasons: [], genres: [] });
    expect(() => normalizeTvSeriesDetails({ name: "No id" })).toThrowError(TmdbError);
    expect(() => normalizeTvSeriesDetails({ id: 5 })).toThrowError(/name/);
    expect(() => normalizeTvSeasonDetails({ name: "no number" }, 5)).toThrowError(/season number/);
    expect(() => normalizeTvEpisodeDetails({ id: 1, season_number: 1 }, 5)).toThrowError(/season\/episode/);
    expect(normalizeTvSearchPage(null).results).toEqual([]);
    expect(normalizeTvSearchPage("garbage").totalResults).toBe(0);
  });

  test("image urls are absolute and never fabricated", () => {
    expect(tmdbImageUrl("/x.jpg", "w342")).toBe("https://image.tmdb.org/t/p/w342/x.jpg");
    expect(tmdbImageUrl("x.jpg")).toBe("https://image.tmdb.org/t/p/w500/x.jpg");
    expect(tmdbImageUrl("https://cdn.example/x.jpg")).toBe("https://cdn.example/x.jpg");
    expect(tmdbImageUrl(null)).toBe("");
    expect(tmdbImageUrl(undefined, "w300")).toBe("");
  });
});

describe("requests", () => {
  test("searchTv calls /search/tv with the key and query, and skips blank queries", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(searchPayload));
    const page = await searchTv("  lioness ", { page: 2 });
    expect(page.results[0].seriesTmdbId).toBe(199925);
    const url = requestedUrl();
    expect(url.pathname).toBe("/3/search/tv");
    expect(url.searchParams.get("api_key")).toBe("test-key");
    expect(url.searchParams.get("query")).toBe("lioness");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("include_adult")).toBe("false");

    fetchMock.mockClear();
    expect(await searchTv("   ")).toEqual({ page: 1, totalPages: 0, totalResults: 0, results: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("getTvSeries appends credits, external_ids and images in one request", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(seriesPayload));
    const series = await getTvSeries(199925);
    expect(series.cast).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = requestedUrl();
    expect(url.pathname).toBe("/3/tv/199925");
    expect(url.searchParams.get("append_to_response")).toBe("credits,external_ids,images");
    expect(url.searchParams.get("include_image_language")).toBe("en,null");
  });

  test("getTvSeason and getTvEpisode hit the season/episode endpoints", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(seasonPayload)).mockResolvedValueOnce(jsonResponse(episodePayload));
    const season = await getTvSeason(199925, 1);
    expect(season.episodes).toHaveLength(2);
    expect(requestedUrl(0).pathname).toBe("/3/tv/199925/season/1");

    const episode = await getTvEpisode(199925, 1, 1);
    expect(episode.episodeTitle).toBe("Sacrificial Soldiers");
    expect(requestedUrl(1).pathname).toBe("/3/tv/199925/season/1/episode/1");
    expect(requestedUrl(1).searchParams.get("append_to_response")).toBe("credits,external_ids");
  });

  test("getTvSeriesExternalIds returns normalized ids", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ imdb_id: "tt1", tvdb_id: 2 }));
    expect(await getTvSeriesExternalIds(199925)).toMatchObject({ imdbId: "tt1", tvdbId: 2 });
    expect(requestedUrl().pathname).toBe("/3/tv/199925/external_ids");
  });

  test("responses whose identity does not match the request are rejected", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...seasonPayload, season_number: 2 }));
    await expect(getTvSeason(199925, 1)).rejects.toMatchObject({ kind: "malformed" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...episodePayload, episode_number: 3 }));
    await expect(getTvEpisode(199925, 1, 1)).rejects.toMatchObject({ kind: "malformed" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...seriesPayload, id: 1 }));
    await expect(getTvSeries(199925)).rejects.toMatchObject({ kind: "malformed" });
  });

  test("404, 401, 429 and other non-2xx map to typed errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status_message: "The resource you requested could not be found." }, 404));
    const notFound = await getTvEpisode(199925, 9, 99).catch((error) => error);
    expect(isTmdbError(notFound)).toBe(true);
    expect(notFound).toMatchObject({ kind: "not_found", status: 404, message: "The resource you requested could not be found." });

    fetchMock.mockResolvedValueOnce(jsonResponse({ status_message: "Invalid API key" }, 401));
    await expect(getTvSeries(1)).rejects.toMatchObject({ kind: "unauthorized", status: 401 });

    fetchMock.mockResolvedValueOnce(new Response("slow down", { status: 429 }));
    await expect(getTvSeries(2)).rejects.toMatchObject({ kind: "rate_limited", status: 429 });

    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    await expect(getTvSeries(3)).rejects.toMatchObject({ kind: "http", status: 503, message: "TMDB responded with HTTP 503." });
  });

  test("network failures, aborts, non-JSON bodies and a missing key are typed", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(getTvSeries(4)).rejects.toMatchObject({ kind: "network" });

    const abort = new DOMException("The operation was aborted.", "AbortError");
    fetchMock.mockRejectedValueOnce(abort);
    await expect(getTvSeries(5, { signal: new AbortController().signal })).rejects.toMatchObject({ kind: "aborted" });

    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    await expect(getTvSeries(6)).rejects.toMatchObject({ kind: "malformed" });

    vi.stubEnv("VITE_TMDB_API_KEY", "");
    fetchMock.mockClear();
    await expect(searchTv("lioness")).rejects.toMatchObject({ kind: "config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("identical concurrent requests share one fetch; sequential ones do not", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(seriesPayload));
    const [a, b] = await Promise.all([getTvSeries(199925), getTvSeries(199925)]);
    expect(a.seriesTmdbId).toBe(b.seriesTmdbId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getTvSeries(199925);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
