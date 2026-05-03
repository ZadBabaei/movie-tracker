# Movie Tracker E2E Tests

This folder contains Playwright browser tests for Movie Tracker.

## Setup

Install the root E2E dependencies from the repository root:

```bash
npm install
npx playwright install chromium
```

## Environment

Use a test database only. The cleanup helper refuses to clear a database unless
the database name contains `test` or `e2e`.

```bash
set E2E_MONGODB_URI=mongodb://127.0.0.1:27017/movie-tracker-e2e
set MONGODB_URI=mongodb://127.0.0.1:27017/movie-tracker-e2e
set JWT_SECRET=e2e-secret
set E2E_BASE_URL=http://localhost:3000
set E2E_API_URL=http://localhost:5000
```

For MongoDB Atlas/SRV URIs, include an explicit test database name in the path,
for example `mongodb+srv://.../movie-tracker-e2e?retryWrites=true&w=majority`.

The Playwright config can start the app automatically:

- server: `npm run dev` in `server`
- client: `npm start` in `client`

If servers are already running on the configured ports, Playwright reuses them.

## Commands

```bash
npm run e2e
npm run e2e:ui
npm run e2e:report
```

## Test Structure

- `helpers/db.ts`: clears the test database with a production-safety guard.
- `helpers/factory.ts`: generates unique E2E users and reusable movie data.
- `helpers/api.ts`: creates users, groups, invite links, watchlist items, and polls through API setup helpers.

The tests use API helpers for setup and real UI interactions for the behavior under test.

Current coverage:

- 20 invited users appear once on the group page, including repeated invite joins.
- Watchlist eye button opens `GroupSelectModal`, saves metadata, and moves the movie to group watch history.
- Multiple users vote in a poll and completed results are visible in the UI.

## Notes

Do not point `E2E_MONGODB_URI` at production or shared development data. The test
suite deletes all collections in the configured test database before each test.
