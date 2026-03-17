# Voting System Overhaul

## Context
The current polling system uses rank-based voting (1-4 Borda count), has no poll names, no poll history display, no way to delete old polls, and no tie-breaking mechanism. Users need a simpler multi-select voting system with named polls, a history of past polls, the ability to delete polls, and automatic runoff rounds when votes tie.

## Critical Files
- `server/models/Poll.ts` — Schema changes
- `server/routes/pollRoutes.ts` — API endpoint changes
- `server/routes/groupRoutes.ts` — Remove duplicate poll endpoints
- `client/src/store/usePollStore.ts` — State management
- `client/src/component/VoteModal.tsx` — UI overhaul
- `client/src/component/VoteModal.css` — New styles

---

## Step 1: Update Poll Model
**File:** `server/models/Poll.ts`

- Add `name: { type: String, required: true }` field
- Add `round: { type: Number, default: 1 }` field for tracking runoff rounds
- Remove `rank` from votes subdocument (votes become simple selections: `{ userId, movieTmdbId }`)
- Remove `selected` field from movies subdocument
- Remove TTL index on `createdAt` (polls should persist for history)
- Update `IPoll` and `IPollVote` interfaces accordingly

**Note:** After deploying, manually drop the old TTL index: `db.polls.dropIndex("createdAt_1")`

---

## Step 2: Update Poll Routes
**File:** `server/routes/pollRoutes.ts`

### 2a. Modify `POST /create`
- Accept `name` from request body, validate non-empty
- Pass `name` to Poll constructor
- After saving, update Group: set `group.currentPoll = poll._id`, push to `group.pollHistory`

### 2b. Modify `POST /vote`
- Change body from `{ pollId, movieId, rank }` to `{ pollId, movieIds }` (array of TMDB IDs)
- Replace all existing votes for this user, then push one `{ userId, movieTmdbId }` per selected movie
- Each vote entry = 1 point (no ranks)

### 2c. Modify `POST /:pollId/complete`
- Replace Borda count with simple count: score = number of vote entries per movie
- **Tie-breaking:** If 2+ movies share the max score:
  - Keep `poll.status = "active"`, set `poll.movies` to only tied movies
  - Clear `poll.votes`, increment `poll.round`
  - Emit `poll:runoff` socket event
  - Return `{ runoff: true, poll }`
- If single winner: complete normally, clear `group.currentPoll`

### 2d. Modify `GET /:pollId/results`
- Use count-based scoring instead of Borda count

### 2e. Add `GET /group/:groupId/history` (NEW)
- Query `Poll.find({ groupId, status: { $in: ["completed", "cancelled"] } })` sorted by `createdAt` desc
- Populate creator name, return: `_id, name, round, status, winningMovieTmdbId, winner title/poster, createdAt`

### 2f. Add `DELETE /:pollId` (NEW)
- Auth: only poll creator or group admin can delete
- If active poll, clear `group.currentPoll`
- Pull from `group.pollHistory`, then delete the poll document

---

## Step 3: Clean Up Group Routes
**File:** `server/routes/groupRoutes.ts`

- Remove `POST /:id/create-poll` (duplicate of polls/create)
- Remove `POST /:id/complete-poll` (duplicate of polls/:pollId/complete)
- All poll logic now goes through `/api/polls/*`

---

## Step 4: Update Zustand Poll Store
**File:** `client/src/store/usePollStore.ts`

- Add to `Poll` interface: `name: string`, `round: number`
- Add state: `pollHistory: Poll[]`, `pollName: string`, `selectedVoteIds: string[]`
- Add actions:
  - `setPollName(name)` — setter for poll name input
  - `fetchPollHistory(groupId)` — GET poll history
  - `deletePoll(pollId)` — DELETE poll, remove from local state
  - `submitVote(pollId, movieIds)` — POST multi-select vote
  - `toggleVoteSelection(movieId)` — toggle movie in `selectedVoteIds`
- Modify `createPoll` to include `pollName` in request
- Modify `completePoll` to handle `{ runoff: true }` response

---

## Step 5: Overhaul VoteModal.tsx
**File:** `client/src/component/VoteModal.tsx`

### 5a. Create View (no active poll)
1. **Poll name input** at the top (required before publishing)
2. **SearchBar** for adding movies (existing component)
3. **Selected movies preview** — chips/mini-cards showing added movies with poster thumbnail, title, and X to remove
4. **Selected count** — "Selected Movies: X/6"
5. **3 buttons:** Publish (create poll), Close (close modal), Cancel (reset form)
6. **Poll History section** below — list of past polls with:
   - Poll name (bold), winner title, 3-dot menu (⋯)
   - Dropdown on 3-dot click with "Delete" option

### 5b. Active Poll View
- Show poll name as title (+ "Round X" if round > 1)
- **Runoff banner** if round > 1: "Tie detected! Vote again among remaining movies"
- Replace rank buttons with **click-to-select on movie cards**
- Selected movie visual: dark overlay + checkmark icon on poster
- "Submit Votes" button for all users (calls `submitVote`)
- "Complete Poll" + "Cancel Poll" for creator only

### 5c. Results View
- Keep existing trophy/bar layout
- Show poll name in banner
- Change "pts" to "votes" (count-based)

### 5d. Socket Events
- Add `poll:runoff` listener — update currentPoll, show runoff message, clear selections

---

## Step 6: Update VoteModal.css
**File:** `client/src/component/VoteModal.css`

New classes needed:
- `.VoteModal-poll-name-input` — dark themed text input
- `.VoteModal-selected-chips` — flex wrap container for movie chips
- `.VoteModal-chip` — small pill with thumbnail + title + X button
- `.VoteModal-movie-selected` — highlight border/shadow on selected movie card
- `.VoteModal-selected-overlay` — dark overlay with centered checkmark
- `.VoteModal-runoff-banner` — amber/yellow alert banner
- `.VoteModal-history-section` — bordered section for poll history
- `.VoteModal-history-item` — flex row for each past poll
- `.VoteModal-history-menu-btn` — 3-dot button styling
- `.VoteModal-history-dropdown` — positioned dropdown with delete option

---

## Implementation Order
1. Step 1 (Poll model) -> Step 2 (Poll routes) -> Step 3 (Group routes cleanup)
2. Step 4 (Store) -> Step 5 (VoteModal.tsx) + Step 6 (VoteModal.css) in parallel

## Verification
1. Create a new poll — verify name input is required, movies show as chips during creation
2. Publish poll — verify it appears as active with multi-select voting
3. Vote — verify click-to-select with checkmark overlay, submit multiple selections
4. Complete poll with clear winner — verify results show with vote counts
5. Complete poll with tie — verify runoff round starts automatically with only tied movies
6. Vote in runoff — verify winner is determined
7. Check poll history — verify completed polls appear with name and winner
8. Delete a poll from history — verify 3-dot menu works and poll is removed
9. Verify socket real-time updates work for voting and runoff events
