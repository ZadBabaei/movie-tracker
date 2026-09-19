import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeStremioMovie,
  normalizeStremioMovieSnapshot,
} from "../services/integrations/stremioSnapshot";
import { StremioLibraryItemDto } from "../services/integrations/stremioClient";

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
