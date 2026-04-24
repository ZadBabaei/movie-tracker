# Movie Tracker — Bug Fix & Feature Implementation Plan

## Context

The Movie Tracker app has 8 active bugs (2 blockers, 3 high, 3 medium) and 6 planned features documented in the Obsidian vault. This plan addresses all bugs and features in 5 phases, ordered by severity and dependency.

---

## Phase 1 — P0 Blockers

### BUG-03: Invite Friend Fails on Submit
**Root cause:** `InviteFriendsModal.tsx:93` hardcodes `http://localhost:5000` instead of using `REACT_APP_API_URL`.
- **File:** `client/src/component/InviteFriendsModal.tsx`
- **Fix:** Replace hardcoded URL with `process.env.REACT_APP_API_URL` (use `apiClient` from `../api/apiClient` instead of raw axios)

### BUG-08: Chat Box Inconsistent Rendering
**Root cause:** `chatRoutes.ts:48` only upserts the requesting user into Stream Chat. Other group members don't exist in Stream, so channel creation fails.
- **File:** `server/routes/chatRoutes.ts` — upsert ALL group members into Stream Chat after line 48
- **File:** `client/src/component/ChatBox.js` — add error state instead of infinite spinner, normalize member IDs to strings

---

## Phase 2 — P1 Layout & Visual Bugs

### BUG-01: Sign-Up Page Layout Broken
- **File:** `client/src/pages/Signup.css` — ensure `.wrapper` has explicit `flex-direction: row`

### BUG-04: Tick Icons Overlapping Search Dropdown
- **File:** `client/src/component/SearchBar.css` — increase `.search-bar-glass-wrapper` z-index to `50`+

### BUG-05: Remove WatchTimeline from Watchlist Page
- **File:** `client/src/pages/Watchlist.tsx` — remove `WatchTimeline` import and render block

---

## Phase 3 — P2 UX Polish + Small Features

### BUG-02: Create Group Modal Missing Validation
- **File:** `client/src/component/GroupNameModal.js` — add error state for empty group name

### BUG-07: Group Page Button Alignment
- **File:** `client/src/pages/GroupPage.css` — fix `.group-member-btn` margin and display

### Feature 1: Password Visibility Toggle
- **File:** `client/src/pages/Signup.js` — add MUI eye icon toggle on password fields

### Feature 2: Terms of Service Page
- **Create:** `client/src/pages/Terms.tsx`
- **File:** `client/src/App.tsx` — add `/terms` route
- **File:** `client/src/pages/Signup.js` — link checkbox to `/terms`

---

## Phase 4 — Favorite Groups + Navbar Sub-Menu

### Feature 4: Favorite Groups (max 2)
- **Server:** `server/models/user.ts`, `server/routes/groupRoutes.ts` — add favoriteGroups field + endpoints
- **Client:** `client/src/store/useGroupStore.ts`, `client/src/pages/MyGroupsPage.js` — star icon toggle

### Feature 3: Navbar Group Sub-Menu
- **File:** `client/src/component/VerticalNavbar.tsx` — hover dropdown with 2 favorite groups
- **File:** `client/src/component/VerticalNavbar.css` — submenu styles

---

## Phase 5 — Watch History Data + Group Chat in Navbar

### Feature 5: Watch History Data Collection (when/where/who)
- **Server:** `server/models/Groups.ts` — extend movies to subdocuments with metadata
- **Server:** `server/routes/watchlistRoutes.ts` — accept watch metadata in mark-watched
- **Client:** `client/src/component/GroupSelectModal.tsx` — multi-step form (when/where/who)
- **Client:** `client/src/pages/GroupPage.tsx` — render `WatchTimeline` with metadata

### Feature 6: Group Chat in Navbar
- **File:** `client/src/component/VerticalNavbar.tsx` — chat bubble icon with group dropdown + unread badge

---

## Progress Tracker

- [x] Phase 1 — P0 Blockers
- [x] Phase 2 — P1 Layout Bugs
- [x] Phase 3 — P2 UX Polish + Small Features
- [x] Phase 4 — Favorite Groups + Navbar Sub-Menu
- [x] Phase 5 — Watch History Data + Group Chat in Navbar
