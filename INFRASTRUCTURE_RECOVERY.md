# Movie Tracker Infrastructure Recovery

Last reviewed: 2026-08-21

Related documents:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [DNS.md](./DNS.md)

## Scope

This guide restores Movie Tracker without exposing secrets. It covers Namecheap DNS for the canonical domain, the retained Cloudflare transition domain, Vercel, Railway, MongoDB Atlas, SSL, and production verification.

Use placeholders for sensitive values:

| Placeholder | Meaning |
|---|---|
| `<RAILWAY_BACKEND_URL>` | Railway-generated public backend URL |
| `<MONGODB_URI>` | MongoDB Atlas connection string |
| `<JWT_SECRET>` | Backend JWT signing secret |
| `<OPENAI_API_KEY>` | OpenAI API key |
| `<GOOGLE_CLIENT_ID>` | Google OAuth client ID |
| `<RESEND_API_KEY>` | Resend API key |
| `<SMTP_PASSWORD>` | SMTP password |

## Disaster Recovery Order

1. Confirm `movietrk.com` still uses Namecheap BasicDNS and the transition domain still uses Cloudflare.
2. Rebuild the canonical records from [DNS.md](./DNS.md) without changing the old hostname.
3. Confirm Vercel projects exist and custom domains are attached.
4. Confirm Railway project and backend service exist.
5. Restore environment variable names and values from the secure secret manager or provider UI.
6. Verify MongoDB Atlas access.
7. Verify email provider DNS and credentials.
8. Verify frontend, API, Socket.IO, auth, and email flows.

## Rebuilding Cloudflare DNS

1. Open the Cloudflare zone for `zadprogramming.com`.
2. Confirm nameservers are active at the registrar.
3. Recreate only the records listed in [DNS.md](./DNS.md).
4. Keep app records DNS-only unless a tested proxy change is approved.
5. Keep `vpn.zadprogramming.com` DNS-only and pointed only to the VPN server.
6. Do not point app hostnames to the VPN IP.

Verification:

```powershell
Resolve-DnsName zadprogramming.com -Type A -Server 1.1.1.1
Resolve-DnsName portfolio.zadprogramming.com -Type CNAME -Server 1.1.1.1
Resolve-DnsName movietracker.zadprogramming.com -Type A -Server 1.1.1.1
Resolve-DnsName vpn.zadprogramming.com -Type A -Server 1.1.1.1
```

## Rebuilding Namecheap DNS

1. Keep Namecheap BasicDNS nameservers in place.
2. Remove only conflicting parking or URL redirect records at `@` and `www`.
3. Add the two apex A records and the project-specific `www` CNAME from [DNS.md](./DNS.md).
4. Leave unrelated MX and TXT records unchanged.
5. Run Vercel domain verification and public DNS checks before testing application flows.

## Reconnecting Vercel

### Portfolio

1. Confirm Vercel project `portfolio-app` exists.
2. Confirm repository connection to `ZadBabaei/portfolio`.
3. Confirm production branch is `main`.
4. Confirm custom domain `portfolio.zadprogramming.com` is attached.
5. Confirm Cloudflare has the required Vercel DNS record.
6. Confirm Vercel reports the domain as configured.
7. Confirm SSL certificate is issued and auto-renewing.

### Movie Tracker Frontend

1. Confirm Vercel project `movie-tracker` exists.
2. Confirm repository connection to `ZadBabaei/movie-tracker`.
3. Confirm root directory is `client`.
4. Confirm production branch is `main`.
5. Confirm `movietrk.com`, `www.movietrk.com`, and `movietracker.zadprogramming.com` are attached.
6. Confirm Namecheap has the exact Vercel records from [DNS.md](./DNS.md).
7. Confirm `www.movietrk.com` redirects to `movietrk.com` with status 308.
8. Confirm Vercel reports both new domains as configured.
9. Confirm SSL certificates are issued and auto-renewing.
10. Confirm `REACT_APP_API_BASE_URL` and `REACT_APP_SOCKET_URL` point to `<RAILWAY_BACKEND_URL>`.

## Reconnecting Railway

1. Confirm Railway project `pacific-warmth` exists.
2. Confirm service `movie-tracker` exists.
3. Confirm service source is `ZadBabaei/movie-tracker`.
4. Confirm service root directory is `server`.
5. Confirm build command and start command match [DEPLOYMENT.md](./DEPLOYMENT.md).
6. Confirm service exposes `<RAILWAY_BACKEND_URL>`.
7. Confirm no custom domain is required unless a dedicated API hostname is intentionally added.
8. Restore environment variables from secure storage.
9. Redeploy the service.
10. Verify service status is healthy.

Required Railway variable names:

