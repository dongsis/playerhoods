# Phase 1 Read Model Alignment

**Status:** Implemented (migrations through `20260313000000_two_layer_preferences_minimal.sql`)  
**Context:** Migration `20260312050000_unify_invite_nominate_admission.sql` unified the admission write path. `20260313000000` added two-layer preferences (global + club overrides).

---

## Implemented (2026-03-12, 2026-03-13)

The read model is now aligned with the unified write path:

- **`rpc_match_admission_targets(p_match_id, p_search)`** — unified admission targets.
  - Caller: Organizer OR (non-organizer with `can_participants_invite_users` + InScope/MatchAssociated).
  - Returns empty when caller not authorized.
  - Sources: reentry, invite_circle, club_members, groups (caller-relative).
  - `eligible = can_admit_user_to_match(p_match_id, auth.uid(), target_id)`.

- **Phase 1 (2026-03-14):** removed `rpc_match_invite_targets` and `rpc_match_nominate_targets`. API (`getInviteTargets`, `getNominateTargets`) now calls `rpc_match_admission_targets` directly.

---

## References

- `00_AUTHORITATIVE_INDEX.md`
- `Match_Participation_Flows_and_Scope.md`
- `playerhoods_five_pillars_implementation_v1.md`
- `Two_Layer_Preferences_Implementation_Note.md` — two-layer discovery/admission
- Migration: `20260312050000_unify_invite_nominate_admission.sql`
- Migration: `20260312060000_match_admission_targets_unified.sql`
- Migration: `20260313000000_two_layer_preferences_minimal.sql`
