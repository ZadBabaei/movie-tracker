# Movie Tracker — Improvement & Deployment Plan

---

## Phase 0 — Bug Fixes (Do First, 2–3 days)

These are blockers. Fix these before building anything new.

| # | What | Where | Fix |
|---|---|---|---|
| 1 | Duplicate `/api/groups` route | `server/index.js:24-28` | Remove the second `app.use("/api/groups", ...)` line |
| 2 | Fake online status | `client/src/pages/GroupPage.js:115` | Remove `_id.endsWith("1")` logic — use Stream Chat presence API instead |
| 3 | Fake "Top Contributor" badge | `client/src/pages/GroupPage.js:122` | Remove until you have real data (most movies added per user) |
| 4 | Poll winner calculated locally | `client/src/component/VoteModal.js:76` | Move winner calculation to the backend, return it from the poll API |
| 5 | `setInterval` every 5 seconds for poll status | `client/src/pages/GroupChat.js:54` | Replace with Socket.io event (done in Phase 2) — for now increase to 15s |
| 6 | `authenticate` middleware not used consistently | `server/routes/groupRoutes.js` | Replace manual JWT decode in each handler with the `authenticate` middleware |

---

## Phase 1 — Developer Foundation (1 week)

Do this before adding features. It will make every future phase easier and prevent bugs.

### 1A — TypeScript Migration

Convert the entire codebase from `.js` to `.tsx`/`.ts`. The biggest payoff is catching data shape
inconsistencies (movies have `id` vs `_id` vs `imdbID` in different places).

**Steps:**
1. `npm install --save-dev typescript @types/react @types/react-dom @types/node @types/express @types/jsonwebtoken @types/bcryptjs @types/mongoose`
2. Add `tsconfig.json` to both `client/` and `server/`
3. Rename files one folder at a time, starting with `models/` on the server
4. Define shared types: `Movie`, `Group`, `User`, `Poll` in `server/types/`

No new runtime dependencies. Pure tooling.

### 1B — Replace ModalContext with Zustand

`client/src/context/ModalContext.js` already manages 8+ pieces of state and will keep growing.

```
npm install zustand
```

Create separate stores:
- `useModalStore` — which modals are open
- `useGroupStore` — group list, current group, members
- `usePollStore` — current poll, selected movies, vote state

### 1C — Replace manual useEffect + axios with TanStack Query

Every page currently does `useEffect → axios.get → setState → handle loading/error manually`.
TanStack Query handles all of that automatically.

```
npm install @tanstack/react-query
```

Wrap `index.js` with `QueryClientProvider`. Replace data-fetching `useEffect`s with `useQuery` hooks.
Start with `GroupPage` and `MyGroupsPage` — biggest wins.

### 1D — Add Zod Validation

```
npm install zod
```

- On the **server**: validate request bodies in routes before hitting the DB
- On the **client**: validate form inputs (login, signup, group name)

---

## Phase 2 — Fix Core UX Flows (1 week)

### 2A — Remove the GroupChat Popular Movies Sidebar

In `client/src/pages/GroupChat.js`, delete the `fetchMovieList` function, the `movieList` state,
and the entire `GroupChatPage-search-section` div. Replace it with the group's actual watched movie
list (already available from the group API).

### 2B — Add Socket.io (replaces the 5-second interval)

**Server:**
```
npm install socket.io
```

Attach Socket.io to the Express server. Emit events when:
- A poll is created → `poll:created`
- A vote is cast → `poll:updated`
- A poll completes → `poll:completed`
- A movie is added to the group → `group:movie_added`

**Client:**
```
npm install socket.io-client
```

Connect in a `useSocket` hook. Replace the `setInterval` in GroupChat with a socket listener.

### 2C — Fix the Poll Flow End-to-End

Current issues: winner is calculated locally, no reveal moment, no clear "poll ended" state.

**Backend changes:**
- `POST /api/polls/:id/vote` — store vote in DB, recalculate and return current standings
- `GET /api/polls/:id/results` — return final ranked results with winner
- When a poll completes, emit `poll:completed` via Socket.io with the winner data

**Frontend changes:**
- Add a `PollResults` view inside `VoteModal` with ranked results and winner highlight (use Framer Motion — already installed)
- Show "Poll complete — [Movie Name] won!" state instead of just resetting

### 2D — Shareable Group Invite Link

Instead of only inviting by searching for a user, generate a unique invite token:

```
GET  /api/groups/:id/invite-link  →  returns { url: "yourapp.com/join/abc123token" }
GET  /api/join/:token             →  validates token and adds user to group
```

Copy-to-clipboard button in the invite modal. 10x easier than searching by email.

---

## Phase 3 — High-Impact New Features (2 weeks)

### 3A — "Where to Watch" (TMDB Providers)

