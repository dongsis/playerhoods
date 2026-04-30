# Delegate Model — Final (Post-Simplification)

**Status:** Historical reference only. Superseded on 2026-04-10 by Contact Player + Match Proxy canonical spec v1.2.  
**Superseded by:** `Contact_Player_and_Match_Proxy_Canonical_v1_2.md`, `Match_Participant_Lifecycle_Canonical.md`

This file describes the retired ad-hoc delegate-confirm model and should not be used as current product guidance.

---

## 1. Single Public Entry Point

| RPC | Signature | Purpose |
|-----|-----------|---------|
| **rpc_match_delegate_confirm_participant** | `(p_match_participant_id uuid)` | Delegate-confirm a **pending** participant (user or guest). Sets `participant_accepted_at` only; never touches `org_approved_at`. |

**Dropped RPCs:**
- `rpc_match_delegate_confirm_guest` — merged into `rpc_match_delegate_confirm_participant`
- `rpc_match_delegate_confirm_user` — removed (re-entry/fresh path no longer supported; use `rpc_match_nominate_user` for re-entry)
- `rpc_match_delegate_manual_confirm_targets` — removed (no "add user and delegate-confirm" flow)

---

## 2. Caller Gates (Who Can Delegate-Confirm)

| Participant type | Caller gate | Target gate |
|------------------|-------------|-------------|
| **User** (invited/nominated/requested) | **Organizer** OR (non-organizer + InScope OR MatchAssociated) | Non-org only: ShareGroup(caller, participant) |
| **Guest** | Any active participant (incl. organizer) | — |

- **User, organizer:** Organizer **is allowed** to call `rpc_match_delegate_confirm_participant` for existing user participants. This enables replacing `rpc_match_manual_confirm` with composed `delegate_confirm` + `org_approve`.
- **User, non-organizer:** InScope OR MatchAssociated, ShareGroup(caller, participant).
- **Guest:** Organizer can delegate-confirm a guest (same as any participant).

---

## 3. Effect

- Sets `participant_accepted_at = now()`, `participant_accepted_via = 'delegate_manual'`, `manual_confirmed_by = actor`.
- Reconciles status via `match_participant_reconcile_status`.
- Inserts `match_participant_actions` row with `action_type = 'delegate_manual_confirm'`.
- **Guest branch only:** Emits `match.guest_delegate_confirmed` domain event when guest has email (for notifications).

---

## 4. Confirmation Invariant

**confirmed ⇔ participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL**

Delegate-confirm sets only the participant side. Org must still Approve (`rpc_match_org_approve_participant`) for the participant to become confirmed.

---

## 5. Frontend / API

- **API:** `delegateConfirmParticipant(supabase, matchParticipantId)` — single function.
- **UI:** ParticipantGroups shows "Confirm can come" for both pending users (when `canDelegateConfirmUserParticipants`) and pending guests (when `viewerIsParticipant`).

---

## 6. Re-entry

Re-entry of removed participants is **not** done by delegate-confirm. Use:
- `rpc_match_request_join` (user in scope)
- `rpc_match_invite_user` (organizer)
- `rpc_match_nominate_user` (non-org, ShareGroup)

---

## 7. Related Docs

- **Flows & scope:** `Match_Participation_Flows_and_Scope.md`
- **Permissions:** `PERMISSION_ARCHITECTURE_v1.md`
- **Phase 4 plan (archived):** `Phase4_Delegate_Confirm_Cleanup_Plan.md`
