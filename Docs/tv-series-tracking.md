# TV Series Tracking — Phase 0 Audit

Branch: `feature/tv-series-tracking` (from `main` @ `2666bdbb`).
Status: Phase 0 audit + Phase 1 data foundation complete.

## What exists today

### Canonical watch history (the system TV plugs into)
- `server/models/WatchHistoryEntry.ts` — canonical record. `movieId` is
  **required** and refs `Movie`. Fields: `scope` (personal|group), `groupId`,
  `createdBy`, `participants`, `watchedAt`, `watchedLocation`, `watchedNotes`,
  `ratings[]` (1–10 per user), `legacyGroupId` + `legacyHistoryItemId`.
- Indexes: `movieId`, `scope`, `groupId`, `createdBy`, `watchedAt`,
  `{participants, watchedAt, _id}`, `{groupId, watchedAt, _id}`, partial-unique
  `{legacyGroupId, legacyHistoryItemId}`.
- `server/routes/historyRoutes.ts` — `GET /api/history/personal`,
  `GET /api/history/group/:groupId`, `POST /api/history`,
  `PATCH /:id`, `DELETE /:id`, `PUT /:id/rating`. Cursor pagination on
  `(watchedAt, _id)`, `limit ≤ 100`. `search` param resolves through
  `Movie.title` → `movieId $in`.
- `server/utils/watchHistory.ts` — `serializeHistoryEntry` (emits a `movie`
  object; no media discriminator), `getRatingSummary`,
  `syncLegacyGroupHistory` (upserts `Group.movies[]` subdocs into
  `WatchHistoryEntry`; runs on every personal/group history read).
- **Group dual-write:** `POST /api/history` with `scope: "group"` also pushes a
  legacy subdoc into `Group.movies[]` (`movieId` required there too) and links
  it via `legacyHistoryItemId`. PATCH/DELETE/rating mirror into the subdoc.
  `groupRoutes.ts` still has its own `/history/:historyItemId/rating` on the
  legacy subdoc and mirrors back into `WatchHistoryEntry`.

### Movie identity
- `server/models/movie.ts` — `{title, imdbID (unique), poster, vote_average}`.
  `imdbID` actually holds `tmdb-<tmdbId>` for search-added movies (see
  `SearchBar.jsx`). No `mediaType` field.
- Watchlist/history/polls/comments all key on `Movie._id`.

### Client history surfaces
- `client/src/pages/WatchHistory.tsx` (`/history`) — the personal + group
  history page backed by `/api/history`. Groups by month, has its own inline
  detail modal (edit date/location/notes, rate, delete). This is the "main
  watch timeline" for this feature.
- `client/src/component/WatchTimeline.tsx` — used only by `GroupPage.tsx`,
  renders **legacy `Group.movies[]`** (fetched via `/api/groups/...`), not
  `WatchHistoryEntry`. framer-motion scroll animation, month grouping.
- `client/src/store/useWatchHistoryStore.ts` — `HistoryEntry` type has a
  required `movie` object; buckets `personal` + `byGroup`.
- `client/src/api/historyApi.ts`, `watchlistApi.ts` (`markAsWatched` → POST
  `/api/history` with `source` to also pull from the watchlist).

### TMDB usage
- All TMDB calls are **client-side** with `VITE_TMDB_API_KEY` (raw `fetch` /
  `axios`, no shared service). Endpoints in use: `search/movie`, `movie/{id}`
  (+credits), `movie/{id}/videos`, `movie/{id}/external_ids`,
  `trending/movie/week`. Server touches TMDB only in `comingSoonRoutes.ts`.
- `MovieDetailModal.jsx` derives the TMDB id from `imdbID` (`tmdb-` prefix) and
  branches on `variant` (`watchlist` / `poll` / history).
- No TV endpoints are used anywhere yet.

### Realtime
- Socket rooms per group. History events: `group:history_updated`,
  `group:history_deleted`, `group:history_rating_updated` (payload:
  `historyEntryId`, rating event also spreads the serialized entry).
  `WatchHistory.tsx` refetches the group bucket on each.