TMDB has a free endpoint: `GET /movie/{movie_id}/watch/providers`

Returns which streaming services (Netflix, Prime, Hulu, etc.) have the movie, per country.

Show provider logos on:
- `MovieCard` — small icons at the bottom
- `MovieModal` — full section "Available on..."

No new dependency. Uses your existing `REACT_APP_TMDB_API_KEY`.

### 3B — Real-Time In-App Notifications

Use the Socket.io connection from Phase 2 plus a notifications Zustand store.

**Notification bell in the navbar** with unread count badge.

Trigger notifications for:
- "You've been invited to [Group Name]"
- "[User] started a poll in [Group Name]"
- "The poll in [Group Name] finished — [Movie] won!"
- "[User] added [Movie] to [Group Name]"

Store notifications in MongoDB (`models/Notification.js`). On login, fetch unread notifications.
Mark as read when opened.

### 3C — Post-Watch Reviews & Ratings

After a movie appears in the group's watched list, each member can:
- Give it a 1–5 star rating
- Leave a short text review (optional)

**Backend:**
- New model: `Review` — `{ userId, groupId, movieImdbId, rating, text, createdAt }`
- `POST /api/reviews` — create/update a review
- `GET /api/reviews/group/:groupId/movie/:imdbId` — get all reviews for a movie in a group

**Frontend:**
- Star rating component on `MovieCard` (only in the watched list, not during search)
- Reviews panel in `MovieModal`
- Use the existing `vote_average` field to store the group's average score

---

## Phase 4 — New Features (2 weeks)

### 4A — Movie Night Scheduler

After a poll completes, a "Schedule Movie Night" button appears.

**Backend:**
- Add `movieNight: { date, movieId, status }` to the Group model
- `POST /api/groups/:id/schedule` — set the date
- `GET /api/groups/:id/schedule` — get upcoming movie night

**Frontend:**
- MUI `DateTimePicker` (already have MUI installed)
- Show countdown on the Group page: "Movie night in 2 days — Interstellar"
- Email reminder via **Resend** (free: 3,000 emails/month), sent 24h before

```
npm install resend   # server only
```

### 4B — Activity Feed

A timeline inside the Group page showing recent events.

**Backend:**
- New model: `Activity` — `{ groupId, userId, type, payload, createdAt }`
- Log activities on: movie added/removed, poll created, member joined, movie night scheduled
- `GET /api/groups/:id/activity` — returns last 20 events

**Frontend:**
- Scrollable feed below member cards on `GroupPage`
- Format: avatar + message + relative timestamp ("2 hours ago")

### 4C — Watchlist → Suggest to Group

On the Watchlist page, each movie gets a "Suggest to Group" button.

Opens a dropdown to pick which group to suggest it to. Creates a pending suggestion that
appears as a pre-populated option when creating a poll.

**Backend:**
- Add `suggestions: [{ movieId, suggestedBy, suggestedAt }]` to the Group model
- `POST /api/groups/:id/suggest` — add a suggestion

---

## Phase 5 — Profile & Onboarding (1 week)

### 5A — Profile Picture Upload with Cloudinary

```
npm install cloudinary multer   # server only
```

**Backend:**
- `POST /api/user/avatar` — accepts multipart upload, stores in Cloudinary, saves URL to User model

**Frontend:**
- Click-to-upload on the Profile page avatar
- Cloudinary free tier: 25GB storage, 25GB bandwidth/month

### 5B — Profile Stats

Pull from existing data:
- Movies watched (unique movies across all groups)
- Groups joined
- Polls voted in
- Reviews written

`GET /api/user/stats` — aggregates from MongoDB.

### 5C — Onboarding Flow

After first signup, detect `user.firstLogin === true` and show a 3-step modal:

1. "Create your first group" — pre-fills the group name modal
2. "Search for a movie you love" — opens the search bar
3. "Invite a friend" — shows the invite link

Mark `firstLogin = false` after completion. Add this flag to the User model.

---

## Phase 6 — Mobile UX (3–4 days)

The vertical navbar does not work on mobile screens.

- At `< 768px`, hide the vertical navbar and show a **bottom tab bar** instead (Home, Groups, Chat, Inbox, Profile)
- Pure CSS + conditional render — no new libraries needed
- Test all pages on mobile viewport
- GroupChat layout in particular will need responsive work

---

## Deployment Plan

### What you need to buy

**Domain name only — ~$10–15/year**

Buy from:
- **Namecheap** — cheapest (~$10/year for `.com`)
- **AWS Route 53** — slightly more, but integrates cleanly with AWS (~$12/year + $0.50/month for hosted zone)

Everything else can be free or very cheap.

---

### Option A — Recommended (Free + Cheap, easiest setup)

