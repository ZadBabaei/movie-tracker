# Sign-in diagnostic — 2026-10-06

## Follow-up: production sign-in page returned 404

After the first fix was pushed, the production browser showed the public 404 page at `/login`. The deployment for `f3ff7bc1` was READY and assigned to the production domains. The newly deployed public-site configuration enabled `cleanUrls` but rewrote every React route to `/app.html`. Vercel requires extensionless rewrite destinations when `cleanUrls` is enabled.

All 14 app rewrites now target `/app`. Local dev/preview route discovery recognizes that production destination while still serving the physical `app.html` file. A routing regression assertion covers the extensionless destinations. All 9 site tests and the client type check/production build passed. This issue prevents the sign-in form from appearing before authentication can begin.

Reference: https://vercel.com/docs/frameworks/frontend/vite

## Confirmed defect and local correction

`acceptAuthenticatedSession` notified session subscribers before storing the accepted token. `AppRouter` uses `useSyncExternalStore` and reads the token from localStorage. A subscriber could therefore render the new session generation while still observing a signed-out session, redirecting a successful login back to `/login`.

The accepted identity and token are now stored before user-scoped state resets and routing notifications. Account isolation and stale-response protection remain covered by the existing tests. This shared function handles password login, signup auto-login, Google login, and token renewal.

A regression test failed before the correction: the subscriber received `null` instead of the accepted token. It passes after the correction.

Changed files: `client/src/auth/sessionScope.ts`, `client/src/auth/sessionScope.test.ts`.

## Verification

- Client tests: 21 files, 185 tests passed.
- Server tests: 305 tests passed, none skipped.
- Client TypeScript check and production build: passed.
- Server TypeScript build: passed.
- Git whitespace check: passed.
- Live `https://movietrk.com/login`: HTTP 200.
- Live Railway `/api/health`: HTTP 200; allows origin `https://movietrk.com` and exposes `X-Refreshed-Token`.

No real account credentials were used. A complete authenticated production browser flow remains unverified. Database-backed Playwright E2E was not run because its required explicit test database configuration was not supplied. The correction has not been committed, pushed, or deployed.

## Production dependency audit

`npm audit --omit=dev` reported the following package findings. Counts include transitive packages and do not establish exploitability in the application.

| Scope | Critical | High | Moderate | Low |
| --- | --- | --- | --- | --- |
| Client | 0 | 1 | 0 | 1 |
| Server | 1 | 4 | 4 | 0 |

Client: axios (high), dompurify (low).

Server: proxy-addr (critical); axios, engine.io, multer, nodemailer (high); body-parser, express, ip-address, qs (moderate). The registry reports fixes available for all listed packages. Dependency upgrades require a separate compatibility review and approval before integration.

## Additional observations and remaining work

- The response interceptor clears the application session on a current-session HTTP 401, except recognized Stremio credential errors. Protected API requests must supply the app token; a provider failure surfaced as a generic 401 could also cause logout. No live authenticated response trace was available to establish this as the reported trigger.
- The authentication middleware catches database failures together with token failures and returns 401. A database outage could therefore clear a valid client session; operational failures should be distinguished from invalid authentication in a separate fix.
- Existing warnings include large client bundles, duplicate Mongoose `slug` indexes, and test-runtime localStorage warnings. Both builds and all tests completed successfully.
- Deploy the session correction and verify password and Google login, navigation, and reload with a user-controlled account. If the loop persists, inspect the first protected API response after login, its status, and its public error message without recording credentials or tokens.
- Address the dependency findings after approving compatible updates.
