# Movie Tracker Domain Migration Handoff

Last updated: 2026-08-21

## Status

Migration is in progress. The new domains are attached to Vercel and the repository changes are prepared, but Namecheap DNS and Railway environment changes are still blocked/manual. The old production hostname remains available and has not been redirected.

## Work Completed

- Audited repository, git state, deployment docs, Vercel/Railway linkage, CORS, authentication, email URL generation, invitation URL generation, Socket.IO, metadata, and old-domain references.
- Confirmed work is on `main`; the branch already contained three local commits ahead of `origin/main` before this migration.
- Confirmed Vercel project `movie-tracker`, root `client`, production deployment `dpl_GDrdZDZABVKbHYH4sbYKTswbX9iq`, and old-domain alias.
- Confirmed Railway project `pacific-warmth`, production service `movie-tracker`, and successful deployment `0d6fa0ca-8b09-46a3-bbfc-243d5b3e362b`.
- Confirmed the deployed frontend API and Socket.IO origin is the Railway production service.
- Attached `movietrk.com` and `www.movietrk.com` to the existing Vercel project.
- Configured `www.movietrk.com` as a Vercel-managed 308 redirect to `movietrk.com`.
- Kept `movietracker.zadprogramming.com` attached without a redirect.
- Added the apex, `www`, and old origins to the repository CORS fallback shared by Express and Socket.IO.
- Added canonical and social URL metadata for `https://movietrk.com/`.
- Updated README, deployment, architecture, DNS, staging, and recovery documentation.
- Added `.codex-remote-attachments/` to `.gitignore`; no tooling files or secrets are included.

## DNS Records Required

Namecheap BasicDNS remains authoritative. Replace only the existing parking records at `@` and `www`.

| Type | Host | Value | TTL | Status |
|---|---|---|---|---|
| A | `@` | `216.198.79.1` | Automatic | Manual Namecheap change required |
| A | `@` | `64.29.17.1` | Automatic | Manual Namecheap change required |
| CNAME | `www` | `f314c7ae274be061.vercel-dns-017.com` | Automatic | Manual Namecheap change required |

Observed records to remove or replace:

- Apex parking A record resolving to `162.255.119.27`.
- `www` CNAME to `parkingpage.namecheap.com`.
- Any additional Namecheap parking or URL Redirect Record that conflicts at exactly `@` or `www`.

Do not change nameservers and do not remove unrelated MX/TXT records.

## Environment Variables

Names requiring Railway changes:

- `APP_URL`
- `CLIENT_URL`
- `CORS_ORIGINS`

`VERCEL_PREVIEW_ORIGINS` must be preserved if configured. No Railway environment variable was changed because variable reads return `Unauthorized`; current values could not be safely captured for rollback. Vercel frontend environment values were not changed.

Target Railway configuration:

- `APP_URL` and `CLIENT_URL` use the canonical apex.
- `CORS_ORIGINS` retains existing localhost/preview entries and includes the apex, `www`, and old production hostname.

## Tests Performed

| Check | Result |
|---|---|
| Server TypeScript build (`npm run build`) | Passed |
| Client type-check and production build (`npm run build`) | Passed |
| Client Vitest suite, one thread | Passed: 2 files, 7 tests |
| Direct CORS assertions | Passed for apex, `www`, old hostname, localhost; unknown origin rejected |
| Playwright E2E | Not run: `E2E_MONGODB_URI` is absent; safety guard forbids production DB use |
| Old hostname HTTP/HTTPS | Passed before changes; Vercel returned 200 and valid HSTS response |
| Railway health and old-origin CORS | Passed; health and Socket.IO polling returned 200 with old-origin CORS |
| New-origin CORS before deployment | Expected failure confirmed; no allow-origin header yet |

The first Vitest run was attempted concurrently with both builds and its workers timed out before loading tests. The isolated one-thread rerun passed completely.

## Manual Work Still Required

1. Enter the exact DNS records above in Namecheap Advanced DNS.
2. Restore Railway CLI/UI permission, record existing URL/CORS values securely, then update `APP_URL`, `CLIENT_URL`, and `CORS_ORIGINS` and redeploy.
3. In Google Cloud Console, open Google Auth Platform -> Clients, select the Web application client used by `REACT_APP_GOOGLE_CLIENT_ID`, and add `https://movietrk.com` and `https://www.movietrk.com` under Authorized JavaScript origins. Keep the old origin.
4. If Google Branding lists authorized domains, add and verify `movietrk.com` without removing `zadprogramming.com` during transition.
5. After DNS propagation and backend deployment, run the full production checklist: homepage/routes, certificate, registration/login, Google login, API/CORS, Socket.IO, reset and invitation URLs, TMDB/search, chat, desktop/mobile, `www` redirect, and old hostname.
6. Check Railway and Vercel logs after production verification.
7. Do not push the migration commit until explicitly approved.

## Rollback Procedure

1. Keep `movietracker.zadprogramming.com` attached and unchanged; use it as the known-good user entry point if the new hostname fails.
2. If backend behavior regresses, restore the securely captured pre-migration values for `APP_URL`, `CLIENT_URL`, and `CORS_ORIGINS`, then redeploy the current Railway artifact.
3. If only the new hostname fails, leave Railway and the old hostname unchanged and correct Namecheap/Vercel DNS or certificate state.
4. Vercel can be rolled back to production deployment `dpl_GDrdZDZABVKbHYH4sbYKTswbX9iq` if a later frontend deployment regresses.
5. Remove the new Vercel domains or restore Namecheap parking records only if the migration is explicitly abandoned.
6. Do not redirect the old hostname until all critical verification checks pass and logs remain clean through an observation window.
