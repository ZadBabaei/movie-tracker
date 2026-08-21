# Movie Tracker Deployment

Last reviewed: 2026-08-21

Related documents:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DNS.md](./DNS.md)
- [INFRASTRUCTURE_RECOVERY.md](./INFRASTRUCTURE_RECOVERY.md)

## Deployment Model

| Application | Provider | Source path | Build | Runtime |
|---|---|---|---|---|
| Portfolio | Vercel | portfolio repository root | Vercel Next.js build | Vercel |
| Movie Tracker frontend | Vercel | `client` | `npm run build` | Vercel static/frontend hosting |
| Movie Tracker backend | Railway | `server` | `npm install && npm run build` | Railway Node service |

The frontend and backend are deployed independently. DNS changes should be made only after the target platform reports the domain or service is ready.

## Deployment Prerequisites

| Area | Requirement |
|---|---|
| Namecheap | Access to the `movietrk.com` Advanced DNS page |
| Cloudflare | Access to the `zadprogramming.com` zone while the transition domain remains active |
| Vercel | Access to the team/account containing `portfolio-app` and `movie-tracker` |
| Railway | Access to the `pacific-warmth` project and `movie-tracker` service |
| MongoDB Atlas | Valid `MONGODB_URI` configured in Railway |
| OAuth | Google OAuth credentials configured in the appropriate providers |
| Email | Resend/SMTP credentials configured in Railway and email DNS records present in Cloudflare |
| Secrets | All secrets stored in platform environment variables, not in documentation or source control |

## Local Development

Use the repository's normal local setup. Do not copy production secrets into local files unless explicitly required and protected.

Suggested local flow:

1. Install dependencies in the frontend/client directory.
2. Install dependencies in the backend/server directory.
3. Create local environment files from safe examples.
4. Use local values for database, OAuth, email, and API integrations.
5. Run backend locally.
6. Run frontend locally with API and Socket.IO URLs pointing to the local backend.

Common local variable placeholders:

| Variable | Example placeholder |
|---|---|
| `REACT_APP_API_BASE_URL` | `<LOCAL_API_URL>` |
| `REACT_APP_SOCKET_URL` | `<LOCAL_SOCKET_URL>` |
| `MONGODB_URI` | `<MONGODB_URI>` |
| `JWT_SECRET` | `<JWT_SECRET>` |
| `GOOGLE_CLIENT_ID` | `<GOOGLE_CLIENT_ID>` |
| `OPENAI_API_KEY` | `<OPENAI_API_KEY>` |

## Vercel Deployment

### Portfolio

| Field | Value |
|---|---|
| Project | `portfolio-app` |
| Repository | `ZadBabaei/portfolio` |
| Production branch | `main` |
| Framework | Next.js |
| Node.js | 24.x |
| Custom domain | `portfolio.zadprogramming.com` |
| Required DNS | See [DNS.md](./DNS.md) |

### Movie Tracker Frontend

| Field | Value |
|---|---|
| Project | `movie-tracker` |
| Repository | `ZadBabaei/movie-tracker` |
| Production branch | `main` |
| Root directory | `client` |
| Install command | `npm install --legacy-peer-deps` |
| Build command | `npm run build` |
| Output directory | `dist` (from `client/vercel.json`; project dashboard still shows legacy `build`) |
| Node.js | 24.x |
| Canonical domain | `movietrk.com` |
| Redirect domain | `www.movietrk.com` -> `movietrk.com` (308) |
| Transition domain | `movietracker.zadprogramming.com` (must remain attached until final acceptance) |
| Required DNS | See [DNS.md](./DNS.md) |

### Vercel Environment Variables

Values must stay in Vercel. Only names are documented.

| Project | Variable names |
|---|---|
| `movie-tracker` | `REACT_APP_API_BASE_URL`, `REACT_APP_SOCKET_URL`, `CI`, `REACT_APP_TMDB_API_KEY`, `REACT_APP_TMDB_API_URL`, `SKIP_PREFLIGHT_CHECK`, `REACT_APP_GOOGLE_CLIENT_ID`, `REACT_APP_ENABLE_BUG_REPORTS` |
| `portfolio-app` | `ADMIN_PASSWORD`, `BLOB_READ_WRITE_TOKEN` |

## Railway Deployment

| Field | Value |
|---|---|
| Project | `pacific-warmth` |
| Environment | `production` |
| Service | `movie-tracker` |
| Repository | `ZadBabaei/movie-tracker` |
| Root directory | `server` |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Runtime | Node on Railway |
| Public backend URL | `<RAILWAY_BACKEND_URL>` |
| Target port | `<RAILWAY_TARGET_PORT>` |
| Custom domain | None currently required |

### Railway Environment Variables

