# Invariants (v1.4)

## Naming
- Project and website name is **playerhoods.com** (fixed; do not use variants).

## Authority & scope
- **Groups** are relationship containers.
- **Clubs** are physical locations/identities/admin scope, not relationship containers.

## Security posture
- Prefer **RPC-only writes** (SECURITY DEFINER) for sensitive operations.
- RLS must be enabled on all user-facing tables; avoid broad write policies.
- Privileges should be explicitly revoked where you intend “RPC-only”.

## Identity (Club Identity System)
- Club-scoped identity lives in `club_identities`.
- `club_handle_norm` is canonical and must be unique per club.
- One identity per (club_id, user_id); one handle per (club_id, club_handle_norm).

## Execution state (matches)
- Participant confirmation is derived from explicit acceptance signals via reconcile logic.
- Restart/removal semantics must follow v1.4 doctrine (no silent history loss).

## Migration safety
- Prefer additive changes.
- If destructive change is necessary, provide a multi-step migration plan.
