# Phase 4 — Delegate / Participant Confirmation Family Cleanup

**Status: Implemented (2026-03-21).** Delegate simplify unified into single `rpc_match_delegate_confirm_participant` (user + guest). Dropped: `rpc_match_delegate_confirm_guest`, `rpc_match_delegate_confirm_user`, `rpc_match_delegate_manual_confirm_targets`, Phase4B helpers. See [DELEGATE_MODEL_FINAL](../01_authority/DELEGATE_MODEL_FINAL.md).

---

## Phase 4A Plan (implemented)

### Public RPCs that will remain (unchanged names)

| RPC | Purpose | Caller |
|-----|---------|--------|
| `rpc_match_accept_invite(p_match_id)` | Self confirm | Participant (own row) |
| `rpc_match_delegate_confirm_participant(p_match_participant_id)` | Delegate confirm existing user participant | Non-org, InScope or MatchAssociated, ShareGroup |
| `rpc_match_delegate_confirm_guest(p_match_participant_id)` | Delegate confirm existing guest participant | Any active participant (incl. organizer) |

### Internal helper to introduce

**`apply_participant_acceptance(p_mp_id uuid, p_actor_id uuid, p_is_self boolean, p_action_type text) RETURNS void`**

- **p_mp_id**: match_participant row id
- **p_actor_id**: auth.uid() of caller (for delegate) or participant (for self)
- **p_is_self**: true = self confirm, false = delegate confirm
- **p_action_type**: action log value (`'accept'` for self, `'delegate_manual_confirm'` for delegate)

**Centralizes:**
1. `UPDATE match_participants SET participant_accepted_at = now(), participant_accepted_via = <in_app|delegate_manual>, manual_confirmed_by = <NULL|actor> WHERE id = p_mp_id`
2. `PERFORM match_participant_reconcile_status(p_mp_id)`
3. `INSERT INTO match_participant_actions (match_id, match_participant_id, action_type, note, created_by) VALUES (...)`

**Parameterization:**
- Self: `participant_accepted_via = 'in_app'`, `manual_confirmed_by = NULL`, `action_type = 'accept'`
- Delegate: `participant_accepted_via = 'delegate_manual'`, `manual_confirmed_by = p_actor_id`, `action_type = 'delegate_manual_confirm'`

### Duplicated logic to remove

| Location | Current duplicated block | Replaced by |
|----------|-------------------------|-------------|
| `rpc_match_accept_invite` | UPDATE + reconcile + INSERT action | `apply_participant_acceptance(..., true, 'accept')` |
| `rpc_match_delegate_confirm_participant` | UPDATE + reconcile + INSERT action | `apply_participant_acceptance(..., false, 'delegate_manual_confirm')` |
| `rpc_match_delegate_confirm_guest` | UPDATE + reconcile + INSERT action | `apply_participant_acceptance(..., false, 'delegate_manual_confirm')` + guest event emission (kept in RPC) |

### Preserved

- Each public RPC keeps its own permission gates (caller checks)
- Guest-specific event emission (`match.guest_delegate_confirmed`) stays in `rpc_match_delegate_confirm_guest` after the helper call
- Idempotent early-return logic (participant_accepted_at IS NOT NULL) stays in each RPC
- All external RPC names unchanged

---

## Phase 4B Plan (to implement after 4A)

### Internal helpers to introduce

1. **`can_delegate_confirm_user_target(p_match_id uuid, p_actor_id uuid, p_target_user_id uuid) RETURNS boolean`**
   - Non-organizer
   - (InScope OR MatchAssociated)
   - ShareGroup with target
   - p_target_user_id <> p_actor_id (no self)

2. **`get_delegate_user_target_state(p_match_id uuid, p_target_user_id uuid) RETURNS text`**
   - Returns: `'active_present'`, `'removed_present'`, `'absent'`

3. **`apply_delegate_confirm_user_target(p_match_id uuid, p_actor_id uuid, p_target_user_id uuid) RETURNS match_participants`**
   - Uses target-state classifier
   - `active_present` → reject
   - `removed_present` → re-entry path (UPDATE existing removed row)
   - `absent` → fresh path (INSERT new row)

### Public RPCs to update

- `rpc_match_delegate_confirm_user` → gate + classifier + apply_delegate_confirm_user_target
- `rpc_match_delegate_manual_confirm_targets` → may use `get_delegate_user_target_state` or `can_delegate_confirm_user_target` for consistency (optional)

---

## Phase 4A Deliverables (implemented)

### A. Migration filename
`supabase/migrations/20260317000000_phase4a_unify_participant_acceptance.sql`

### B. What was changed in Phase 4A
- **Added** `apply_participant_acceptance(p_mp_id, p_actor_id, p_is_self, p_action_type)` — internal helper
- **Updated** `rpc_match_accept_invite` — uses helper for UPDATE + reconcile + action log
- **Updated** `rpc_match_delegate_confirm_participant` — uses helper
- **Updated** `rpc_match_delegate_confirm_guest` — uses helper; guest event emission kept in RPC after helper call

### C. What was intentionally preserved
- All permission gates per public RPC
- Idempotent early-return (participant_accepted_at IS NOT NULL)
- Guest-specific `match.guest_delegate_confirmed` domain event emission
- External RPC names unchanged

### D. Behavior change (intentional)
- Delegate confirm (participant + guest) now sets `manual_confirmed_by = actor_id` (previously guest did not; participant did not either in UPDATE). This records who performed the delegate action for activity/audit.

### E. Validation
`supabase/validation/20260317000000_phase4a_unify_participant_acceptance_validation.sql`

---

## Phase 4B Deliverables (implemented)

### A. Migration filename
`supabase/migrations/20260318000000_phase4b_delegate_confirm_user_helpers.sql`

### B. Internal helpers introduced
1. **can_delegate_confirm_user_caller(match_id, actor_id)** — caller gate only (match active, non-org, InScope OR MatchAssociated)
2. **check_delegate_confirm_user_target(match_id, actor_id, target_id)** — full gate, raises with specific exceptions
3. **can_delegate_confirm_user_target(match_id, actor_id, target_id)** — boolean variant for callers that need a check without raise
4. **get_delegate_user_target_state(match_id, target_id)** — returns `'active_present'` | `'removed_present'` | `'absent'`
5. **apply_delegate_confirm_user_target(match_id, actor_id, target_id)** — write helper: active_present→reject, removed_present→re-entry, absent→fresh

### C. What was changed in Phase 4B
- **rpc_match_delegate_confirm_user** — now: `check_delegate_confirm_user_target` + `apply_delegate_confirm_user_target`
- **rpc_match_delegate_manual_confirm_targets** — now uses `can_delegate_confirm_user_caller` for caller gate

### D. What was intentionally preserved
- All permission semantics (non-org, InScope OR MatchAssociated, ShareGroup)
- Re-entry path (removed participant → reset and re-apply)
- Fresh path (INSERT new nominated row)
- active_present → reject
- Specific error messages for gate failures

### E. Validation
`supabase/validation/20260318000000_phase4b_delegate_confirm_user_validation.sql`
