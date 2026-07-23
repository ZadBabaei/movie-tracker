# zadprogramming.com DNS

Last reviewed: 2026-07-06

Related documents:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [INFRASTRUCTURE_RECOVERY.md](./INFRASTRUCTURE_RECOVERY.md)

## DNS Authority

| Field | Value |
|---|---|
| Provider | Cloudflare |
| Zone | `zadprogramming.com` |
| Status | Active |
| Nameservers | `chuck.ns.cloudflare.com`, `olga.ns.cloudflare.com` |

Internal Cloudflare identifiers are intentionally omitted.

## Production DNS Records

| Type | Name | Value | Proxy | TTL | Owner | Purpose | Depends on it |
|---|---|---|---|---|---|---|---|
| A | `zadprogramming.com` | `76.76.21.21` | DNS-only | Auto | Vercel | Apex domain routing | Root website/domain verification |
| CNAME | `portfolio.zadprogramming.com` | `946d53ab91a7d200.vercel-dns-017.com` | DNS-only | Auto | Vercel | Portfolio frontend routing | `portfolio-app` |
| A | `movietracker.zadprogramming.com` | `76.76.21.21` | DNS-only | Auto | Vercel | Movie Tracker frontend routing | `movie-tracker` frontend |
| A | `vpn.zadprogramming.com` | `204.168.141.117` | DNS-only | Auto | Hetzner | VPN endpoint only | VPN clients |
| MX | `send.zadprogramming.com` | `feedback-smtp.us-east-1.amazonses.com` | DNS-only | Auto | Amazon SES | Mail feedback SMTP routing | Email delivery |
| TXT | `send.zadprogramming.com` | `v=spf1 include:amazonses.com ~all` | DNS-only | Auto | Amazon SES | SPF authorization | Email delivery |
| TXT | `resend._domainkey.zadprogramming.com` | `<RESEND_DKIM_PUBLIC_KEY>` | DNS-only | Auto | Resend | DKIM signing verification | Email delivery |
| TXT | `_dmarc.zadprogramming.com` | `v=DMARC1; p=none;` | DNS-only | Auto | Domain owner | DMARC policy | Email authentication |

## Why Each Record Exists

| Hostname | Why it exists |
|---|---|
| `zadprogramming.com` | Vercel apex routing and domain verification |
| `portfolio.zadprogramming.com` | Routes portfolio traffic to the Vercel portfolio project |
| `movietracker.zadprogramming.com` | Routes Movie Tracker frontend traffic to the Vercel frontend project |
| `vpn.zadprogramming.com` | Points only to the Hetzner VPN server |
| `send.zadprogramming.com` | Supports outbound email authentication/routing |
| `resend._domainkey.zadprogramming.com` | Allows Resend to DKIM-sign email |
| `_dmarc.zadprogramming.com` | Publishes domain email policy |

## Provider Ownership

| Provider | Owns / expects | Notes |
|---|---|---|
| Cloudflare | Authoritative DNS records | DNS changes happen here |
| Vercel | `zadprogramming.com`, `portfolio.zadprogramming.com`, `movietracker.zadprogramming.com` | Custom domains attached to Vercel projects |
| Railway | `<RAILWAY_BACKEND_URL>` | Backend uses Railway-generated public domain; no custom backend domain currently required |
| Hetzner | `vpn.zadprogramming.com` | VPN only |
| Resend / Amazon SES | DKIM, SPF, MX, DMARC records | Email authentication and delivery |

## Proxy Policy

| Record group | Proxy setting | Reason |
|---|---|---|
| Vercel app records | DNS-only | Matches current verified setup and avoids proxy-specific SSL/cache behavior |
| Railway backend | Not in Cloudflare DNS | Backend remains on Railway-generated URL |
| VPN | DNS-only | VPN traffic should not go through Cloudflare proxy |
| Email records | DNS-only | MX/TXT records are never proxied |

## Records That Must Not Be Reintroduced

Do not point these hostnames to the Hetzner VPN IP:

| Hostname | Reason |
|---|---|
| `zadprogramming.com` | Should route to Vercel, not VPN |
| `www.zadprogramming.com` | Should not route to VPN |
| `portfolio.zadprogramming.com` | Should route to Vercel portfolio |
| `movietracker.zadprogramming.com` | Should route to Vercel frontend |

## Verification Commands

Use read-only checks:

```powershell
Resolve-DnsName zadprogramming.com -Type A -Server 1.1.1.1
Resolve-DnsName portfolio.zadprogramming.com -Type CNAME -Server 1.1.1.1
Resolve-DnsName movietracker.zadprogramming.com -Type A -Server 1.1.1.1
Resolve-DnsName vpn.zadprogramming.com -Type A -Server 1.1.1.1
```

Expected public routing:

| Hostname | Expected result |
|---|---|
| `zadprogramming.com` | Vercel IP |
| `portfolio.zadprogramming.com` | Vercel CNAME target |
| `movietracker.zadprogramming.com` | Vercel IP |
| `vpn.zadprogramming.com` | Hetzner VPN IP |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Vercel domain is misconfigured | Missing or wrong Cloudflare record | Compare against the production records table |
| Portfolio shows DNS recommendation | Portfolio CNAME is not Vercel rank-1 target | Restore `portfolio.zadprogramming.com` CNAME |
| Movie Tracker frontend fails domain check | Missing or wrong A record | Restore `movietracker.zadprogramming.com` A record |
| VPN stops resolving | VPN A record changed or proxied | Restore DNS-only VPN A record |
| Email authentication fails | DKIM/SPF/DMARC record missing | Restore email DNS records |
| Backend inaccessible from frontend | Frontend env vars or Railway service issue | Check [DEPLOYMENT.md](./DEPLOYMENT.md), not frontend DNS |

## DNS Recovery Rules

1. Restore DNS from the production records table.
2. Keep `vpn.zadprogramming.com` DNS-only.
3. Do not point web app records to the VPN IP.
4. Do not add Railway custom DNS unless a dedicated API subdomain is intentionally created.
5. Verify provider requirements immediately before editing DNS.
6. Re-check Vercel custom domain status after DNS changes.

