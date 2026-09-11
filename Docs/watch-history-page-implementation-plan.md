# Watch History Page — Implementation Plan

## Implementation status

Implemented on 2026-09-01:

- First-class history model, indexes, serializers, compatibility sync, and dry-run/real migration commands.
- Authenticated personal/group list endpoints plus create, edit, delete, and rating endpoints.
- Personal and group Watchlist write flows with legacy group dual-write support.
- `/history` page, Personal/group tabs, deep links, filters, sorting, timeline, details editing, ratings, deletion, responsive states, navigation, and analytics mapping.
- Playwright coverage for both personal and group mark-watched flows; both scenarios pass against an isolated local E2E database.
- Server and client production builds pass.

Staging migration completed on 2026-09-01 against the dedicated `movie-tracker-staging` database: 4 groups contained 32 legacy entries, all 32 were migrated, and 0 were invalid. A second run created 0 entries, confirming idempotency. A separate Railway `staging` environment and Vercel preview were then deployed and health-checked. Production deployment verification and the production migration remain outstanding. Legacy `Group.movies` remains in place intentionally until that rollout is verified.

## Goal

Build a production Watch History page at `/history` that follows the approved static mockup and the existing Watchlist navigation model:

- `Personal` is the default tab.
- Each group the user belongs to appears as a tab.
- A group watch appears once in the database but is visible in both the relevant group tab and the Personal history of participating users.
- Personal-only watches do not require selecting a group.
- Existing group history, notes, participants, dates, locations, and ratings are preserved.

Approved UI reference: `designRefrences/watch-history-mockup.html`

## Recommended architecture

Create a first-class `WatchHistoryEntry` collection as the source of truth instead of adding separate copies to `User.watchHistory` and `Group.movies`.

Suggested fields:

