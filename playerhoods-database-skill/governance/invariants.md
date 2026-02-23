# Invariants (v1.5)

## Naming
- Project and website name is **playerhoods.com** (fixed; do not use variants).

## Authority & scope
- **Groups** are relationship containers.
- **Clubs** are physical locations/identities/admin scope, not relationship containers.

## Security posture
- Prefer **RPC-only writes** (SECURITY DEFINER) for sensitive operations.
- RLS must be enabled on all user-facing tables; avoid broad write policies.
- Privileges should be explicitly revoked where you intend "RPC-only".

## Identity (Club Identity System)
- Club-scoped identity lives in `club_identities`.
- `club_handle_norm` is canonical and must be unique per club.
- One identity per (club_id, user_id); one handle per (club_id, club_handle_norm).

## Execution state (matches) — v1.5
- **Dual confirmation**: a participant is confirmed only when `removed_at IS NULL AND participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL`.
- `confirmed_at` is written exclusively by reconcile logic (`fn_reconcile_match_participant`) — no RPC may write it directly.
- `participant_accepted_at` is the v1.5 primary acceptance field; `user_accepted_at` is legacy and preserved for backward compat.
- **Reconfirm**: when `match_date`, `start_time`, or `duration_minutes` change, `participant_accepted_at`, `participant_accepted_via`, `manual_confirmed_by`, and `confirmed_at` are cleared by trigger; `org_approved_at` is preserved.
- **No reactivate flow**: removed participants re-enter only via `rpc_match_invite_user` or `rpc_match_request_join`; re-entry is recorded in `match_participant_actions` with `action_type='reenter'`.
- **Scope**: `matches.invitation_scope_group_ids` is the only valid scope; no fallback to organizer groups or platform-wide users.
- `admission_mode` column exists in DB but is **deprecated in v1.3** — MUST NOT be used in RLS/RPC/UI logic.

## Migration safety
- Prefer additive changes.
- If destructive change is necessary, provide a multi-step migration plan.
