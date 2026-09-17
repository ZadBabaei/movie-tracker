# TV Series Tracking — Phase 0 Audit

Branch: `feature/tv-series-tracking` (from `main` @ `2666bdbb`).
Status: audit complete, no product behavior changed.

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