```ts
interface IWatchHistoryEntry {
  movieId: Types.ObjectId;
  scope: "personal" | "group";
  groupId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  participants: Types.ObjectId[];
  watchedAt: Date;
  watchedLocation: string;
  watchedNotes: string;
  ratings: Array<{
    userId: Types.ObjectId;
    rating: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  legacyGroupId?: Types.ObjectId;
  legacyHistoryItemId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes:

- `{ participants: 1, watchedAt: -1 }` for Personal history.
- `{ groupId: 1, watchedAt: -1 }` for group tabs.
- A unique sparse index on `{ legacyGroupId: 1, legacyHistoryItemId: 1 }` so migration is idempotent.
- `{ movieId: 1 }` for movie-related lookups.

This design prevents a group screening from being duplicated into several user documents. It also allows a participant's Personal history to survive group changes, subject to the access policy below.

## Product rules to lock before coding

The implementation should use these defaults unless explicitly changed:

1. Personal history contains personal-only watches plus group watches where the user is listed as a participant.
2. Group history contains every entry belonging to that group, whether or not the current user attended.
3. Marking a movie watched from the Personal Watchlist defaults to a personal entry; adding it to a group is optional.
4. Marking a movie watched from a group Watchlist creates a group entry and includes the acting user as a participant.
5. Rewatching is allowed. The same movie may have multiple history entries with different dates and context.
6. A personal entry can be edited or deleted only by its owner.
7. Group-entry edit/delete permissions initially match the current group-history rules.
8. Ratings remain one rating per user per history entry, from 1–10.
9. A former group member can still see a limited version of an event they participated in through Personal history, but cannot open the group's full history.

## Phase 1 — Data foundation and compatibility

### Work

- Add `server/models/WatchHistoryEntry.ts` with validation and indexes.
- Add reusable serializers for populated movie, participant, and rating data.
- Add authorization helpers for personal owners, group members, group admins, and event participants.
- Add an idempotent migration script that converts every `Group.movies` subdocument into a `WatchHistoryEntry`.
- Preserve `legacyGroupId` and `legacyHistoryItemId` so old references can be traced.
- Keep `Group.movies` untouched during the compatibility window.
- Add migration dry-run output: groups scanned, entries found, entries created, duplicates skipped, invalid entries reported.

### Exit criteria

- Migration can be run repeatedly without creating duplicates.
- Existing group-history counts match migrated entry counts.
- Dates, locations, notes, participants, ratings, and movie references survive migration.
- Server build and model-level tests pass.

## Phase 2 — Watch History API

### Endpoints

```text
GET    /api/history/personal
GET    /api/history/group/:groupId
POST   /api/history
PATCH  /api/history/:historyEntryId
DELETE /api/history/:historyEntryId
PUT    /api/history/:historyEntryId/rating
```

List endpoints should support:

```text
?cursor=<opaque cursor>
&limit=24
&search=<title>
&year=2026
&rated=true
&sort=recent|rating|title
```

### Work

- Return a normalized response shape for both Personal and group tabs.
- Use cursor pagination based on `watchedAt` plus `_id`; do not load unlimited history.
- Populate only the fields required by the page.
- Return rating summaries and the current user's rating.
- Enforce group membership independently on every group endpoint.
- Allow Personal history to return participant-visible entries without granting access to the group itself.
- Add request validation, consistent error messages, and analytics mappings.
- During migration, optionally fall back to legacy `Group.movies` only when a group has not been migrated.

### Exit criteria

- Authorization tests cover owner, member, non-member, former participant, and invalid-ID cases.
- Pagination remains stable when two entries have the same watched date.
- Search, year, rated, and sorting behavior are covered by API tests.

## Phase 3 — Update movie-to-history write flows

### Personal Watchlist

- Replace the mandatory group picker with a watch-details form.
- Default destination to `Personal`.
- Offer an optional group selector: `Personal only` or one of the user's groups.
- Collect watched date, location, participants, and notes.
- On success, remove the movie from the correct Watchlist and create one history entry.

### Group Watchlist and Group page

- Route existing “mark watched” and “add watched movie” actions through the new history service.
- Preserve Socket.io updates using a new `history:updated` event containing the affected group ID and entry ID.
- Keep old endpoints as temporary adapters if needed so the rollout can be split safely.

### Exit criteria

- Personal watch can be recorded without a group.
- Group watch appears in its group tab and in each participant's Personal tab.
- Rewatching creates a new event rather than silently discarding it.
- Watchlist removal and history creation cannot leave the UI in a false success state.

## Phase 4 — Frontend route, data layer, and navigation

### Files/components

- Add `client/src/pages/WatchHistory.tsx` and `WatchHistory.css`.
- Add `client/src/api/historyApi.ts`.
- Add `client/src/store/useWatchHistoryStore.ts`.
- Add `/history` to `client/src/App.tsx`.
- Add Watch History to desktop and mobile sections of `VerticalNavbar.tsx`.
- Extract reusable history display pieces from `WatchTimeline.tsx` rather than duplicating its rating/detail behavior.

Suggested component boundaries:

```text
WatchHistory
├── HistoryHero
├── HistoryScopeTabs
├── HistoryToolbar
├── HistoryTimeline
│   ├── HistoryPeriod
│   └── HistoryRow
├── HistoryDetails
├── HistorySkeleton
├── HistoryEmptyState
└── HistoryErrorState
```

### State behavior

- Persist the active scope tab separately from the Watchlist active tab.
- Support `?group=<slug>` deep links.
- Reset or scope filters predictably when switching tabs.
- Cache loaded group histories by group ID.
- Cancel or ignore stale responses when users switch tabs quickly.
- Refetch the active tab when a relevant Socket.io history event arrives.

### Exit criteria

- Route and navigation work on desktop and mobile.
- Personal is the safe fallback when a persisted group is no longer available.
- Rapid tab switching never shows one group's records under another group's name.

## Phase 5 — Approved UI implementation and interaction parity

Use the static mockup as the visual contract for composition, hierarchy, density, tab treatment, timeline layout, and mobile behavior. Reuse the production brand variables from `client/src/index.css` rather than copying mockup-only values.

### Work

- Implement the hero with stats calculated from the active result set.
- Implement horizontal Personal/group tabs matching Watchlist behavior.
- Implement search, All Time, This Year, Rated, and sorting controls.
- Group history rows by month and year.
- Show poster, title, release year/genres, location, participants, and rating.
- Open the existing production modal vocabulary for details/editing.
- Reuse existing rating behavior and confirmation patterns.
- Add skeleton, empty, filtered-empty, error, and retry states.
- Ensure long group names, long movie titles, missing posters, missing metadata, and many tabs remain usable.
- Preserve keyboard tab semantics, visible focus, 44px touch targets, dialog focus management, screen-reader labels, and reduced-motion behavior.

### Responsive targets

- Desktop: 1280–1600px.
- Tablet: 768–1024px.
- Mobile: 320–430px, including bottom navigation and safe-area padding.
- Large text/zoom: 200% without clipped controls or inaccessible content.

### Exit criteria

- Visual comparison against the approved desktop and mobile mockups is complete.
- No horizontal page overflow at target sizes.
- All interactive states are keyboard accessible.

## Phase 6 — Integration, tests, and migration rollout

### Automated validation

- Server TypeScript build.
- Client typecheck and production build.
- API tests for CRUD, filtering, pagination, ratings, and authorization.
- Playwright scenarios:
  - Personal watch created from Personal Watchlist.
  - Group watch created from group Watchlist.
  - Group watch appears in Personal and group tabs.
  - Personal-only watch does not appear in group tabs.
  - Search/filter/sort behavior.
  - Edit, rate, and delete permissions.
  - Direct `?group=<slug>` navigation.
  - Empty and error states.
  - Mobile navigation and tab overflow.

### Rollout sequence

1. Deploy the new collection, indexes, and read endpoints without changing UI behavior.
2. Run the migration in dry-run mode against staging.
3. Run the real staging migration and compare counts/sample records.
4. Enable dual-read compatibility and new writes in staging.
5. Run end-to-end tests and manually inspect representative users/groups.
6. Deploy production code with the history page behind a feature flag if desired.
7. Run the production migration and monitor errors, query latency, and entry counts.
8. Enable `/history` navigation for all users.
9. After a stable observation period, remove legacy `Group.movies` writes and then remove the legacy field in a separate cleanup release.

## Phase 7 — Documentation and cleanup

- Update `README.md` and `ARCHITECTURE.md` with the new source of truth.
- Update analytics route/feature mappings for `/history`.
- Document the migration command and rollback procedure.
- Update relevant feature notes with files changed, decisions, tests, and remaining work.
- Remove temporary compatibility code only after production verification.

## Dependency decision

No new third-party package is recommended for this feature.

- React Router already handles the route and query parameters.
- Zustand already handles client state and caching.
- Mongoose already supports the required schema and indexes.
- Existing modal, icon, Socket.io, and testing infrastructure are sufficient.
- Native `Intl.DateTimeFormat` can group and display dates without adding a date library.

## Estimated delivery

| Phase | Estimate |
| --- | ---: |
| Data model, migration, compatibility | 1–1.5 days |
| API and authorization | 1–1.5 days |
| Write-flow updates | 0.5–1 day |
| Frontend route and state | 0.5–1 day |
| Production UI and responsive states | 1–1.5 days |
| Tests, migration rehearsal, rollout docs | 1–1.5 days |
| **Total** | **5–8 development days** |

The UI alone is relatively straightforward. Data migration, authorization, and ensuring one shared event behaves correctly across Personal and group views account for most of the implementation risk.

## Definition of done

- Personal and every current group have working history tabs.
- Personal-only and group watch events follow the agreed visibility rules.
- Existing group history is migrated without data loss.
- Edit, delete, and rating permissions are enforced server-side.
- Loading, error, empty, filtered-empty, long-content, and offline/retry states are implemented.
- Desktop, tablet, mobile, keyboard, reduced-motion, and 200% zoom checks pass.
- Server build, client typecheck/build, and relevant Playwright tests pass.
- Legacy history storage remains available until production migration is verified.
