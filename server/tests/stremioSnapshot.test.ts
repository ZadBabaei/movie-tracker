import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeStremioMovie,
  normalizeStremioMovieSnapshot,
  normalizeStremioTvEpisodes,
} from "../services/integrations/stremioSnapshot";
import { StremioLibraryItemDto } from "../services/integrations/stremioClient";
import {
  isValidImdbTitleId,
  normalizeImdbTitleId,
} from "../services/integrations/imdbTitleId";

const movieItem = (overrides: Partial<StremioLibraryItemDto> = {}): StremioLibraryItemDto => ({
  id: "tt1234567",
  type: "movie",
  removed: false,
  revision: "opaque-mtime-value",
  state: {
    timesWatched: 1,
    lastWatched: "2026-01-01T12:00:00.000Z",
  },
  ...overrides,
});

test("TV bitfield identifies all watched episodes with the sync date, ignoring series watch date and resume pointer", () => {
  const observedAt = new Date("2026-08-30T12:00:00.000Z");
  const ids = Array.from({ length: 9 }, (_, index) => `tt2934286:1:${index + 1}`);
  const states = normalizeStremioTvEpisodes({
    id: "tt2934286", type: "series", removed: false, revision: "revision",
    state: { watched: "tt2934286:1:5:5:eJyTZwAAAEAAIA==", videoId: ids[5], lastWatched: "2020-01-01T00:00:00Z" },
  }, ids, observedAt);
  assert.equal(states.length, 5);
  assert.deepEqual(states.map(state => state.episodeNumber), [1, 2, 3, 4, 5]);
  for (const state of states) {
    assert.equal(state.providerMediaType, "tv_episode");
    assert.equal(state.timestampConfidence, "observed_at");
    assert.equal(state.providerLastWatchedAt?.toISOString(), observedAt.toISOString());
  }
  assert.deepEqual(normalizeStremioTvEpisodes({ id: "tt2934286", type: "series", removed: false, state: { timesWatched: 5, videoId: ids[0] } }, ids, observedAt), []);
  assert.deepEqual(normalizeStremioTvEpisodes({ id: "tt2934286", type: "other", removed: false, state: { watched: "bad" } }, ids, observedAt), []);
});

test("movie completion normalization preserves IMDb identity and provider timestamps", () => {
  const normalized = normalizeStremioMovie(movieItem());

  assert.equal(normalized?.providerItemId, "tt1234567");
  assert.equal(normalized?.identifierNamespace, "imdb");
  assert.equal(normalized?.completed, true);
  assert.equal(normalized?.removed, false);
  assert.equal(normalized?.providerRevision, "opaque-mtime-value");
  assert.equal(normalized?.providerLastWatchedAt?.toISOString(), "2026-01-01T12:00:00.000Z");
  assert.equal(normalized?.timestampConfidence, "provider_last_watched");
});

test("shared IMDb title contract accepts 7 through 12 digits and normalizes case", () => {
  const accepted = [
    "tt1234567",
    "tt1234567890",
    "tt12345678901",
    "tt123456789012",
    "TT123456789012",
  ];
  for (const value of accepted) {
    assert.equal(isValidImdbTitleId(value), true, value);
    assert.equal(normalizeImdbTitleId(value), value.toLowerCase(), value);
    const normalized = normalizeStremioMovie(movieItem({ id: value }));
    assert.equal(normalized?.identifierNamespace, "imdb", value);
    assert.equal(normalized?.providerItemId, value.toLowerCase(), value);
  }
});

test("shared IMDb title contract rejects malformed and out-of-range values", () => {
  for (const value of [
    "1234567",
    "../../tt1234567",
    "tt1234abc",
    "tt123456",
    "tt1234567890123",
  ]) {
    assert.equal(isValidImdbTitleId(value), false, value);
    assert.equal(normalizeImdbTitleId(value), null, value);
  }
});

test("removed completed movies remain completed and rewatch counts stay boolean-only", () => {
  const normalized = normalizeStremioMovie(
    movieItem({ removed: true, state: { timesWatched: 9, lastWatched: undefined } })
  );

  assert.equal(normalized?.completed, true);
  assert.equal(normalized?.removed, true);
  assert.equal("timesWatched" in normalized!, false);
  assert.equal("rewatchCount" in normalized!, false);
  assert.equal("watchOrdinal" in normalized!, false);
});

test("invalid or missing lastWatched is not invented from _mtime", () => {
  const invalid = normalizeStremioMovie(
    movieItem({
      revision: "2026-02-03T04:05:06.000Z",
      state: { timesWatched: 1, lastWatched: "not-a-date" },
    })
  );
  const missing = normalizeStremioMovie(
    movieItem({ state: { timesWatched: 0, lastWatched: undefined } })
  );

  assert.equal(invalid?.providerLastWatchedAt, undefined);
  assert.equal(invalid?.timestampConfidence, "unknown");
  assert.equal(invalid?.providerRevision, "2026-02-03T04:05:06.000Z");
  assert.equal(missing?.providerLastWatchedAt, undefined);
  assert.equal(missing?.completed, false);
});

test("real Stremio nanosecond timestamps normalize to milliseconds without losing the watch occurrence", () => {
  for (const [input, expected] of [
    ["2026-10-05T00:01:24.576919942Z", "2026-10-05T00:01:24.576Z"],
    ["2026-10-05T00:01:24.576919942+02:30", "2026-10-04T21:31:24.576Z"],
    ["2026-10-05T00:01:24.5Z", "2026-10-05T00:01:24.500Z"],
  ] as const) {
    const normalized = normalizeStremioMovie(movieItem({ state: { timesWatched: 1, lastWatched: input } }));
    assert.equal(normalized?.providerLastWatchedAt?.toISOString(), expected);
    assert.equal(normalized?.timestampConfidence, "provider_last_watched");
    assert.equal(normalized?.completed, true);
  }
  const invalid = normalizeStremioMovie(movieItem({ state: { timesWatched: 1, lastWatched: "2026-10-05T00:01:24.5769199420Z" } }));
  assert.equal(invalid?.providerLastWatchedAt, undefined);
});

test("custom identifiers remain provider-scoped and unsupported media rows are ignored", () => {
  const custom = normalizeStremioMovie(movieItem({ id: "addon:custom-movie" }));
  const normalized = normalizeStremioMovieSnapshot([
    movieItem(),
    movieItem({ id: "series-id", type: "series" }),
    movieItem({ id: "episode-id", type: "episode" }),
    movieItem({ id: undefined }),
  ]);

  assert.equal(custom?.identifierNamespace, "provider");
  assert.equal(custom?.providerItemId, "addon:custom-movie");
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].providerMediaType, "movie");
});
