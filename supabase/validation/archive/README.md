# Archived validation files

These validations are obsolete after canonicalization (2026-03-20) or delegate simplify (2026-03-21):

- **20260312030000** — asserted `can_invite_user_to_match` and `rpc_match_invite_user` using it. Both dropped/superseded.
- **20260312040000** — asserted `rpc_match_invite_targets` (dropped in Phase 1) and `can_invite_user_to_match`. Both gone.
- **20260318000000** — Phase4B delegate confirm user helpers and RPCs. Dropped in delegate simplify; see `20260321000000_delegate_simplify_validation.sql`.

Current admission model: `can_admit_user_to_match` + `rpc_match_admit_user`. Delegate confirm: `rpc_match_delegate_confirm_participant` (user + guest).
