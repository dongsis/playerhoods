---
name: Governance audit
description: Governance audit
invokable: true
---

Governance audit (PlayerHoods).

Only analyze the attached file(s).
Do NOT search the workspace unless I explicitly ask.
If spec text is not attached, do not invent it—state "spec not provided".

Audit goals:
A) Identify any conflicts with PlayerHoods Core Governance invariants.
B) If conflict exists: propose the minimal corrective change, explicitly.

Core invariants to check:
1) Spec-first discipline: if behavior unclear, do not invent; flag as undefined.
2) Unified confirmation invariant: confirmed iff (participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL).
   No RPC may finalize confirmation without both timestamps.
3) Reconciliation discipline: status convergence must go through match_participant_reconcile_status(p_mp_id).
   No direct writes to status.
4) Restart channel constraint: only rpc_match_request_join and rpc_match_invite_user may reactivate removed.
5) ShareGroup boundary: trust only from groups where group_kind='friend' and members active.
6) Delegate semantics: delegate confirm ≠ final confirm; organizer approval still required.
7) Display name integrity: rpc_club_handle_set must not mutate profiles.display_name.
8) RLS explicitness: user-facing tables must have explicit RLS + explicit SELECT policies.
9) Function safety: avoid SQL inlining when recursion risk exists; use plpgsql; SECURITY DEFINER sets search_path.

Output format:
- Top-line verdict: Pass / Needs changes
- Conflicts found (list each invariant violated + exact location)
- Minimal fix plan (bullet edits, not redesign)
- Any undefined-by-spec cases (explicit)