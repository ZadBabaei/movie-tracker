# Profile settings

Authenticated `GET /api/profile` and `PUT /api/profile` return the owner's
`username` (string or null), `discoverable`, and `shareWatchHistory`.
PUT accepts any subset of these settings alongside the existing name/email fields.
Omitted settings are preserved. Both privacy flags require JSON booleans.
They are independent opt-ins; sharing does not enable discoverability.
These settings do not enable any public history or discovery endpoint yet.
Owner account responses retain the owner's email; user search does not return email.
The new fields have `select: false` and are explicitly selected only by the owner
profile GET/PUT, so unrelated account responses do not gain these fields.

## Username rules

- Trim surrounding whitespace and store lowercase ASCII.
- 3–30 characters after normalization.
- Letters a–z, digits 0–9, underscores, and single periods between non-period characters.
- No leading/trailing periods or consecutive periods.
- Reject all @ characters, including a leading @ and email addresses.
- Reject reserved names: admin, administrator, api, auth, login, logout, signup,
  history, profile, settings, users, user, support, help, root, system, null,
  undefined, me, www, moderator.
- Null, empty string, and whitespace-only strings remove the username by storing null.
- No usernameNormalized companion is needed because username itself is normalized.
- Validation returns HTTP 400 with a client-safe message; taken names return 409.

## Index rollout

The `unique_profile_username` index uses `{ username: 1 }`, `unique: true`,
and `partialFilterExpression: { username: { $type: "string" } }`.
Legacy missing values and null values are excluded. No data migration or backfill
is required for existing accounts; both privacy settings default to false.
Mongoose hydration and owner response fallbacks also cover legacy missing flags.

The repository previously had no username field. Production data was not queried
or modified during implementation. Before deployment, inspect any manually added
username values and existing index definitions if the production collection has
diverged from this schema. Non-normalized strings must be reviewed and normalized
before enabling writes; duplicate normalized names need an explicit resolution.
For a read-only preflight in mongosh:

```javascript
db.users.getIndexes();
db.users.aggregate([
  { $match: { username: { $type: "string" } } },
  { $project: { username: 1, normalized: { $toLower: { $trim: { input: "$username" } } } } },
  { $group: { _id: "$normalized", count: { $sum: 1 }, ids: { $push: "$_id" }, values: { $push: "$username" } } }
]);
```

Username writes await successful additive index creation, even if autoIndex is
disabled. Index-build conflicts return a safe HTTP 503 and leave data unchanged;
other profile updates continue to work. The application never calls syncIndexes,
drops indexes, or repairs existing usernames automatically. MongoDB's unique index
enforces concurrent writes; duplicate-key errors map to 409 without leaking data.