| Service | What it does | Cost |
|---|---|---|
| **Vercel** | Hosts the React frontend | Free |
| **Render** | Hosts the Express backend | Free (cold starts) or $7/month always-on |
| **MongoDB Atlas** | Cloud MongoDB M0 cluster | Free up to 512MB |
| **Cloudinary** | Profile picture storage | Free tier (25GB) |
| **Resend** | Email notifications | Free (3,000 emails/month) |
| **Stream Chat** | Already in use | Free up to 5 MAU, then $99/month |
| **Domain** | yourapp.com | ~$10–15/year |

**Total: ~$10–15/year** (just the domain)
With Render always-on ($7/month): ~$95/year

**Setup steps:**
1. Push repo to GitHub
2. **Vercel** → New Project → import from GitHub → set env vars (`REACT_APP_TMDB_API_KEY`, etc.) → deploy
3. **Render** → New Web Service → connect GitHub → point to `server/` folder → set env vars (`MONGODB_URI`, `JWT_SECRET`, `STREAM_API_KEY`, `STREAM_API_SECRET`, `NODE_ENV=production`) → deploy
4. In `client/`, add a `vercel.json` to rewrite `/api/*` to your Render backend URL:
   ```json
   {
     "rewrites": [
       { "source": "/api/:path*", "destination": "https://your-app.onrender.com/api/:path*" }
     ]
   }
   ```
5. **MongoDB Atlas** → create free M0 cluster → get connection string → paste into Render env vars → whitelist Render's IP
6. Point your domain to Vercel via DNS settings in Namecheap (Vercel gives you the records)

---

### Option B — Full AWS (More control, scales better, more setup)

Use this if you expect real traffic or want to learn AWS.

| Service | What it does | Cost |
|---|---|---|
| **AWS Amplify** | Hosts the React frontend | Free tier: 15GB/month. After: ~$0.01/GB |
| **AWS EC2 t3.micro** | Runs the Express server | Free tier 12 months, then ~$8/month |
| **MongoDB Atlas** | Database (do NOT use DocumentDB — too expensive) | Free M0 tier |
| **AWS S3** | Static assets / file storage | Free tier: 5GB. After: ~$0.023/GB |
| **AWS CloudFront** | CDN in front of S3 and the app | Free tier: 1TB/month |
| **AWS Route 53** | DNS for your domain | $0.50/month per hosted zone |
| **AWS SES** | Email notifications | Free: 3,000/month. After: $0.10/1,000 |
| **AWS Certificate Manager** | Free SSL/HTTPS | Free |
| **Cloudinary** | Profile pictures (easier than S3 for images) | Free tier |

**Setup steps:**
1. **Frontend** → AWS Amplify Console → connect GitHub → auto-deploys on push to `main` → set env vars
2. **Backend** → Launch EC2 t3.micro (Ubuntu) → SSH in → install Node.js → clone repo → use **PM2** to keep server alive:
   ```
   npm install -g pm2
   pm2 start server/index.js --name movie-tracker
   pm2 save && pm2 startup
   ```
3. **NGINX** on EC2 as reverse proxy — routes port 80/443 to port 5000, handles SSL termination
4. **SSL** → AWS Certificate Manager → free certificate → attach to CloudFront distribution
5. **Database** → MongoDB Atlas free M0 (not DocumentDB)
6. **Domain** → Buy on Namecheap → point nameservers to Route 53 → create A records to Amplify/EC2

**AWS free tier lasts 12 months. After that: ~$15–25/month for a small app.**

---

### Recommendation

Start with **Option A (Vercel + Render + Atlas)**. Takes ~30 minutes to deploy vs several hours
for AWS. You can migrate to AWS later once you have real traffic. The architecture stays the same.

**Watch the Stream Chat limit.** Free tier is 5 Monthly Active Users. If you exceed it:
1. Pay Stream Chat ($99/month — worth it if the app is growing)
2. Self-host chat with Socket.io rooms on your own server (you'll have Socket.io from Phase 2 anyway)

---

## Implementation Timeline Summary

| Phase | Work | Duration | New Dependencies |
|---|---|---|---|
| 0 | Bug fixes | 2–3 days | None |
| 1 | TypeScript + Zustand + TanStack Query + Zod | 1 week | `typescript`, `zustand`, `@tanstack/react-query`, `zod` |
| 2 | Socket.io + fix poll flow + invite link + remove sidebar | 1 week | `socket.io`, `socket.io-client` |
| 3 | Where to Watch + notifications + reviews | 2 weeks | None (uses existing TMDB key) |
| 4 | Scheduler + activity feed + watchlist suggest | 2 weeks | `resend` |
| 5 | Profile picture + stats + onboarding | 1 week | `cloudinary`, `multer` |
| 6 | Mobile UX | 3–4 days | None |
| Deploy | Option A first, Option B later | 1–2 days | — |

**Total realistic timeline working part-time: 2–3 months**
