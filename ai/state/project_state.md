# Project State

## Current Phase
Match participant lifecycle has been largely cleaned up and canonicalized on the **local DB**.

## Stable Core Model
### Enter
- `rpc_match_request_join`
- `rpc_match_admit_user`
- `rpc_match_nominate_user` (wrapper)
- `rpc_match_nominate_guest`
- internal helper: `apply_participant_admission`

### Confirm
- `rpc_match_accept_invite`
- `rpc_match_delegate_confirm_participant`
- internal helper: `apply_participant_acceptance`

### Approve
- `rpc_match_org_approve_participant`

### Exit
- `rpc_match_remove_participant`
- `rpc_match_user_withdraw`
- internal helper: `apply_participant_exit`

### Reset
- `fn_match_detail_change_reconfirm`

## Key Rules
- Confirmed = `participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL`
- Status is derived only by `match_participant_reconcile_status`
- Removed = `removed_at IS NOT NULL`

## Contact Player Decision
Adopted **Scheme B**:
- Contact Player can respond to a match via magic link **without registration**
- Responding to the current match does **not** create a new user participant row
- Registration is a separate optional CTA
- After registration, future new flows should prefer **user identity**
- No full historical canonicalization / no backfill conversion of old match rows

## Current Focus
- Adjust Contact Player email / magic-link flow to reflect Scheme B
- Keep current match response and registration as two separate paths
- Do **not** modify core helpers or participant lifecycle semantics in this step

## Explicit Do-Not-Touch
- `apply_participant_admission`
- `apply_participant_acceptance`
- `apply_participant_exit`
- `match_participant_reconcile_status`
- canonical participant row strategy implementation
- historical/global canonicalization
- identity_links core rules

## Notes
- Local DB is the current source of truth
- Remote sync is intentionally deferred
- Canonicalization orchestration is documented as design only, not implemented