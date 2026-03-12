# Phase 2 — Contact Player Resolution Layer

## Goal

Stop scattering "guest vs linked user" logic across UI/API surfaces. Introduce one clear resolution layer that can later feed mixed targets into `rpc_match_admission_targets`.

---

## What Changed

### A. New resolution layer

- **`rpc_contact_player_resolution()`** — RPC returning caller's roster guests with:
  - `guest_id`, `display_name`, `email`, `phone`, `notes`
  - `linked_user_id` (nullable) — user_id when guest has registered (identity_links contact)
  - `resolution_state` — `'contact_only'` | `'linked_user'`

### B. API

- **`getContactPlayerResolution(supabase)`** — calls `rpc_contact_player_resolution`, returns `ContactPlayerResolved[]`
- **`getRosterGuestContactLinks`** — deprecated; use `getContactPlayerResolution` instead

### C. UI surfaces updated

| Surface | Before | After |
|---------|--------|-------|
| **ContactsPanel** | `listRosterGuests` + `getRosterGuestContactLinks` (2 calls) | `getContactPlayerResolution` (1 call) |
| **InviteGuestForm** | `listRosterGuests` + `getRosterGuestContactLinks`, then filter | `getContactPlayerResolution`, filter by `resolution_state === 'contact_only'` |

### D. AddGuestForm

- No change — creates new guest, no resolution needed

---

## Files Modified

- `supabase/migrations/20260315000000_phase2_contact_player_resolution.sql` — **new**
- `src/lib/api/roster.ts` — add `getContactPlayerResolution`, deprecate `getRosterGuestContactLinks`
- `src/lib/types/database.ts` — add `rpc_contact_player_resolution` type
- `src/app/dashboard/ContactsPanel.tsx` — use resolution layer
- `src/app/matches/[matchId]/InviteGuestForm.tsx` — use resolution layer

---

## Behavior Preserved

- ContactsPanel: shows "已加入 playerhoods.com" and "Invite to Group" for linked guests
- InviteGuestForm: only shows contact_only guests (excludes linked_user)
- AddGuestForm: unchanged

---

## Follow-up

- Phase 3 (participant acceptance helper) — independent
- Later: feed `rpc_match_admission_targets` with mixed targets (users + Contact Players) using this resolution layer
