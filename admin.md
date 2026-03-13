# Admin Feature for Group Pages

## Context
Groups currently have a `creator` field in the database but no admin privileges are enforced. Any member can do anything. This feature:
1. Displays an "Admin" badge on the group creator in the member list
2. Gives the admin (creator) the ability to remove members from the group
3. Keeps the existing "leave group" ability for regular members

## Changes Made

### Backend (`server/routes/groupRoutes.ts`)
- **New endpoint:** `DELETE /api/groups/:id/remove-member/:memberId`
  - Verifies requesting user is the group's `creator` (admin)
  - Prevents admin from removing themselves
  - Validates target is a member before removing
- **Updated** `GET /api/groups/mine` to populate `creator` field with `_id` and `name`

### Frontend (`client/src/pages/GroupPage.tsx`)
- Added `creator` field to `GroupData` interface
- Decode JWT to get current user ID for admin detection
- Show gold "Admin" badge on the creator's member card
- Show a red remove button (X icon) on non-admin member cards — visible only to the admin on hover
- `handleRemoveMember()` calls the new endpoint and updates local state

### Styling (`client/src/pages/GroupPage.css`)
- Added `position: relative` to `.member-card-glow` for absolute positioning of remove button
- New `.member-remove-btn` — circular red X button, hidden by default, appears on hover
- Uses existing `.badge` class for the gold "Admin" badge

## How It Works
- The group creator is automatically the admin (uses existing `creator` field in the Group model)
- Admin badge is shown by comparing each `member._id` with `group.creator._id`
- Remove button only renders when the current user is the admin and the target is not the admin
- Confirmation dialog prevents accidental removals