### Routing
- `client/src/App.tsx` — flat `<Route>` list under `ProtectedRoute`. No series
  route exists; `/history` is the only history route.

### Tests / baseline (all green on `main` @ 2666bdbb)
- `client`: `tsc --noEmit` ✓, `vitest run` 7/7 ✓, `vite build` ✓.
- `server`: `tsc --noEmit` ✓ (no unit test runner configured).
- e2e: `npx playwright test` 23/23 ✓ (needs `E2E_MONGODB_URI` pointing at a
  DB whose name contains `e2e`/`test`; local Mongo on 27017 works).

## Movie-specific assumptions TV will touch
1. `WatchHistoryEntry.movieId` required; `POST /api/history` requires a
   `Movie` doc; serializer always emits `movie`.
2. `Group.movies[]` legacy subdoc requires `movieId` → TV group watches cannot
   be mirrored there without corrupting semantics.
3. `readEntries` search filters via `Movie.title` only; `sort=title` reads
   `movie.title`.
4. `HistoryEntry` client type and `WatchHistory.tsx` render `entry.movie.*`
   unconditionally.
5. `SearchBar.jsx` hits `search/movie` and formats results as movies.
6. `MovieDetailModal.jsx` hits `movie/{id}` endpoints.
7. `WatchTimeline.tsx` (GroupPage) reads legacy group movies only.

## Decisions / proposed direction (for review before Phase 1)
- **Storage:** keep `WatchHistoryEntry` as the single collection. Add
  `mediaType: "movie" | "tv_episode"` (default `"movie"` so all existing docs
  read as movies with no migration), make `movieId` required only when
  `mediaType === "movie"`, and add a `tv` sub-document for episodes:
  `{ seriesTmdbId, seriesTitle, seriesPoster, seriesBackdrop, seasonNumber,
  episodeNumber, episodeTmdbId?, episodeTitle?, episodeStill?, airDate? }`.
  Denormalizing series title/poster keeps the history read path free of TMDB
  calls (same reason `Movie` caches title/poster today). No new `Series`
  collection is needed for this branch; can be added later if Stremio sync
  wants it.
- **Indexes:** add `{ "tv.seriesTmdbId": 1, participants: 1, watchedAt: -1 }`
  for the series page and `{ mediaType: 1 }`; leave existing indexes intact.
- **Groups:** TV episode entries with `scope: "group"` are stored only in
  `WatchHistoryEntry` (no legacy `Group.movies[]` mirror). Legacy sync remains
  movie-only. This is the one place the "dual-write" invariant is intentionally
  not extended; needs sign-off.
- **TMDB layer:** stays client-side to match current practice (`VITE_TMDB_API_KEY`
  is already exposed in the bundle; moving it server-side is a separate
  hardening task, not this branch). Introduce `client/src/api/tmdb.ts` with
  typed wrappers for movie + TV; new code uses it, existing movie call sites
  are left alone unless touched anyway.
- **Timeline grouping:** done in a pure client util
  (`groupHistoryForTimeline`) keyed by `seriesTmdbId + local calendar day of
  watchedAt`. `WatchHistory.tsx` currently formats dates with `timeZone: "UTC"`
  and the edit form submits a date-only string — Phase 4 must pick one
  calendar (proposal: the date-only string the user entered, i.e. UTC midnight,
  which is what the current save path already stores) and document it.
- **Series page route:** `/series/:tmdbId` (stable provider id).
- **GroupPage `WatchTimeline`:** out of scope for TV (legacy source); the
  `/history` page is the unified timeline. Flagging so nobody expects TV cards
  on the group page.

## Open conflicts with the plan
- Global project rule says "work directly on `main`, never branch"; the plan
  explicitly mandates `feature/tv-series-tracking` and no merge without review.
  Following the plan (explicit instruction wins) — confirm this is intended.