Values must stay in Railway. Only names are documented.

| Category | Variable names |
|---|---|
| App URLs/CORS | `APP_URL`, `CLIENT_URL`, `CORS_ORIGINS` |
| Runtime | `NODE_ENV`, `PORT`, `RAILWAY_ENVIRONMENT`, `RAILWAY_ENVIRONMENT_NAME`, `RAILWAY_PROJECT_NAME`, `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_SERVICE_NAME`, `RAILWAY_STATIC_URL` |
| Database | `MONGODB_URI` |
| Auth | `JWT_SECRET`, `GOOGLE_CLIENT_ID` |
| Email | `EMAIL_FROM`, `RESEND_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` |
| Media | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| AI | `OPENAI_API_KEY` |
| Movie data | `TMDB_API_KEY`, `WATCHMODE_API_KEY`, `WATCHMODE_REGION` |
| Realtime/other integrations | `STREAM_API_KEY`, `STREAM_API_SECRET` |
| Bug reporting | `ENABLE_BUG_REPORTS`, `ENABLE_BUG_REPORT_EMAILS`, `ENABLE_GITHUB_BUG_ISSUES`, `BUG_REPORT_NOTIFY_EMAIL`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_TOKEN` |

## DNS Setup

Namecheap BasicDNS is authoritative for `movietrk.com`. Cloudflare remains authoritative for the old `zadprogramming.com` zone during the transition.

Required app routing:

| Hostname | Platform |
|---|---|
| `movietrk.com` | Vercel canonical frontend |
| `www.movietrk.com` | Vercel 308 redirect to the canonical frontend |
| `movietracker.zadprogramming.com` | Vercel transition frontend; retain until migration acceptance |

See [DNS.md](./DNS.md) for exact records and recovery rules.

## Production Deployment Checklist

1. Confirm the intended platform for the hostname.
2. Confirm build and runtime environment variables exist.
3. Deploy backend first if the frontend depends on backend changes.
4. Verify Railway service status is healthy.
5. Deploy frontend to Vercel.
6. Verify Vercel production deployment is ready.
7. Verify custom domain status in Vercel.
8. Verify DNS in Namecheap and with public resolvers.
9. Test browser URL, API calls, auth, Socket.IO, and email paths.

## Rollback Procedure

### Vercel

1. Identify the previous known-good production deployment in Vercel.
2. Promote or roll back to that deployment from Vercel.
3. Verify custom domain aliases still point to the production deployment.
4. Test the public hostname.

### Railway

1. Identify the previous known-good Railway deployment.
2. Redeploy or roll back using Railway controls.
3. Verify the service reaches a running state.
4. Test `<RAILWAY_BACKEND_URL>` health and Socket.IO endpoints.
5. Confirm Vercel frontend env vars still point to the intended backend.

### DNS

1. If the new domain is unhealthy, restore the prior Namecheap parking records only if abandoning the migration; otherwise keep the Vercel records and troubleshoot before changing aliases.
2. Restore Railway `APP_URL`, `CLIENT_URL`, and `CORS_ORIGINS` to their pre-migration values if backend URL generation or CORS regresses.
3. Keep `movietracker.zadprogramming.com` attached and unchanged so users retain a known-good entry point.
4. Verify records with Namecheap and public resolvers, then re-check Vercel domain configuration.

## Disaster Recovery

Use [INFRASTRUCTURE_RECOVERY.md](./INFRASTRUCTURE_RECOVERY.md) for full rebuild steps.

Minimum recovery order:

1. Restore Cloudflare zone and nameservers.
2. Restore Vercel project domain attachments.
3. Restore Railway service and environment variables.
4. Restore MongoDB Atlas connectivity.
5. Restore email provider DNS and env vars.
6. Verify app request, auth, Socket.IO, and email flows.

## Common Deployment Issues

| Symptom | Likely cause | First check |
|---|---|---|
| Vercel says domain misconfigured | Missing or wrong Namecheap DNS record | [DNS.md](./DNS.md) |
| Frontend loads but API fails | Wrong `REACT_APP_API_BASE_URL` or backend down | Vercel env vars, Railway service status |
| Socket.IO does not connect | Wrong `REACT_APP_SOCKET_URL`, CORS, or backend Socket.IO issue | Railway logs and CORS variables |
| Login fails | OAuth config mismatch | Google OAuth redirect/origin config and backend auth vars |
| Emails fail | Missing email credentials or DNS auth | `RESEND_API_KEY`, `SMTP_*`, SPF/DKIM/DMARC |
| Database errors | MongoDB URI or network/access issue | `MONGODB_URI`, Atlas network access |
| DNS points to Hetzner unexpectedly | Bad recovery/migration record | Cloudflare DNS records |

