# Phase 5 — E2E Checklist (Post-Cleanup)

Run this checklist after Phase 5 to verify main flows still work.

## Prerequisites

- Local Supabase running (`supabase start` or `supabase db reset`)
- At least 2 test users (A, B) in different groups
- At least 1 friend group shared between A and B
- User A has a Contact Player in roster (or create one in Contacts tab)

---

## 1. Match creation

- [ ] Create match as organizer (user A)
- [ ] Set scope groups, enable "Add Contact Players"
- [ ] Add Contact Players at creation (create new + nominate)
- [ ] Post-create: invite users from scope
- [ ] Navigate to match detail

## 2. Match detail — Organizer flows

- [ ] **Invite User**: Select from dropdown, invite, user appears pending
- [ ] **Nominate Contact Player (from roster)**: Select Contact Player, nominate, appears pending
- [ ] **Create new Contact Player**: Fill form, create & nominate, appears pending
- [ ] **Delegate confirm guest**: Click "Confirm can come" on pending Contact Player → pending (org approval still needed)
- [ ] **Approve**: Approve pending participant → confirmed
- [ ] **Remove**: Remove a participant
- [ ] **Invite back**: Re-invite removed user (if applicable)

## 3. Match detail — Non-organizer flows (user B)

- [ ] **Nominate User**: Nominate user from shared groups (ParticipantGroups / admission targets)
- [ ] **Nominate Contact Player**: From roster or create new (when canNominateGuest)
- [ ] **Delegate confirm participant**: Confirm pending user or guest can come (single "Confirm can come" button)
- [ ] **Accept**: Self-accept own invite/nomination

## 4. Contacts tab

- [ ] Add Contact Player (create + add to roster)
- [ ] Contact Player list shows contact_only and linked_user correctly
- [ ] Invite Contact Player to group (when linked)

## 5. Terminology

- [ ] "Add Contact Player" link in MatchCard (not "Add Guest")
- [ ] "Contact Player" in participant list for guest participants
- [ ] "Nominate Contact Player" section headers
- [ ] "Create new Contact Player" subheaders
- [ ] "Select a Contact Player" in dropdown

---

## Known removals (Phase 5)

- `rpc_match_add_guest_org`, `rpc_match_add_guest_participant`, `rpc_match_invite_guest_from_roster` — **dropped**
- `getInviteTargets`, `getNominateTargets` — **removed** (use `getAdmissionTargets` + `admissionTargetsToScopeUsers` / `admissionTargetsToContactPlayers`)
- `getAdmissionTargets`, `admitUserToMatch` from play-network — **removed** (use matches.ts)
- `getRosterGuestContactLinks` — **removed** (use `getContactPlayerResolution`)