| Category | Variable names |
|---|---|
| URLs/CORS | `APP_URL`, `CLIENT_URL`, `CORS_ORIGINS` |
| Runtime | `NODE_ENV`, `PORT` |
| Database | `MONGODB_URI` |
| Auth | `JWT_SECRET`, `GOOGLE_CLIENT_ID` |
| Email | `EMAIL_FROM`, `RESEND_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` |
| Integrations | `OPENAI_API_KEY`, `TMDB_API_KEY`, `WATCHMODE_API_KEY`, `WATCHMODE_REGION`, `CLOUDINARY_*`, `STREAM_*`, `GITHUB_*` |

## MongoDB Atlas Recovery

1. Confirm the MongoDB Atlas project and cluster are available.
2. Confirm database user exists.
3. Confirm network access allows the Railway service.
4. Restore `<MONGODB_URI>` to Railway.
5. Restart or redeploy the Railway backend.
6. Test backend endpoints that require database access.

Never store the connection string in documentation or source control.

## SSL Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Vercel SSL pending | DNS record missing or not propagated | Verify Cloudflare DNS and wait for propagation |
| Vercel says domain misconfigured | Wrong record target | Restore record from [DNS.md](./DNS.md) |
| Browser certificate mismatch | Hostname routed to wrong provider | Check Cloudflare record owner and proxy state |
| VPN SSL issues | VPN is not an app hostname | Do not proxy or repoint VPN record |

## DNS Troubleshooting

| Symptom | Check |
|---|---|
| `movietracker` does not load | Cloudflare A record, Vercel domain status |
| `portfolio` does not load | Cloudflare CNAME record, Vercel domain status |
| Backend calls fail | Vercel env vars and Railway service status |
| Socket.IO fails | `REACT_APP_SOCKET_URL`, Railway CORS, backend logs |
| Email fails | SPF, DKIM, DMARC, Resend/SMTP variables |

## Cloudflare Migration Checklist

1. Export old DNS zone before migration when possible.
2. Add domain to Cloudflare.
3. Recreate records from [DNS.md](./DNS.md).
4. Confirm no app record points to the VPN IP.
5. Update registrar nameservers to Cloudflare.
6. Wait for nameserver propagation.
7. Verify public DNS with `1.1.1.1` and another resolver.
8. Re-check Vercel custom domain status.
9. Test application flows.

## Domain Migration Checklist

1. Identify all active hostnames.
2. Identify owning provider for each hostname.
3. Confirm required DNS target with the owning provider.
4. Lower TTL ahead of migration if possible.
5. Recreate DNS records at the new DNS provider.
6. Verify email records before switching nameservers.
7. Switch nameservers.
8. Verify frontend, backend, VPN, and email.

## Production Deployment Checklist

1. Backend deploy succeeds on Railway.
2. Railway service is running.
3. Railway backend URL responds.
4. Socket.IO handshake succeeds.
5. Vercel frontend deploy succeeds.
6. Vercel custom domain is configured.
7. SSL certificate is issued.
8. Cloudflare DNS matches [DNS.md](./DNS.md).
9. Google OAuth works from the production hostname.
10. Email sending works.
11. Database reads and writes work.

## Verification Checklist

| Area | Verification |
|---|---|
| DNS | Public resolver returns expected records |
| Vercel portfolio | `portfolio.zadprogramming.com` loads |
| Vercel Movie Tracker | `movietrk.com` loads and the old hostname remains available |
| Canonical redirect | `www.movietrk.com` returns 308 to `movietrk.com` |
| Railway API | `<RAILWAY_BACKEND_URL>` health endpoint responds |
| Socket.IO | Polling or websocket handshake succeeds |
| MongoDB | Authenticated database-backed route works |
| OAuth | Google sign-in completes |
| Email | Test email sends and authenticates |
| VPN | `vpn.zadprogramming.com` resolves to the VPN server |

## Change Safety Rules

1. Read current provider state before changing anything.
2. Show exact planned DNS and environment changes before applying them.
3. Change one layer at a time.
4. Verify after each change.
5. Never paste secrets into tickets, docs, commits, or PR descriptions.
6. Do not merge infrastructure documentation or recovery changes without review.

## Domain Migration Rollback

1. Keep the old Vercel domain attachment and Cloudflare DNS unchanged throughout the observation window.
2. Before changing Railway, record the existing `APP_URL`, `CLIENT_URL`, and `CORS_ORIGINS` values in a secure location outside the repository.
3. If the new origin breaks API or realtime traffic, restore those three Railway values and redeploy the current known-good backend artifact.
4. If only the new frontend hostname fails, leave Railway unchanged and direct users to `https://movietracker.zadprogramming.com` while correcting Namecheap/Vercel DNS or certificates.
5. Do not redirect the old hostname until registration, local and Google login, API/CORS, Socket.IO, password reset, invitations, search/TMDB, chat, mobile/desktop, and logs have all passed on the apex.

