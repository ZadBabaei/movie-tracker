# Movie Tracker Domain Migration Handoff

Last updated: 2026-08-24

## Status

Migration is in production verification. The reviewed commits are deployed, Namecheap DNS is configured, Vercel has verified both new domains, TLS is issued, Google OAuth origins are saved, and Railway now uses the canonical apex for `APP_URL` and `CLIENT_URL`. Transitional CORS remains active and the old production hostname remains available without a redirect. Authenticated/email workflow verification and the rollback observation window remain.

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
- Reauthenticated Railway as the account with access to `pacific-warmth` / `production` / `movie-tracker` and confirmed production-variable access.
- Preserved the two existing `CORS_ORIGINS` entries and appended `https://movietrk.com` and `https://www.movietrk.com` with `--skip-deploys`.
- Confirmed `APP_URL` and `CLIENT_URL` remain on the old production origin until new-domain DNS and HTTPS pass.
- Reconfirmed through Vercel that the required project-specific DNS records are unchanged and that `www` remains configured as a 308 redirect to the apex.
- Pushed commits through `4507cb37` to `origin/main` after explicit approval.
- Confirmed Vercel production deployment `dpl_8nDeKQQaCqvRXVN4VoqEAQ8oLv7u` reached `Ready` and carries the old hostname plus both new-domain aliases.
- Confirmed Railway production deployment `e698d3c3-a3a4-47d5-9039-dad6125e32b6` reached `SUCCESS` for commit `4507cb37`.
- Confirmed the old hostname serves the new frontend with HTTP 200, remains on Vercel, and is not redirected.
- Confirmed Google OAuth saved both new authorized JavaScript origins while retaining localhost and the old production origin; the existing Railway Google callback URI was not changed.
- Confirmed Namecheap BasicDNS now contains both exact Vercel apex A records and the project-specific `www` CNAME, with the former parking records removed.
- Confirmed Vercel reports both new domains configured correctly and verified.
- Issued Vercel certificate `cert_AamQeLisylgdadRTuzmBybHn` for `movietrk.com` and `www.movietrk.com`; it is configured for automatic renewal.
- Confirmed both Vercel apex A endpoints return HTTPS 200 with the real hostname and certificate, and `www` returns 308 to `https://movietrk.com/`.
- Changed Railway `APP_URL` and `CLIENT_URL` to the canonical apex only after DNS and TLS passed; verified the complete transitional CORS set was unchanged.
- Confirmed Railway deployment `f15d7916-9aec-41ca-a2d5-5ccfbaa33941` reached `SUCCESS` with the canonical URL variables active.

## DNS Records Required

Namecheap BasicDNS remains authoritative. Replace only the existing parking records at `@` and `www`.

| Type | Host | Value | TTL | Status |
|---|---|---|---|---|
| A | `@` | `216.198.79.1` | Automatic | Configured and Vercel-verified |
| A | `@` | `64.29.17.1` | Automatic | Configured and Vercel-verified |
| CNAME | `www` | `f314c7ae274be061.vercel-dns-017.com` | Automatic | Configured and Vercel-verified |

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

`VERCEL_PREVIEW_ORIGINS` is not currently configured. Railway variable access is confirmed. `CORS_ORIGINS` preserves every prior entry and includes both new origins plus the old production hostname. `APP_URL` and `CLIENT_URL` now use the canonical apex and became active with Railway deployment `f15d7916-9aec-41ca-a2d5-5ccfbaa33941`. Vercel frontend environment values were not changed.

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
| New-origin CORS before deployment | Expected failure confirmed; updated variable is staged but not deployed |
| Four ahead commits | Reviewed; all changes are intentional and deployment-scoped |
| Client dependency audit | One high transitive finding: `nanoid@3.3.17`; no checked application path reaches the vulnerable size-zero custom-generator case |
| Vercel deployment for `4507cb37` | Passed: deployment reached `Ready`; build and type-check completed |
| Railway deployment for `4507cb37` | Passed: deployment reached `SUCCESS`; server started and connected to MongoDB |
| Old hostname after deployment | Passed: HTTP 200 from Vercel, no redirect, new canonical metadata present |
| Post-deployment logs | No deployment errors; known dependency/bundle warnings on Vercel and duplicate Mongoose `slug` index warning on Railway remain |
| Public DNS | Passed on Google and Cloudflare resolvers for both apex A records and the project-specific `www` CNAME |
| Vercel domain verification | Passed for apex and `www` |
| TLS certificate | Passed: certificate covers apex and `www`, renews automatically |
| Apex HTTPS through both required A records | Passed: HTTP 200 from Vercel with the real hostname/SNI |
| `www` redirect | Passed: HTTPS 308 to `https://movietrk.com/` |
| Active Railway canonical variables | Passed using boolean-only verification; `APP_URL` and `CLIENT_URL` are canonical and CORS is preserved |
| Live API CORS | Passed: health endpoint returned 200 and exact allowed-origin headers for apex, `www`, and old hostname |
| Live Socket.IO CORS | Passed: polling handshake returned 200 and exact allowed-origin headers for apex, `www`, and old hostname |
| Desktop and mobile browser rendering | Passed for homepage, signup, terms, and protected-route fallback; no horizontal overflow or runtime/console errors |
| Google OAuth entry point | Passed: production button opened `accounts.google.com` sign-in; no account or credentials were used |

The first Vitest run was attempted concurrently with both builds and its workers timed out before loading tests. The isolated one-thread rerun passed completely.

## Manual Work Still Required

1. Complete authenticated production checks with real user-controlled accounts/mailboxes: registration, standard login, completion of Google login, password-reset email/link, group-invitation email/link, authenticated movie search/TMDB, and chat/realtime behavior.
2. Confirm ordinary access to `https://movietrk.com` from at least one user device/network. This workstation's resolver path retained inconsistent Namecheap parking cache during cutover even after public resolvers had converged; direct checks against both verified Vercel edges passed.
3. If Google Branding lists authorized domains, confirm `movietrk.com` is present without removing `zadprogramming.com` during transition.
4. Check Railway and Vercel logs again after authenticated production verification.
5. Keep the old hostname active throughout the rollback observation window; do not redirect it yet.
6. Commit the final `context.md` status and obtain explicit approval before any additional push.

## Previous Stop-Hook Failure

The prior interrupted turn stopped during read-only Git, DNS, Vercel verification, and Railway authentication/status checks. The repository has no active custom Git hooks, the reflog has no commit after `4507cb37`, and no deployment was created. It did not alter committed or deployed work. The only new platform mutation in the resumed work is the explicitly staged `CORS_ORIGINS` update, made with automatic deployment suppressed.

## Rollback Procedure

1. Keep `movietracker.zadprogramming.com` attached and unchanged; use it as the known-good user entry point if the new hostname fails.
2. If backend behavior regresses, restore the securely captured pre-migration values for `APP_URL`, `CLIENT_URL`, and `CORS_ORIGINS`, then redeploy the current Railway artifact.
3. If only the new hostname fails, leave Railway and the old hostname unchanged and correct Namecheap/Vercel DNS or certificate state.
4. Vercel can be rolled back to the prior known-good production deployment `dpl_GDrdZDZABVKbHYH4sbYKTswbX9iq` if the new deployment regresses.
5. Remove the new Vercel domains or restore Namecheap parking records only if the migration is explicitly abandoned.
6. Do not redirect the old hostname until all critical verification checks pass and logs remain clean through an observation window.
