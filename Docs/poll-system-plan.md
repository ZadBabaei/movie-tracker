

# Phase Plan for Poll System (Movie Tracker)

## Phase 1 — Right Sidebar Poll Section (Group Page)

### UI Layout

Replace the current **Watched Movies section** with a **Polls section**.

Structure:

RightSidebar  
 ├── CreatePollButton  
 └── PollHistoryContainer  
       └── PollCard (multiple)

### Create Poll Button

Top button.

Text options (best UX choice):

**“Create Poll”**

Reason: short, common wording in voting interfaces.

---

### Poll History Container

Shows polls from the **last 2 months only**.

Scrollable container.

Each poll is a **card**.

---

### Poll Card Structure

Each card contains:

PollCard  
 ├── PollTitle  
 ├── PollDate  
 ├── PollResult  
 └── ThreeDotMenu  
        └── Delete Poll

Design rules:

- overflow hidden
    
- rounded corners
    
- subtle hover elevation
    
- clicking card → **Poll Result Page**
    

Example layout:

--------------------------------  
| Friday Movie Night Poll     |  
| Mar 12, 2026                |  
| Winner: Inception           |  
|                           ⋮ |  
--------------------------------

---

### Three Dot Menu

Contains:

Delete Poll

Only visible to **poll creator**.

---

# Phase 2 — Create Poll Modal (Small Fix)

You already built this modal. Only changes:

### Remove

❌ Close button at bottom

Keep only:

✔ top-right **X button**

---

### Button Color Fix

Change:

Publish → Green

Example:

Publish  → #22c55e  
Cancel   → neutral

---

# Phase 3 — Movie Selection Flow

User selects movies (already implemented).

Rules:

Maximum movies per poll = 6

Then user goes to **Voting Page**.

---

# Phase 4 — Voting Page

### Layout

VotingPage  
 ├── PollTitle  
 ├── MoviePosterGrid  
 └── ActionButtons

---

### Poster Grid

Grid layout:

3 columns desktop  
2 tablet  
1 mobile

Each poster card:

MoviePosterCard  
 ├── PosterImage  
 ├── VoteIndicator  
 └── Title

---

### Voting Interaction

User votes by **clicking posters**.

Maximum selections:

3 movies

---

### Vote Indicator (Modern UI)

Options (best one):

✔ **Checkmark badge in top corner**

Example:

✔ top-right badge  
green glow border  
slight scale animation

or

poster dark overlay + checkmark

---

# Phase 5 — Voting Actions

Buttons below posters:

Submit Vote  
Cancel Poll

---

### Permissions

Cancel Poll:

Only poll creator

Therefore store:

poll.createdByUserId

---

# Phase 6 — Real-time Vote Tracking

Use real-time updates.

Options:

- WebSocket
    
- Stream
    
- polling fallback
    

---

### Live Winner Indicator

Each poster shows a **badge with vote count**.

Example:

⭐ Leading

or

🔥 4 votes

Better modern UI:

Leading movie → golden glow border

---

# Phase 7 — Poll Result Modal

When **all users submit votes**.

Open modal automatically.

Modal layout:

WinnerModal  
 ├── WinnerPoster  
 ├── MovieTitle  
 ├── VoteCount  
 └── CloseButton

Example:

🎉 Tonight's Movie  
  
[ Inception Poster ]  
  
6 votes

---

# Phase 8 — Tie Handling

If multiple movies have same highest votes.

Example:

Movie A → 4 votes  
Movie B → 4 votes

Then:

### Run Tie Breaker Round

New voting screen:

Only tied movies displayed.

Rules:

Each user can vote only ONE movie

---

### Second Tie Case

If still tied.

Winner chosen:

Random selection

Example logic:

winner = tiedMovies[Math.floor(Math.random() * tiedMovies.length)]

---

# Implementation Phases

Implement in this order.

Phase 1  
Poll sidebar UI  
  
Phase 2  
Poll history card  
  
Phase 3  
Create poll modal fix  
  
Phase 4  
Voting page UI  
  
Phase 5  
Voting logic  
  
Phase 6  
Real-time vote updates  
  
Phase 7  
Winner modal  
  
Phase 8  
Tie breaker logic

---

# File Structure Recommendation

/components/polls  
  
CreatePollButton.js  
PollHistoryList.js  
PollCard.js  
PollMenu.js  
CreatePollModal.js  
VotingPage.js  
MoviePosterCard.js  
VoteIndicator.js  
WinnerModal.js  
TieBreakerVote.js