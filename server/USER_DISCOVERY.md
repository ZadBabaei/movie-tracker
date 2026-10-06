# Authenticated username discovery

`GET /api/users/search?q=za` requires the existing valid authenticated session.
The legacy `/api/user/search` is a compatibility alias using the identical handler
and rate-limit counter. It no longer supports name or email lookup or returns IDs.

Query rules:

- Exactly one string `q` is required; missing, array, and object inputs return 400.
- Trim surrounding whitespace and lowercase; length must be 2–30 characters.
- Only ASCII letters, digits, underscores, and periods are accepted. No @ or email queries.
- Prefix-only matching: `za` matches `zad`, `zad.movie`, and `zaddy`; `ad` does not match `zad`.
- Periods and underscores are literal. A query may be an incomplete username prefix.
- Results sort ascending by normalized username with binary collation, capped at 20.
- Only `discoverable: true` accounts with a string username can appear.
- The authenticated user's own account is excluded. Sharing permission is irrelevant here.
- A hidden account and a nonexistent account both produce the same empty-list response.

Each result contains `username`, `displayName` (from User.name), and optionally
a nonempty `avatar`. Both the database projection and response mapping restrict
fields. IDs, email, credentials, session/reset fields, sharing flags, memberships,
integration metadata, and private profile fields are excluded.

The search limiter reuses express-rate-limit: 60 requests per minute per
authenticated account, including invalid queries and empty results. Authentication
runs first. Exhaustion returns 429 with a safe message and standard rate-limit /
Retry-After headers. The existing broad API limiter also applies in the app.
Like existing limiters, counters are in process memory; multiple server replicas
have independent counters. No additional store or dependency was introduced.

The existing `unique_profile_username` partial index is sufficient. The query
includes its `username: { $type: "string" }` predicate and uses bounded string
comparison `[prefix, next-prefix)` with simple binary collation. This supports an
ordered index scan without a regex, substring scan, or new index. MongoDB filters
discoverability within that candidate range; many hidden matches may require
scanning more candidates. Tests inspect the actual winning query plan.
No migrations, index changes, or production database operations are required.
The query has a two-second database execution limit; database failures return a
generic 500 without internal details. No public profile or history access is added.

## Legacy search privacy audit

Previously any authenticated user could call `/api/user/search` with no group
context. It returned up to 20 accounts by partial name or exact email, including
non-discoverable accounts, with `_id`, `name`, and `avatar` (no email in results).
It was effectively general search, not an authorized invitation-only lookup.
The client `searchUsers` helper is unused; the current invitation modal uses links.
Both general-search paths now enforce the same opt-in and exclude the caller.

Exact known-email invitations remain available through the unchanged authenticated
`POST /api/groups/invite-by-email` endpoint. It validates email/group ID and checks
that the caller is a group member before looking up the exact normalized address.
The existing invitation limiter applies. It creates an invitation, not a search
result, and never returns the recipient's email or ID. Hidden users can receive
these invitations; discoverability is not consent to join, and membership still
requires acceptance. The response method can distinguish an existing account
from an emailed invitation, but only within this authorized group action.