- `main` has uncommitted, unrelated dependency bumps in `server/package.json`
  / `package-lock.json` (multer, nodemailer, `qs` override). They are carried
  in the working tree but will not be included in phase commits.

---

# Phase 1 — Data foundation (done)

## `WatchHistoryEntry` changes (`server/models/WatchHistoryEntry.ts`)
- `mediaType: "movie" | "tv_episode"`, default `"movie"`. Documents written
  before this phase have no `mediaType`; every reader goes through
  `resolveMediaType()` which maps missing → `"movie"`. No migration.
- `movieId` is now required only when `mediaType` resolves to `"movie"`.
- New `tv` subdocument (no `_id`), required only for `tv_episode`:
  identity `seriesTmdbId` (int ≥ 1), `seasonNumber` (int ≥ 0; TMDB uses 0 for
  specials), `episodeNumber` (int ≥ 1), optional `episodeTmdbId`; display
  snapshot `seriesTitle` (required), `episodeTitle`, `posterPath`,
  `backdropPath`, `stillPath`, `airDate`.
- `pre("validate")` rejects `movie` + `tv`, and `tv_episode` + `movieId`.
- New index `{ participants: 1, "tv.seriesTmdbId": 1, watchedAt: -1, _id: -1 }`
  with `partialFilterExpression: { mediaType: "tv_episode" }` — serves the
  Phase 6/7 series page query ("this user's watches of series X, newest
  first"). Not unique. Queries must include `mediaType: "tv_episode"` to hit
  it. All pre-existing indexes untouched.

## Server behavior
- `POST /api/history` accepts `mediaType` (+ `tv` object). Movie path is
  unchanged. Episode path: no `Movie` lookup, no `Group.movies[]` legacy push,
  no `legacyGroupId/legacyHistoryItemId`, and `source` (watchlist pull) is
  ignored. `tv` identity is immutable after creation (PATCH only edits
  watch metadata, as for movies).
- `serializeHistoryEntry` now emits `mediaType` on every entry; movies keep
  their exact previous shape plus `tv: null`; episodes emit `tv: {...}` and
  `movie: null`.
- `search=` matches `Movie.title` **or** `tv.seriesTitle`; `sort=title` uses
  movie title / series title. `year`, `rated`, cursor pagination are
  media-agnostic already.
- `syncLegacyGroupHistory` explicitly writes `mediaType: "movie"`; all other
  `groupRoutes` history code paths key on legacy ids / `movieId` and are
  therefore movie-only by construction.

## Tests
- `server/tests/` — Node's built-in `node:test` runner via `ts-node/register`
  (no new dependencies). `npm test` in `server/`. Uses a real Mongo at
  `TEST_MONGODB_URI` → `E2E_MONGODB_URI` → `mongodb://127.0.0.1:27017/movie-tracker-test`
  and refuses any database whose name lacks `test`/`e2e`.

## Known gaps carried forward
- `client/src/pages/WatchHistory.tsx` and `useWatchHistoryStore.HistoryEntry`
  still assume `entry.movie` is present. No UI can create episodes until
  Phase 3, and the client is generalized in Phase 4; until then an episode
  created via the raw API would render badly on `/history`.
- GroupPage's `WatchTimeline` reads legacy `Group.movies[]` and will not show
  episodes (Phase 9 decision).
- `Group` "remove movie" (`groupRoutes` ~L796) deletes history by `movieId`;
  there is no equivalent for series yet (not needed until series can be
  removed from a group, which has no UI).

---

# Phase 2 — TMDB TV metadata layer (done)

- `client/src/api/tmdb.ts` — typed TV client on native `fetch`, same
  `VITE_TMDB_API_KEY` / `api_key` query-param auth the movie screens already
  use (the key has always been public in the bundle; unchanged here). No
  movie call sites were touched.
- Operations: `searchTv`, `getTvSeries` (append `credits,external_ids,images`),
  `getTvSeason` (episodes incl. crew + guest stars), `getTvEpisode` (append
  `credits,external_ids`), `getTvSeriesExternalIds`; helpers `tmdbImageUrl`,
  `tvSeasonLabel`. Normalizers are exported for tests.
- Types: `TvSearchResult`/`TvSearchPage`, `TvSeriesDetails`,
  `TvSeasonSummary`/`TvSeasonDetails`, `TvEpisodeSummary`/`TvEpisodeDetails`,
  `TvCastMember`, `TvCrewMember`, `TvExternalIds`, `TvGenre`, `TvNetwork`,
  `TvImage`. Field names match the history `tv` snapshot.
- Missing data → `null` (never fabricated); malformed rows in lists are
  dropped; payloads without identity throw `TmdbError("malformed")`. Season 0
  carries `isSpecials: true` and is labelled "Specials".
- Errors: `TmdbError` with `kind` ∈ config | not_found | unauthorized |
  rate_limited | http | network | aborted | malformed, plus HTTP `status`.
- Only cache: in-flight de-duplication of identical GETs without an
  AbortSignal. Nothing persisted.
- Tests: `client/src/api/tmdb.test.ts` (vitest, stubbed `fetch`, fixture
  payloads; no live TMDB).

---

# Phase 3 — TV discovery + mark-episodes-watched (done)

- Entry point: **Add TV Watch** button in the `/history` toolbar
  (`client/src/pages/WatchHistory.tsx`).
- `client/src/component/AddTvWatchModal.tsx` — search (`searchTv`, 300 ms
  debounce, ≥2 chars, AbortController) → series (`getTvSeries`) → season tabs
  (Season 0 shown as "Specials", never merged) → episode checkboxes
  (`getTvSeason` lazy per tab, cached in component state). Default season =
  latest non-special season whose `airDate <= today` (UTC calendar day, same
  convention as `GroupSelectModal`), else first non-special, else whatever
  exists. Episodes with a known future `airDate` are disabled and labelled
  "Upcoming"; a missing `airDate` is *not* treated as unaired.
- Watch details reuse `GroupSelectModal` unchanged in behaviour (sequential
  modal, as `Watchlist` does for movies) via a new media-neutral `watchTitle`
  prop; `movieTitle` remains as an alias.
- `client/src/hooks/useAddTvWatch.ts` — holds the selection, submits one
  `POST /api/history` per episode via `createTvEpisodeHistoryEntries`
  (`Promise.allSettled`), guards against double submission with a ref, keeps
  the per-episode failure list and can `retryFailed()` with the same details
  without resending successes. Successful saves refresh the personal bucket
  (+ the group bucket for group scope).
- `client/src/api/historyApi.ts` — `buildTvEpisodeHistoryPayload` (omits
  empty optionals, never sets `movieId`), `createTvEpisodeHistoryEntry`,
  `createTvEpisodeHistoryEntries`.
- History compatibility bridge: `HistoryEntry` now has `mediaType`,
  `movie | null`, `tv | null`; `client/src/utils/historyEntry.ts` provides
  `isTvEntry`, `getEntryTitle`, `getEntrySubtitle` ("S01E03 · Title"),
  `getEntryPosterPath`, `getEntryBackdropPath`, `getEntrySearchText`. The
  page renders episodes as plain rows (series title + code + episode title);
  movie rows are unchanged. Grouping / purple cards are Phase 4–5.
- Known gaps: hero stat still says "films watched"; the temporary episode
  row/detail is minimal until Phase 8; timezone of "today" and of
  `watchedAt` is UTC-day based (Phase 4 decision).


---

# Phase 4 — Unified timeline model + TV daily sessions (done)

- `client/src/utils/historyTimeline.ts` — pure model over raw entries:
  `TimelineItem = MovieTimelineItem | TvSessionTimelineItem`. Movies never
  group (a same-day rewatch is two items). Episodes group by
  `seriesTmdbId + calendar day` only; `entries` keeps every underlying
  record in raw order, never deduplicated. `sortAt` = max `watchedAt`; ties
  keep first-appearance order. Helpers for search (session matches if any
  episode's series title / episode title / `SxxExx` matches), This-year
  (calendar day), Rated (any entry rated), title sort (series title) and a
  sort-only rating value (mean of rated entries, never displayed).
- **Calendar-day rule (locked):** `historyCalendarDay(watchedAt)` = the UTC
  date of `watchedAt` (`toISOString().slice(0, 10)`). Date-only inputs are
  stored as UTC midnight and the UI formats in UTC, so this preserves exactly
  the date the user entered. `23:59:59Z` → that day, `00:00:00Z` → next day.
  No user-timezone setting; external imports must normalise before becoming
  history.
- Session summary `describeTvSessionEpisodes`: `S01 · E01–E04`,
  `S01 · E01, E03, E05`, `S01 · E08 · S02 · E01–E02`, `S01 · E01 ×2, E02`
  (a range is never used once any episode repeats), `Specials · E01–E02`.
- `client/src/utils/historyPagination.ts` — `completeTrailingDay`: after the
  100-row page, if the trailing calendar day contains a TV episode and there
  is a next page, fetch 25-row continuations and append records while they
  belong to that same day; the first earlier-day record is left on the server
  side and `nextCursor` becomes the last included id. Capped at 8 pages.
  Whole-day (not "consecutive same-session") because same-day watches share
  one UTC-midnight timestamp and are ordered by `_id`, so an interleaved
  movie would otherwise still split a session. Wired into both store fetches;
  store remains raw `HistoryEntry[]`.
- Page: timeline derived via `useMemo`; movie cards unchanged; TV session card
  shows series poster/title/summary/day/"N episode watches". Clicking a
  session opens a list of its exact occurrences (code, title, date, location,
  rating) inside the existing details modal; each occurrence opens the normal
  entry detail (edit/rate/delete by `_id`) with a back link. Session identity
  is the recomputed key, so edits/deletes/socket refreshes regroup live.
- Hero copy: "N watch events" (raw count), media-neutral empty-state copy.


---

# Integration — unified "Add to History" (main `7d1ac096` merged)

Product model (locked): one toolbar button, **+ Add to History**, opens one
search for movies *and* TV series. Movie → watch details → save. TV → episode
picker → same watch details → one record per episode. Main history groups TV
by series + UTC day into a session card (Phase 5 gives it the fixed
three-layer stacked look, which is a TV identity cue, never an episode
count); the session will navigate to `/history/tv/:seriesTmdbId` from Phase 6.

- `client/src/api/tmdb.ts` — `searchMedia()` → TMDB `/search/multi`,
  normalized to `MediaSearchResult { kind: "movie" | "tv", tmdbId, title,
  year, posterPath, overview, originCountry, … }`; people/other kinds dropped.
  `searchTv()` and the movie-only `SearchBar.jsx` are untouched.
- `client/src/component/HistoryMediaSearch.tsx` — history-only search box
  (debounce, abort, ≥2 chars, loading/empty/error/retry) with a MOVIE / TV
  badge, poster, year and origin country per row.
- `client/src/component/TvEpisodePicker.tsx` — the former `AddTvWatchModal`
  minus its search step; receives `{ seriesTmdbId, title }`, loads
  `getTvSeries` / lazy `getTvSeason`, keeps Specials separate, disables
  future-dated episodes, multi-select across tabs, "Back to search".
- `client/src/hooks/useAddToHistory.ts` — one controller:
  `closed → search → (tv_episodes) → watch_details`. Movie results save via
  `createHistoryEntry({ movie: { imdbID: "tmdb-<id>", … } })` from main (no
  `source`, Watchlist untouched); TV results save through `useAddTvWatch`
  (one `POST /api/history` per episode, `allSettled`, retry-failed only).
- `GroupSelectModal` carries both `watchTitle` (TV branch) and `submitting`
  (main); `movieTitle` alias kept for Watchlist.
- Server `POST /api/history`: strict `mediaType` (missing → movie);
  `movie` → `movieId` **or** direct `movie{ imdbID, title, … }` with the
  race-safe find-or-create by `imdbID`; `tv_episode` → `tv` identity, and any
  `movieId` / `movie` is rejected.
- Removed: the "Add TV Watch" button, its state, CSS and tests.
- `server/package.json` `test` runs every `tests/**/*.test.ts`
  (`watchHistory.test.ts` + main's `historyRoutes.test.ts`).

---

# Phase 5 — Permanent stacked TV history card (done)

Presentation only. Grouping (`seriesTmdbId` + UTC calendar day → one card),
pagination, the raw store and entry identities are untouched; movies keep
their single-layer card verbatim.

- `client/src/component/TvSessionCard.tsx` renders one TV session as a
  **fixed three-layer stack**: a non-semantic `.history-tv-stack` wrapper
  whose `::before` / `::after` are the two rear layers, and one real
  `<button class="history-card history-card--tv">` in front. The count of
  layers is CSS, so it cannot vary with `watchCount`; nothing is cloned.
  Rear layers are `pointer-events: none`, sit under the front card and are
  invisible to the accessibility tree.
- Identity: purple accent line down the left edge (`box-shadow: inset`),
  purple border/focus ring, and a real-text `TV` badge on the artwork —
  the same purple used by the search-result badge.
- Artwork: `sessionArtwork()` uses the session backdrop (16:10, cinematic)
  and falls back once to the poster, then to `/default-avatar.png`, using
  only what the timeline item already carries — no extra TMDB request.
- Front card content: TV badge · series title · `episodeSummary` (unchanged
  from Phase 4, e.g. `S01 · E02–E04`) · date · `N episode watch(es)` ·
  `Episodes` affordance. Rating is shown only when the session holds
  exactly one watch record (that record's own rating); multi-record
  sessions show none rather than a blended number.
- Click still opens the temporary session-detail bridge from Phase 4
  (exact `_id` per row → edit / delete / rate). Phase 6 replaces this with
  `/history/tv/:seriesTmdbId`.
- Accessible name: `TV: <series>, <summary>, <n> episode watches on <date>`.
- Reduced motion: no new animation; the existing hover lift and poster zoom
  are already disabled under `prefers-reduced-motion`.
- Tests: `TvSessionCard.test.tsx` (badge, summary, fixed structure across
  1/3/10 watches, single-record rating only, artwork fallback chain, click
  + long title) and page-level assertions that movie cards get no stack.

---

# Local development: which backend the client talks to

`client/.env` (gitignored) usually carries the **production**
`VITE_API_BASE_URL`. A plain `npx vite` therefore sends every `/api` call to
Railway — from a port that is not in the CORS allow-list the browser blocks it
and axios reports a literal "Network Error"; from an allowed port it reaches a
backend without the TV branch. Neither is a TV bug.

Use the local-API mode, which ignores `VITE_API_BASE_URL` / `VITE_SOCKET_URL`
and proxies `/api` + `/socket.io` to a local backend:

```bash
# backend (worktree, isolated test DB, port 5002)
cd server && NODE_ENV=test PORT=5002 E2E_MONGODB_URI=mongodb://127.0.0.1:27017/movie-tracker-e2e JWT_SECRET=local-dev CORS_ORIGINS=http://127.0.0.1:3002 npx ts-node index.ts
```

```bash
# client (worktree) — proxied to the backend above
cd client && VITE_DEV_API_PROXY=http://127.0.0.1:5002 npm run dev:local -- --port 3002
```

`npm run dev:local` = `vite --mode localapi`. Vite prints
`[movie-tracker] API calls are proxied to …` on start, and the browser console
prints `[movie-tracker] API base: …` so a wrong target is visible immediately.
Open **http://127.0.0.1:3002** (not `localhost` — the session token is
per-origin). The main checkout's `server` config on port 5000 needs no
`VITE_DEV_API_PROXY` (default `http://127.0.0.1:5000`).
