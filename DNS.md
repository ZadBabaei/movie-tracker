# Movie Tracker DNS

Last reviewed: 2026-08-21

Related documents:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [INFRASTRUCTURE_RECOVERY.md](./INFRASTRUCTURE_RECOVERY.md)

## DNS Authority

| Zone | Provider | Nameservers | Purpose |
|---|---|---|---|
| `movietrk.com` | Namecheap BasicDNS | `dns1.registrar-servers.com`, `dns2.registrar-servers.com` | Canonical Movie Tracker frontend |
| `zadprogramming.com` | Cloudflare | `chuck.ns.cloudflare.com`, `olga.ns.cloudflare.com` | Transition hostname and unrelated existing services |

Do not change either zone's nameservers for this migration.

## Required Namecheap Records

These values came from Vercel's structured domain verifier after both hostnames were attached to the existing `movie-tracker` project.

| Type | Host | Value | TTL | Purpose |
|---|---|---|---|---|
| A | `@` | `216.198.79.1` | Automatic | Vercel apex routing |
| A | `@` | `64.29.17.1` | Automatic | Vercel apex routing |
| CNAME | `www` | `f314c7ae274be061.vercel-dns-017.com` | Automatic | Vercel `www` routing before the platform 308 redirect |

Replace the Namecheap parking A record at `@` (previously resolving to `162.255.119.27`) and the `www` parking CNAME (previously `parkingpage.namecheap.com`). Remove any additional parking or URL Redirect Record that conflicts at exactly `@` or `www`. Do not remove unrelated MX or TXT records.

Vercel may also display `76.76.21.21` as a generic legacy fallback. Use the project-specific structured records above unless a fresh `vercel domains verify` result explicitly changes them.

## Vercel Domain Behavior

| Hostname | Behavior |
|---|---|
| `movietrk.com` | Canonical production frontend |
| `www.movietrk.com` | Vercel-managed 308 redirect to `https://movietrk.com` |
| `movietracker.zadprogramming.com` | Parallel transition hostname; do not redirect or remove yet |

## Verification Commands

```powershell
Resolve-DnsName movietrk.com -Type A -Server 1.1.1.1
Resolve-DnsName www.movietrk.com -Type CNAME -Server 1.1.1.1
Resolve-DnsName movietracker.zadprogramming.com -Type A -Server 1.1.1.1
curl.exe -I https://movietrk.com
curl.exe -I https://www.movietrk.com
curl.exe -I https://movietracker.zadprogramming.com
```

Expected results after propagation:

- The apex returns Vercel's recommended A values and serves a valid HTTPS certificate.
- `www` resolves through the Vercel CNAME and returns a 308 redirect to the same path on the apex.
- The old hostname continues serving the application without redirecting.

## Rollback

DNS rollback is normally unnecessary because the old hostname remains live. If the new hostname fails, direct users to `https://movietracker.zadprogramming.com` while correcting the new Namecheap records. Do not remove the new Vercel domains during diagnosis; doing so can interrupt certificate issuance and obscure the fault.

Only restore the prior Namecheap parking records if the migration is explicitly abandoned. Railway application rollback is separate: restore the previous `APP_URL`, `CLIENT_URL`, and `CORS_ORIGINS` values and redeploy.
