Issue addressed: auth page viewport spacing on sign-in/sign-up.

What I found:
- Direct GitHub issue search was not accessible for `zadbabaei/movie-traker` from the available GitHub tool.
- The repo already contains a local bug backlog in `Docs/Bug reports.md`.
- The clearest still-actionable UI issue there was uneven whitespace on the sign-in/sign-up pages.

What I changed:
- `client/src/pages/AuthPage.js`
  - Added an effect that applies an `auth-route` class to `document.body` while the auth screen is mounted.
- `client/src/pages/AuthPage.css`
  - Scoped auth pages to their own full-height viewport with `100dvh`.
  - Removed inherited mobile `body` bottom padding while on auth routes.
  - Rebalanced vertical padding so top and bottom spacing stay symmetric across viewport sizes.

Validation:
- `server`: `npm.cmd run build`
- `client`: `npm.cmd run build`
- `client`: `npm.cmd test -- --watchAll=false --passWithNoTests`

Notes:
- The client build still reports pre-existing ESLint warnings unrelated to this fix.
- Browser verification against `http://localhost:3000` was blocked by the browser security policy in this environment, so validation here is compile-based rather than visual.

Next step:
- Review this change.
- If you want me to publish it, add a final line exactly as:
  `commit and push`
