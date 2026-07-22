# Movie Tracker client

React client built with Vite.

## Requirements

- Node.js 22.12 or newer
- The Movie Tracker API running locally on port 5000 for full functionality

## Commands

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

The development server uses `http://127.0.0.1:3000` and proxies `/api` and
`/socket.io` to `http://127.0.0.1:5000` by default.

## Environment variables

Copy `.env.example` to `.env.local` and configure the required `VITE_*`
variables. Values prefixed with `VITE_` are bundled into client-side code and
must not contain private secrets.

## Deployment

Vercel builds the client into `dist`. The SPA rewrite in `vercel.json` keeps
direct navigation to React Router paths working.
