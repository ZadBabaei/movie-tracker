# Movie Tracker Staging Deployment

Target staging stack:

- Frontend: Vercel
- Backend: Railway
- Database: MongoDB Atlas staging DB
- Domain: `https://movieTracker.zadprogramming.com`

Do not commit `.env` files or provider secrets. Use `client/.env.example` and `server/.env.example` only as variable-name references.

## Railway Backend

Create a Railway service from this repository and set the service root to `server`.

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```

The backend already listens on `process.env.PORT` with a local fallback:

```ts
const PORT = process.env.PORT || 5000;
```

Set these Railway variables:

```env
NODE_ENV=staging
PORT=5000
MONGODB_URI=
JWT_SECRET=
CLIENT_URL=https://movieTracker.zadprogramming.com
APP_URL=https://movieTracker.zadprogramming.com
CORS_ORIGINS=https://movieTracker.zadprogramming.com
GOOGLE_CLIENT_ID=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
ENABLE_BUG_REPORTS=true
ENABLE_BUG_REPORT_EMAILS=true
BUG_REPORT_NOTIFY_EMAIL=
ENABLE_GITHUB_BUG_ISSUES=true
GITHUB_TOKEN=
GITHUB_REPO_OWNER=ZadBabaei
GITHUB_REPO_NAME=movie-tracker
```

Also set these if the related features are enabled in staging:

```env
STREAM_API_KEY=
STREAM_API_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

After deployment, verify:

- `https://YOUR-RAILWAY-BACKEND-DOMAIN/api/health` returns `{ "ok": true }`.
- Railway logs show MongoDB connected to the staging database.
- Railway logs do not show CORS blocks for `https://movieTracker.zadprogramming.com`.

## Vercel Frontend

Create a Vercel project from this repository and set the root directory to `client`.

Build command:

```bash
npm run build
```

Output directory:

```text
build
```

Set these Vercel variables:

```env
REACT_APP_API_BASE_URL=https://YOUR-RAILWAY-BACKEND-DOMAIN
REACT_APP_GOOGLE_CLIENT_ID=
REACT_APP_ENABLE_BUG_REPORTS=true
```

Recommended for full app behavior:

```env
REACT_APP_SOCKET_URL=https://YOUR-RAILWAY-BACKEND-DOMAIN
REACT_APP_TMDB_API_KEY=
REACT_APP_TMDB_API_URL=https://api.themoviedb.org/3/search/movie
```

Frontend backend calls use `REACT_APP_API_BASE_URL` through `client/src/api/apiClient.ts`. If `REACT_APP_API_BASE_URL` is empty during local development, HTTP calls fall back to same-origin `/api` paths, which work through the CRA proxy. Socket.io uses `REACT_APP_SOCKET_URL`, then `REACT_APP_API_BASE_URL`, then `http://127.0.0.1:5000`.

The Vercel project uses `client/vercel.json` to send this header on every route:

```text
Cross-Origin-Opener-Policy: same-origin-allow-popups
```

This is required for the current Google popup flow. If `/manifest.json` or other public assets return `401` on Vercel, Deployment Protection is blocking public access. Disable Vercel Deployment Protection for public staging, or test through the custom domain after it is configured and publicly accessible.

## MongoDB Atlas Staging DB

1. Create an Atlas M0 free cluster.
2. Create a dedicated staging database user.
3. Create a database such as `movie_tracker_staging`.
4. Add the Atlas connection string to Railway as `MONGODB_URI`.
5. For quick staging, allow Railway network access with `0.0.0.0/0`; restrict this later if your plan/setup supports stable outbound IPs.
6. Do not reuse the production database for staging.

## Custom Domain

1. In Vercel, add `movieTracker.zadprogramming.com` to the frontend project.
2. Add the DNS record Vercel provides in the DNS host for `zadprogramming.com`.
3. Keep the backend on Railway's generated domain unless you create a separate API subdomain.
4. In Railway, set:

```env
CLIENT_URL=https://movieTracker.zadprogramming.com
APP_URL=https://movieTracker.zadprogramming.com
CORS_ORIGINS=https://movieTracker.zadprogramming.com
```

5. Redeploy Railway after CORS/domain env changes.
6. Redeploy Vercel after backend URL env changes.

## Google OAuth Domain Update

In Google Cloud Console, update the OAuth client used by staging:

- Authorized JavaScript origins:
  - `https://movieTracker.zadprogramming.com`
  - `http://localhost:3000` for local development

Use the stable custom domain for Google OAuth testing. Random Vercel preview URLs change per deployment and should not be treated as reliable OAuth origins unless you explicitly add each preview origin to Google Cloud for that specific test. Do not rely on random Vercel preview URLs for regular OAuth validation.

The current frontend Google sign-in uses the implicit OAuth flow and sends the Google access token to `/api/auth/google`, so no redirect URI is required unless you change the auth flow later.

## Staging Test Checklist

1. Open `https://movieTracker.zadprogramming.com`.
2. Confirm the frontend can call `GET /api/health` through the Railway backend URL.
3. Register a local account.
4. Sign in with Google.
5. Request a forgot-password email and complete a reset.
6. Create a group and invite a user.
7. Open group chat and confirm Socket.io connects.
8. Create and complete a poll.
9. Add/remove watchlist items.
10. Mark a movie watched with a group.
11. Submit a bug report and verify email/GitHub issue integrations if enabled.
12. Check browser console and Railway logs for CORS, Socket.io, auth, and MongoDB errors.
