# Movie Tracker E2E Tests

This folder contains Playwright browser tests for Movie Tracker.

## Setup

Install the root E2E dependencies from the repository root:

```bash
npm install
npx playwright install chromium
```

## Environment

Use a test database only. `E2E_MONGODB_URI` is required and the cleanup helper
refuses to clear a database unless the database name contains `test` or `e2e`.
The tests never fall back to `MONGODB_URI` or `server/.env`.

PowerShell local Mongo example:

```powershell
$env:E2E_MONGODB_URI="mongodb://127.0.0.1:27017/movie-tracker-e2e"
$env:JWT_SECRET="e2e-secret"
$env:E2E_BASE_URL="http://localhost:3000"
$env:E2E_API_URL="http://localhost:5000"
```

For MongoDB Atlas/SRV URIs, include an explicit test database name in the path,
for example:

```powershell
$env:E2E_MONGODB_URI="mongodb+srv://USER:PASS@cluster.mongodb.net/movie-tracker-e2e?retryWrites=true&w=majority"
```

Do not put real secrets in this file or commit them to `.env`.

The Playwright config can start the app automatically:

- server: `npm run dev` in `server`
- client: `npm start` in `client`

If you already started frontend and backend yourself, skip Playwright's
`webServer` management:

```powershell
$env:E2E_SKIP_WEBSERVER="true"
$env:E2E_MONGODB_URI="mongodb+srv://USER:PASS@cluster.mongodb.net/movie-tracker-e2e?retryWrites=true&w=majority"
$env:E2E_BASE_URL="http://localhost:3000"
$env:E2E_API_URL="http://localhost:5000"
npm run e2e
```

When using `E2E_SKIP_WEBSERVER=true`, make sure the manually running backend is
also pointed at the same E2E database. A safe backend test-mode startup looks
like this:

```powershell
$env:NODE_ENV="test"
$env:E2E_MONGODB_URI="mongodb+srv://USER:PASS@cluster.mongodb.net/movie-tracker-e2e?retryWrites=true&w=majority"
$env:JWT_SECRET="e2e-secret"
npm run dev
```

Run that backend command from the `server` folder. In `NODE_ENV=test`, the
backend refuses to start unless `E2E_MONGODB_URI` has an `e2e` or `test`
database name.

## Commands

```bash
npm run e2e
npm run e2e:ui
npm run e2e:report
npm run e2e:manual
```

## Test Structure

- `helpers/db.ts`: clears the test database with a production-safety guard.
- `helpers/factory.ts`: generates unique E2E users and reusable movie data.
- `helpers/api.ts`: creates users, logs in by API or UI, creates groups, invite links, watchlist items, and polls through API setup helpers.

The tests use API helpers for setup and real UI interactions for the behavior under test.

Current coverage:

- 20 invited users appear once on the group page, including repeated invite joins.
- Watchlist eye button opens `GroupSelectModal`, saves metadata, and moves the movie to group watch history.
- Multiple users vote in a poll and completed results are visible in the UI.

## Notes

Do not point `E2E_MONGODB_URI` at production or shared development data. The test
suite deletes all collections in the configured test database before each test.
