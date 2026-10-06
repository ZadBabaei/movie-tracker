import assert from "node:assert/strict";
import { test } from "node:test";
import { createTmdbTvEpisodeResolver } from "../services/integrations/tmdbTvEpisodeResolver";
import { TmdbMovieResolverError } from "../services/integrations/tmdbMovieResolver";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
test("TV resolver finds series by IMDb then resolves exact episode metadata", async () => {
  const urls: URL[] = [];
  const resolver = createTmdbTvEpisodeResolver({ apiKey: "fake", fetchImpl: (async url => {
    urls.push(new URL(String(url)));
    return urls.length === 1 ? response({ tv_results: [{ id: 113962, name: "Lioness", poster_path: "/poster", backdrop_path: "/backdrop" }] }) :
      response({ id: 42, season_number: 1, episode_number: 3, name: "Episode Three", still_path: "/still", air_date: "2023-08-06" });
  }) as typeof fetch });
  const tv = await resolver.resolveEpisode("tt13111078:1:3");
  assert.equal(urls[0].searchParams.get("external_source"), "imdb_id");
  assert.equal(urls[1].pathname, "/3/tv/113962/season/1/episode/3");
  assert.deepEqual(tv, { seriesTmdbId: 113962, seasonNumber: 1, episodeNumber: 3, episodeTmdbId: 42, seriesTitle: "Lioness", episodeTitle: "Episode Three", posterPath: "/poster", backdropPath: "/backdrop", stillPath: "/still", airDate: new Date("2023-08-06T00:00:00Z") });
});

test("TV resolver rejects malformed identity before external calls", async () => {
  const resolver = createTmdbTvEpisodeResolver({ apiKey: "fake", fetchImpl: (async () => { throw new Error("must not call"); }) as typeof fetch });
  await assert.rejects(resolver.resolveEpisode("tt13111078"), (error: unknown) => error instanceof TmdbMovieResolverError && error.code === "tmdb_invalid_imdb_id");
});

test("TV resolver handles missing series, missing episodes, ambiguous identity, and retryable failures", async () => {
  assert.equal(await createTmdbTvEpisodeResolver({ apiKey: "fake", fetchImpl: (async () => response({ tv_results: [] })) as typeof fetch }).resolveEpisode("tt13111078:1:3"), null);
  let calls = 0;
  assert.equal(await createTmdbTvEpisodeResolver({ apiKey: "fake", fetchImpl: (async () => ++calls === 1 ? response({ tv_results: [{ id: 1, name: "Series" }] }) : response({}, 404)) as typeof fetch }).resolveEpisode("tt13111078:1:3"), null);
  for (const [status, code] of [[429, "tmdb_rate_limited"], [503, "tmdb_unavailable"]] as const) {
    await assert.rejects(createTmdbTvEpisodeResolver({ apiKey: "fake", fetchImpl: (async () => response({}, status)) as typeof fetch }).resolveEpisode("tt13111078:1:3"), (error: unknown) => error instanceof TmdbMovieResolverError && error.code === code);
  }
  await assert.rejects(createTmdbTvEpisodeResolver({ apiKey: "fake", fetchImpl: (async () => response({ tv_results: [{ id: 1, name: "A" }, { id: 2, name: "B" }] })) as typeof fetch }).resolveEpisode("tt13111078:1:3"), /tmdb_ambiguous_match/);
});
