# Stremio movie and TV synchronization

## Provider contract

`datastoreGet(collection: "libraryItem", all: true)` returns series library rows,
not individual episode watch events. The adapter retains `state.watched` and
`state.video_id` alongside the existing movie fields.

Read-only diagnostics of the actual connected account confirmed 89 library items
(56 movies, 33 series), with nonempty watched bitfields on 20 series. Movie and
series `lastWatched` values can have nine fractional digits (Rust nanoseconds).
Normalization accepts up to nine digits and truncates sub-millisecond precision
to match JavaScript/MongoDB Date storage. A newest completed movie would have lost
its watch date under the previous three-digit-only parser; a regression test now
covers the actual timestamp format.

Stremio's `watched` field is `anchorVideoId:anchorLength:base64(zlib(bits))`.
Bits are little endian within each byte. Their positions refer to the provider's
video list ordered by season, episode, then release date. The anchor aligns an
older bitfield with the current video list; it is the highest watched index,
not a chronological last-watch event. Decoder input and inflated output are bounded.

The approved public Cinemeta endpoint supplies that ordered list. Only IMDb
series IDs and exact `tt…:season:episode` video IDs are supported. Season zero
specials are supported. Generic series rows, resume pointers, series watch counts,
and malformed identities never create episode history by themselves. Invalid
or unknown bitfield anchors produce no episode states. Catalog/network failures
fail the sync with sanitized errors and can be retried.

Sources:

- [Stremio LibraryItem and LibraryItemState](https://github.com/Stremio/stremio-core/blob/development/src/types/library/library_item.rs)
- [WatchedField and anchor alignment](https://github.com/Stremio/stremio-core/blob/development/stremio-watched-bitfield/src/watched_bitfield.rs)
- [BitField8 compression and bit order](https://github.com/Stremio/stremio-core/blob/development/stremio-watched-bitfield/src/bitfield8.rs)
- [Public Lioness catalog](https://v3-cinemeta.strem.io/meta/series/tt13111078.json)
- [TMDB external-ID lookup](https://developer.themoviedb.org/reference/find-by-id)
- [TMDB episode details](https://developer.themoviedb.org/reference/tv-episode-details)

## Episode dates and incremental imports

Product policy: TV episodes use the sync start time as the watched time, with
`timestampConfidence: "observed_at"`. Dates display in the existing history UI
using its normal date formatting. `lastWatched` is a series-level value, changes
during playback, and may contain release-date information after a manual mark;
it is never assigned to a TV episode.

The first sync imports all supported completed episodes. Subsequent syncs import
only newly discovered completed episode identities. The first observed date is
stored atomically and remains fixed during retries, metadata resolution, concurrent
syncs, and subsequent snapshots. If an episode was watched and then marked unwatched
before the next sync, it cannot be discovered.

## Backend resolution and state machine

TV normalized states share the existing IntegrationMediaState ingestion and
credential-generation guards. They store `providerSeriesImdbId`, `seasonNumber`,
and `episodeNumber`. Server-side TMDB `/find` resolves the IMDb series, then the
exact episode details endpoint supplies canonical identity and display metadata.
The resulting `matchedTv` snapshot uses the same validated subdocument schema as
WatchHistoryEntry; no Movie fields are overloaded for TV.

Matching and importing extend the existing services. Their movie-named public
methods remain compatible with existing callers. TV shares reservation CAS,
provenance validation, interrupted-import recovery, reconnect cleanup, generation
checks, and finalization. Only the current owner's integration is selected;
duplicate searches and cleanup mutations are owner-scoped. No new secrets or
packages are needed; the existing server `TMDB_API_KEY` is reused.

## Exact duplicate policy

Movies: matching must first establish canonical TMDB identity. Equivalent local
Movie records have `imdbID: tmdb-<matched TMDB ID>` or the same exact provider IMDb
title ID. The owner's history must have either the identical watched timestamp
or midnight UTC on that timestamp's UTC calendar date. Midnight UTC is the
existing date-only input representation. No fuzzy tolerance applies to other
timestamps. Different dates and different non-midnight times are distinct watches.
This may conservatively merge an intentional midnight watch with another watch on
that date because existing history has no flag distinguishing date-only inputs.

TV: canonical identity is `(seriesTmdbId, seasonNumber, episodeNumber)`;
`episodeTmdbId` is also retained and checked for provenance recovery. With a reliable
episode occurrence timestamp, the same exact/date-only rule applies. With the actual
Stremio bitfield and observed sync date, historical occurrence equivalence cannot
be determined. The conservative first-discovery rule skips an episode already in
the owner's history on any date. It does not skip other episodes in that series.
History created by another owner never suppresses this owner's import.

The integration state records `importStatus: "suppressed"` and
`suppressionReason: "equivalent_local_history"`. Reservation/provenance links are
cleared. The existing history record receives no edits, provenance, notes, ratings,
location, or participant changes. Deleting that manual history leaves the provider
state suppressed, so a later sync does not unexpectedly recreate it.

## Rewatches and deletion

History still supports multiple movie/episode occurrences. No unique canonical-media
index is introduced. An older manual movie watch does not block a clearly different
Stremio movie timestamp; reliable distinct episode timestamps likewise allow rewatches.

The existing movie provider state imports one occurrence per provider item. Stremio
exposes only its latest timestamp and aggregate `timesWatched`, not an event log;
later timestamp changes do not manufacture additional rewatches. TV bits contain
neither per-episode timestamps nor counts, so automatic TV rewatches cannot be
reconstructed when an already-watched bit remains set. Clearing/re-setting a bit does
not bypass suppression or fabricate a new occurrence. Manual rewatches remain available.

Deleting a provenance-linked import retains the existing `suppressed /
local_history_deleted` behavior for movies and TV. There is no destructive migration;
existing movie and TV history remains valid and existing indexes are retained.

## Summaries and verification

Snapshot summaries include optional `tvSeriesExamined` and `tvEpisodeStates`.
Matching summaries include TV examined, matched, and missing counts. Import summaries
include TV examined/imported/skipped and `duplicatesDetected`. Existing totals include
both media types; subtract TV counts to obtain movie examined/matched/imported/skipped
counts. Missing timestamps, invalid matches, retryable failures, and stale work retain
their existing counters. Absent optional counts mean zero. The UI reports TV imports
and skipped duplicates when present.

Automated tests use isolated MongoDB, provider fixtures, and injected HTTP responses.
They cover manual duplicates, preserved metadata, different episodes, distinct known
occurrences, two-sync dates, concurrent import/recovery, interrupted reservations,
reconnect generation changes, stale writes, deletion suppression, and owner isolation.
The public Cinemeta Lioness response was read to verify ID/season/episode/release fields.
Initial automated validation did not use a real Stremio account. Subsequent read-only
diagnostics fetched the connected account's authenticated library snapshot and confirmed
the provider fields and nanosecond timestamp issue described above. The account was
then connected by its owner to a separate local test database. A real provider sync
created 27 movie records and 136 TV episode records; all 163 imported states matched
successfully. Movies, including The Whisper Man, were verified in the history UI.
Manual duplicate and delete-suppression acceptance scenarios remain covered by
automated tests and have not all been exercised against this real snapshot.

History pages cover up to twelve calendar months, including gaps after history began
but never months before the earliest recorded watch. Each month
previews four movie or grouped TV-session cards, with a plus/minus control to expand
or collapse additional cards. Numbered pages, Previous and Next load older twelve-month
ranges from the server, retaining the same owner/group authorization scope.

## Changed files

| Area | Files |
| --- | --- |
| Models | `server/models/IntegrationMediaState.ts`, `server/models/WatchHistoryEntry.ts` |
| Provider ingestion | `server/services/integrations/stremioClient.ts`, `stremioSnapshot.ts`, `stremioSyncService.ts`, `stremioEpisodeCatalog.ts`, `stremioWatchedBitfield.ts` (all services under `server/services/integrations/`) |
| Resolution/import | `server/services/integrations/tmdbTvEpisodeResolver.ts`, `stremioMovieMatchService.ts`, `stremioHistoryDuplicate.ts`, `stremioHistoryImportService.ts`, `stremioPipelineService.ts` (same service directory) |
| Server tests | `server/tests/stremioSnapshot.test.ts`, `stremioHistoryImportService.test.ts`, `stremioWatchedBitfield.test.ts`, `stremioEpisodeCatalog.test.ts`, `tmdbTvEpisodeResolver.test.ts`, `stremioTvSync.test.ts` (all under `server/tests/`) |
| Client | `client/src/api/integrationsApi.ts`, `client/src/component/StremioHomeControl.tsx`, `client/src/component/StremioHomeControl.test.tsx` |
| Documentation | `Docs/stremio-tv-sync.md` |

Implementation started on `main` at `a1ace58a6637437b5699fed4feeec6ac8eb04963`.
Unrelated concurrent email/authentication edits are excluded from this change.

Prior implementation validation (before the live-payload timestamp correction):

- Server suite: 180 passed, zero failed in an isolated copy of the starting main
  plus this change, excluding concurrent unrelated authentication/email changes.
- Client suite: 133 passed across 18 files, with one worker. An earlier parallel
  run encountered worker-start timeouts; the final one-worker run passed cleanly.
- Server TypeScript build: passed both in the isolated validation copy and in the
  shared checkout on the final run. An interim shared-checkout error came from a
  concurrently edited email service and subsequently cleared.
- Client typecheck and production build: passed.
- Scoped `git diff --check`: passed. No package manifest or indexes changed.
- The starting HEAD was `a1ace58a6637437b5699fed4feeec6ac8eb04963`.

Final publication checks: the full server suite passed 194 tests and the full
client suite passed 135 tests across 19 files. The subsequent earliest-month
adjustment passed the server month-pagination test and all 17 history-page tests,
including a partial first page and a two-month final page. Server and client
TypeScript checks/builds passed. The real-account local sync described above
used an isolated test database; production account history was not modified.
