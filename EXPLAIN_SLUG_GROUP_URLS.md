# Slug-Based Group URLs

## Issue fixed

Implemented GitHub issue `#3 Add clean slug-based group URLs`.

Before:

- Group pages used raw MongoDB ids like `/group/69fa680be58b19f6e20fb58b`

After:

- Group pages use slug URLs like `/group/movie-night-crew`

## What changed

- Added an optional persisted `slug` field to the group model with a unique sparse index.
- Added server-side slug generation from group names.
- Added duplicate slug handling with numeric suffixes such as `movie-night-crew-2`.
- Removed the old same-name creation block so duplicate group names can still produce unique slugs.
- Added `GET /api/groups/slug/:slug`.
- Updated the main group fetch route so it can resolve either a slug or a legacy Mongo `_id`.
- Added lazy slug backfill for older groups that do not have a slug yet.
- Updated frontend routes from `/group/:id` to `/group/:slug`.
- Updated group navigation and invite-join redirects to prefer `group.slug`.
- Kept backend mutations on the real group `_id` after the group is loaded.

## Files changed

- `server/models/Groups.ts`
- `server/routes/groupRoutes.ts`
- `client/src/App.tsx`
- `client/src/pages/GroupPage.tsx`
- `client/src/pages/GroupChat.tsx`
- `client/src/pages/MyGroupsPage.js`
- `client/src/pages/JoinByLink.tsx`
- `client/src/component/VerticalNavbar.tsx`
- `client/src/component/GroupsModal.tsx`
- `client/src/component/MovieGroupsDropdown.js`
- `client/src/store/useGroupStore.ts`
- `tests/e2e/group-members.spec.ts`
- `tests/e2e/polls.spec.ts`

## Verification

Passed:

- `server`: `npm run build`
- `server`: `npx tsc --noEmit`
- `client`: `npx tsc --noEmit`
- Playwright spec discovery with a safe dummy `E2E_MONGODB_URI`

Not fully run:

- Full Playwright E2E execution requires a running test database and app servers.

Known unrelated issue:

- `client` production build still fails because a dependency inside `node_modules` cannot resolve `react-aria/FocusRing`.
- That build error appears unrelated to the slug URL change.

## Notes for review

- Old `/group/<mongo-id>` URLs should still work because the backend group fetch route resolves either id or slug.
- New UI navigation now prefers slug URLs wherever group links are shown.

## Next step

If this looks correct, add a line with:

`commit and push`

and I will handle the git step.
