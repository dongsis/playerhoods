# Two-Layer Preferences — Implementation Note

**Status:** Implemented (migration `20260313000000_two_layer_preferences_minimal.sql`)  
**Context:** Play Network Core permission model; discovery and non-group admission.

---

## 1. Two-Layer Model (Authoritative)

### Layer 1: Global master switches (profiles)
- `profiles.show_in_club_member_discovery`
- `profiles.allow_non_group_invites`

If global switch is OFF → behavior OFF everywhere. Club-level settings have no effect.

### Layer 2: Club-scoped overrides (club_identities)
- `club_identities.visible_in_club_member_discovery` (nullable)
- `club_identities.accept_non_group_invites_in_club` (nullable)

NULL = no override, treated as true. Only applies when corresponding global switch is ON.

### Effective logic
- **Discovery:** `profiles.show_in_club_member_discovery` AND `COALESCE(club_identities.visible_in_club_member_discovery, true)`
- **Non-group invite:** `profiles.allow_non_group_invites` AND `COALESCE(club_identities.accept_non_group_invites_in_club, true)`

---

## 2. Multi-Sport Support — Current Decision

**Current permission model does NOT introduce sport-scoped permission.**

- No sport-level preference table
- No global × sport × club three-layer model
- No sport-specific UI settings

Future may add sport-scoped permission if multi-sport behavior diverges enough; that is not part of the current implementation.

---

## 3. Tennis / Racket-Adjacent / Pickleball — Current Decision

For currently prioritized sports (tennis, racket-adjacent, pickleball):

**All share the same discovery / invite permission model.**

- Discoverable → all discoverable
- Not discoverable → all not discoverable
- Accept non-group invite → all accept
- Reject → all reject

No sport-specific permission split. This is not a permanent design; it is the current implementation scope.

---

## 4. Wired Into

| Component | Change |
|-----------|--------|
| `rpc_club_members_discovery` | Two-layer discovery filter |
| `can_admit_user_to_match` | Path B (non-group) two-layer; club context = match.club_id or organizer.primary_club_id |
| `rpc_match_admission_targets` | club_members_src uses two-layer discovery; eligible = can_admit |

---

## References

- `Naming_Simplification_and_Club_Preferences_Plan.md`
- Migration: `20260313000000_two_layer_preferences_minimal.sql`
- Validation: `supabase/validation/20260313000000_two_layer_preferences_validation.sql`
