# Organizer Match Operations

**Status:** Current spec summary  
**Scope:** Organizer-only and organizer-led operations for active matches  
**Last updated:** 2026-04-01

This document reflects the current active model. It does not preserve removed RPC names except where needed for explicit deprecation notes.

---

## 1. Overview

The organizer is the user where:

- `matches.organizer_id = user_id`

The organizer owns three main areas:

- match creation and editing
- participant-side operations that require organizer approval
- organizer-only removal and admin actions

---

## 2. Match Creation and Editing

### Create

- RPC: `rpc_match_create`
- Entry points:
  - `/matches/new`
  - dashboard inline create flow

Current create behavior:

- creates the match
- auto-adds organizer as a confirmed participant
- uses `can_participants_invite_users = true` as the current default behavior

### Edit

Organizer-controlled edit surfaces currently include:

- date
- start time
- duration
- scope groups
- courts

Relevant app-side actions:

- `updateMatchDetails(...)`
- `setMatchCourts(...)`

Important side effect:

- changing date, time, duration, club, or courts triggers `fn_match_detail_change_reconfirm`
- confirmed non-organizer participants are reset to pending
- organizer approval is preserved
- participant-side confirmation is cleared

---

## 3. Participant Operations

### Invite a user

- RPC: `rpc_match_invite_user`
- Current role: organizer-only thin wrapper around `rpc_match_admit_user`

Result:

- target enters as `join_method = invited`
- `org_approved_at` is set immediately
- participant still must self-accept or be confirmed by an explicit Match Proxy

### Direct-invite a Contact Player

- RPC: `rpc_match_nominate_guest`

Current behavior:

- organizer may direct-invite a Contact Player from roster, saved trust paths, or group-contact trust paths
- organizer path auto-writes organizer approval
- participant-side confirmation still remains pending until the Contact Player self-accepts or an explicit Match Proxy acts
- if the Contact Player has email, the current flow creates an anchored email invitation

### Approve a participant

- RPC: `rpc_match_org_approve_participant`

Current behavior:

- organizer-side approval only
- works for both user and guest participants
- if participant-side confirmation already exists, reconcile moves the row to confirmed

### Manual confirm

The old organizer convenience model is retired.

Current rule:

- organizers do not get participant-side confirmation power for another person just from organizer status
- participant-side confirmation for another person now requires an explicit Match Proxy binding
- legacy app-side manual-confirm helpers should fail loudly and should not be used for new flows

### Remove participant

- RPC: `rpc_match_remove_participant`

Current canonical product interpretation:

- organizer can remove any active participant row
- participant-side remove exceptions may exist in specific UI/server-action guards, but the database RPC is still broader than those UI rules

### Invite back removed user

There is no dedicated re-entry RPC.

Current organizer re-entry path for removed users:

- `rpc_match_invite_user`

Current non-organizer re-entry path for removed users:

- `rpc_match_nominate_user`

---

## 4. Discovery and Target Lists

The canonical target discovery RPC is:

- `rpc_match_admission_targets`

It replaces legacy target RPCs and now serves as the single read model for:

- organizer invite targets
- participant nominate targets
- Contact Player direct-invite targets
- re-entry candidates

Legacy target RPC names are removed and should not be used:

- `rpc_match_invite_targets`
- `rpc_match_nominate_targets`

---

## 5. Organizer vs Non-Organizer Boundary

Organizer-only match operations:

- `rpc_match_create`
- `rpc_match_invite_user`
- `rpc_match_org_approve_participant`
- organizer-side match editing
- organizer-side removal

Organizer-led but still participant-aware flows:

- `rpc_match_proxy_confirm_participant`
  - compatibility name only
  - current authority comes from explicit Match Proxy binding, not organizer status

Non-organizer match operations remain separate:

- `rpc_match_request_join`
- `rpc_match_nominate_user`
- `rpc_match_accept_invite`
- `rpc_match_user_withdraw`

---

## 6. Explicitly Deprecated or Removed Names

These names are no longer current organizer operations:

- `rpc_match_manual_confirm`
- `rpc_match_manual_confirm_user`
- `rpc_match_add_guest_org`
- `rpc_match_add_guest_participant`
- `rpc_match_invite_guest_from_roster`
- `rpc_match_invite_targets`
- `rpc_match_nominate_targets`

Use the current admission, confirmation, and approval families instead.

---

## 7. Related Current References

- `docs/01_authority/Match_Participant_Lifecycle_Canonical.md`
- `docs/03_specs/Match_Participation_Flows_and_Scope.md`
- `docs/02_facts/FACTS_functions.md`
