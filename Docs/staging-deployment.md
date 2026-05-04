# Movie Tracker Staging Deployment

This staging setup is designed for mostly free-tier hosting:

- Frontend: Vercel
- Backend: Render Web Service
- Database: MongoDB Atlas M0 staging cluster
- Domain: `movieTracker.zadprogramming.com`

## Required Frontend Env Vars

Set these in Vercel for the frontend project:

```env
REACT_APP_API_BASE_URL=https://YOUR_RENDER_BACKEND.onrender.com
REACT_APP_SOCKET_URL=https://YOUR_RENDER_BACKEND.onrender.com
REACT_APP_GOOGLE_CLIENT_ID=your-google-oauth-client-id
REACT_APP_TMDB_API_KEY=your-tmdb-api-key
REACT_APP_TMDB_API_URL=https://api.themoviedb.org/3/search/movie
REACT_APP_ENABLE_BUG_REPORTS=false
```

Local development can use:

```env
REACT_APP_API_BASE_URL=http://127.0.0.1:5000
REACT_APP_SOCKET_URL=http://127.0.0.1:5000
```

If `REACT_APP_API_BASE_URL` is omitted, Axios calls fall back to same-origin `/api` paths. Socket.io falls back to `http://127.0.0.1:5000`.

## Required Backend Env Vars

Set these in Render for the backend service:

```env
NODE_ENV=production
PORT=10000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=long-random-secret
CLIENT_URL=https://movieTracker.zadprogramming.com
APP_URL=https://movieTracker.zadprogramming.com
CORS_ORIGINS=https://movieTracker.zadprogramming.com,http://localhost:3000
VERCEL_PREVIEW_ORIGINS=https://your-preview-url.vercel.app
GOOGLE_CLIENT_ID=your-google-oauth-client-id
STREAM_API_KEY=your-stream-api-key
STREAM_API_SECRET=your-stream-api-secret
TMDB_API_KEY=your-tmdb-api-key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-sender-email
SMTP_PASS=your-smtp-app-password
```

Optional backend env vars used by existing features:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
OPENAI_API_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
GITHUB_TOKEN=
GITHUB_REPO_OWNER=
GITHUB_REPO_NAME=
```

Do not commit any `.env` values or provider secrets.

## MongoDB Atlas Staging DB

1. Create an Atlas M0 free cluster.
2. Create a dedicated staging database user.
3. Add Render's outbound access. For a quick staging setup, Atlas network access can temporarily allow `0.0.0.0/0`; restrict this later if possible.
4. Create a separate database name such as `movie_tracker_staging`.
5. Put the staging connection string in Render as `MONGODB_URI`.

## Render Backend

Create a Render Web Service from the repository:

- Root directory: `server`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Runtime: Node
- Plan: Free

After deploy, verify:

- `https://YOUR_RENDER_BACKEND.onrender.com/api/health` returns `{ "ok": true }`
- `https://YOUR_RENDER_BACKEND.onrender.com/` returns the backend greeting
- Render logs show MongoDB connected to the staging database

Free Render services can sleep when idle. First request after sleep may be slow.

## Vercel Frontend

Create a Vercel project from the repository:

- Root directory: `client`
- Framework preset: Create React App
- Build command: `npm run build`
- Output directory: `build`

Set `REACT_APP_API_BASE_URL` and `REACT_APP_SOCKET_URL` to the Render backend URL before building.

## Domain

1. In Vercel, add `movieTracker.zadprogramming.com` to the frontend project domains.
2. Add the DNS record Vercel provides at the DNS host for `zadprogramming.com`.
3. In Render, keep the backend on the Render subdomain unless you want a separate backend subdomain such as `api.zadprogramming.com`.
4. Add the final frontend origin to backend CORS:

```env
CLIENT_URL=https://movieTracker.zadprogramming.com
APP_URL=https://movieTracker.zadprogramming.com
CORS_ORIGINS=https://movieTracker.zadprogramming.com,http://localhost:3000
```

## Manual Deployment Checklist

1. Create Atlas staging DB and user.
2. Create Render backend service from `server`.
3. Add backend env vars in Render.
4. Deploy backend manually.
5. Confirm `/api/health` works.
6. Create Vercel frontend project from `client`.
7. Add frontend env vars in Vercel.
8. Add `movieTracker.zadprogramming.com` in Vercel domains and configure DNS.
9. Add the Vercel production and preview URLs to Render CORS env vars.
10. Re-deploy backend after CORS env changes.
11. Re-deploy frontend after backend URL env changes.
12. Test staging sign-up, Google sign-in, forgot password, group chat, Socket.io updates, watchlist, polls, and image uploads.
