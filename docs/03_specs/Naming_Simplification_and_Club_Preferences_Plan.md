# Naming Simplification and Club-Scoped Preferences Plan

**Status:** Plan / design (implementation slice TBD)  
**Context:** Consolidate fragmented naming model; add club-scoped preference overrides while keeping global master switches.

---

## Two-Layer Discovery/Invite Preferences Model

### Layer 1: Global master switches (profiles) — KEEP

| Column | Purpose |
|--------|---------|
| `profiles.show_in_club_member_discovery` | Master switch for discovery. If OFF → behavior OFF everywhere; club-level controls may be hidden/disabled. |
| `profiles.allow_non_group_invites` | Master switch for non-group invites. If OFF → behavior OFF everywhere. |

**Important:** These remain authoritative. Do NOT deprecate.

### Layer 2: Club-scoped overrides (club_identities) — ADD

| Column | Purpose |
|--------|---------|
| `club_identities.visible_in_club_member_discovery` | Override: visible in this club's discovery. Only applies when global switch is ON. |
| `club_identities.accept_non_group_invites_in_club` | Override: accept non-group invites in this club. Only applies when global switch is ON. |

**Semantics:** Club-level settings are scoped overrides, not replacements. They only matter when the corresponding global switch is ON.

### Effective logic

**Discovery in a club:**
```
profiles.show_in_club_member_discovery = true
AND COALESCE(club_identities.visible_in_club_member_discovery, true) = true
```

**Non-group invites in a club:**
```
profiles.allow_non_group_invites = true
AND COALESCE(club_identities.accept_non_group_invites_in_club, true) = true
```

When target has no `club_identities` row for the club: treat club override as true (COALESCE to true).

---

## A. Inventory of Current Handle/Name Fields and Dependent Functions

### A.1 Tables and Columns

| Location | Column | Purpose | Used as |
|----------|--------|---------|---------|
| **profiles** | `display_name` | Global display name | Primary name everywhere |
| **profiles** | — | (no `booking_name`) | — |
| **profiles** | `show_in_club_member_discovery` | Global discoverability | Filter in club discovery |
| **profiles** | `allow_non_group_invites` | Global non-group invite permission | Filter in `can_admit_user_to_match` |
| **club_identities** | `club_handle` | Club-scoped handle (unique per club) | Display, search, sort fallback |
| **club_identities** | `club_handle_norm` | GENERATED: `lower(trim(club_handle))` | Uniqueness constraint |
| **group_members** | `group_display_name` | Group-scoped alias | Fallback in `v_group_member_display` |
| **guests** | `display_name` | Guest name | N/A (out of scope) |

### A.2 Functions Using club_handle / club_handle_norm

| Function | Usage |
|----------|-------|
| `validate_club_handle(p_handle)` | Validates handle format; used by check/set/join |
| `rpc_club_handle_check(p_club_id, p_handle)` | Checks availability; uses `club_handle_norm` for uniqueness |
| `rpc_club_handle_set(p_club_id, p_new_handle)` | Updates `club_handle` in club_identities |
| `rpc_club_join(p_club_id, p_handle)` | Inserts `club_identities(club_id, user_id, club_handle)`; first club sets `display_name` |
| `rpc_profile_set_primary_club(p_club_id)` | Sets `display_name = club_handle` of that club |
| `rpc_club_members_discovery(p_club_id, p_search)` | Returns `club_handle`; search/sort uses `club_handle` as fallback |
| `rpc_match_admission_targets(p_match_id, p_search)` | Returns `club_handle`; search/sort uses `club_handle` as fallback |

### A.3 Functions Using profiles.show_in_club_member_discovery / allow_non_group_invites

| Function | Usage |
|----------|-------|
| `rpc_club_members_discovery` | `p.show_in_club_member_discovery = true` |
| `rpc_match_admission_targets` (club_members_src) | `p.show_in_club_member_discovery = true` |
| `can_admit_user_to_match` | `p_target.allow_non_group_invites = true` (Path B: non-group direct) |

### A.4 Functions Using group_display_name

| Object | Usage |
|--------|-------|
| `v_group_member_display` | `effective_display_name = COALESCE(personal_remark, group_display_name, display_name)` |
| `rpc_group_set_display_name` | Sets `group_members.group_display_name` |

Note: `rpc_match_participant_display_names` uses `profile_display.display_name` (profiles) and `guests.display_name`; it does not use `group_display_name`.

### A.5 UI Surfaces

| Surface | Uses |
|---------|------|
| `ClubIdentityRow.tsx` | `identity.club_handle`, `onRename` → `setClubHandle` (rpc_club_handle_set) |
| `ClubMembersSection.tsx` | `m.display_name \|\| m.club_handle`, `@${m.club_handle}` |
| `identities.ts` | `checkClubHandle`, `joinClub`, `setClubHandle`, `setPrimaryClub` |
| Onboarding / join flow | `rpc_club_join(p_club_id, p_handle)` — requires handle on join |
| Profile page | Club identities with handle rename; group aliases |

### A.6 Views

| View | Columns |
|------|---------|
| `profile_display` | `id, display_name, avatar_url` (from profiles) |
| `v_group_member_display` | `effective_display_name` = personal_remark > group_display_name > display_name |

---

## B. Proposed Simplified Target Model

### B.1 profiles

| Column | Change |
|--------|--------|
| `display_name` | **Keep** — single global display name |
| `booking_name` | **Add** — court-booking name (nullable; fallback to display_name when null) |
| `show_in_club_member_discovery` | **Keep** — global master switch (Layer 1) |
| `allow_non_group_invites` | **Keep** — global master switch (Layer 1) |
| Other (avatar, etc.) | Unchanged |

### B.2 club_identities

| Column | Change |
|--------|--------|
| `club_handle` | **Deprecate** — no longer used for naming (deferred) |
| `club_handle_norm` | **Deprecate** — remove with club_handle (deferred) |
| `visible_in_club_member_discovery` | **Add** — `boolean` nullable, DEFAULT true. Club override (Layer 2). |
| `accept_non_group_invites_in_club` | **Add** — `boolean` nullable, DEFAULT true. Club override (Layer 2). |

**Semantics:** `club_identities` = club membership + club-scoped preference overrides. Effective behavior = global AND club override.

### B.3 group_members

| Column | Change |
|--------|--------|
| `group_display_name` | **Deprecate later** — if safe; requires `v_group_member_display` to use only `display_name` |

---

## C. Minimal Migration / Implementation Slice

### Slice 1: Add New Columns (append-only, non-breaking)

**Migration:** Add to `club_identities`:
```sql
ALTER TABLE public.club_identities
  ADD COLUMN IF NOT EXISTS visible_in_club_member_discovery boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS accept_non_group_invites_in_club boolean DEFAULT true;
```
(Nullable: NULL = no override = treat as true per COALESCE in effective logic.)

**Migration:** Add to `profiles`:
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS booking_name text;
```

### Slice 2: Update Read Model to Use Two-Layer Preferences

**rpc_club_members_discovery:**
- Discovery filter: `p.show_in_club_member_discovery = true` AND `COALESCE(ci.visible_in_club_member_discovery, true) = true`
- Keep: `p.display_name`, `p.avatar_url` for output
- Remove: `ci.club_handle` from output; use `p.display_name` only
- Search: `p.display_name ILIKE ...` only (drop `ci.club_handle ILIKE`)
- Sort: `p.display_name` only

**rpc_match_admission_targets:**
- club_members_src: `p.show_in_club_member_discovery = true` AND `COALESCE(ci.visible_in_club_member_discovery, true) = true`
- Remove: `club_handle` from RETURNS; use `display_name` only
- Search: `p.display_name ILIKE` only (drop `ci.club_handle ILIKE`)
- Sort: `p.display_name` only

**can_admit_user_to_match (Path B — non-group direct):**
- Effective: `p_target.allow_non_group_invites = true` AND `COALESCE(ci.accept_non_group_invites_in_club, true) = true`
- Club context: match.club_id or organizer.primary_club_id
- If target has no club_identity for that club: treat club override as true (COALESCE to true)

### Slice 3: rpc_club_join — Stop Requiring Handle

**Current:** `rpc_club_join(p_club_id, p_handle)` — requires handle, inserts club_identities with club_handle.

**Target:** `rpc_club_join(p_club_id)` — no handle. Insert `club_identities(club_id, user_id)` with defaults for new columns. For first club: set `primary_club_id`; set `display_name` from `profiles` if empty (use first_name/last_name or placeholder) — do NOT use handle.

**Compatibility:** Add overload `rpc_club_join(p_club_id, p_handle text DEFAULT NULL)`. If `p_handle` provided, treat as legacy: still insert club_handle (for backward compatibility during deprecation). If NULL, insert without club_handle. **Problem:** club_handle is NOT NULL today. So we cannot add a row without it.

**Alternative:** Keep `club_handle` column but make it nullable in a later migration. For now: minimal slice does NOT change rpc_club_join signature. Defer handle deprecation.

### Slice 4: What to Implement Now (Minimal)

1. **Add columns:** `club_identities.visible_in_club_member_discovery`, `club_identities.accept_non_group_invites_in_club`, `profiles.booking_name`.
2. **Update rpc_club_members_discovery:** Use two-layer filter: `p.show_in_club_member_discovery = true` AND `COALESCE(ci.visible_in_club_member_discovery, true) = true`. Drop `club_handle` from output; use `p.display_name` only. Update search/sort.
3. **Update rpc_match_admission_targets:** Same two-layer filter in club_members_src. Drop `club_handle` from output. Update search/sort.
4. **Update can_admit_user_to_match Path B:** Two-layer: `p_target.allow_non_group_invites = true` AND `COALESCE(ci.accept_non_group_invites_in_club, true) = true`. No backfill needed — new columns default NULL, COALESCE to true.

### Slice 5: What to Defer

- Deprecation of `club_handle` / `club_handle_norm` (requires rpc_club_join change, UI changes)
- Deprecation of `group_display_name`
- UI for editing `visible_in_club_member_discovery` and `accept_non_group_invites_in_club` per club (unless explicitly requested)
- UI for `booking_name`

---

## D. Affected RPCs / Views / UI Surfaces

### D.1 RPCs — Changes Required

| RPC | Change |
|-----|--------|
| `rpc_club_join` | **Defer** — keep as-is; handle deprecation later |
| `rpc_club_handle_check` | **Defer** — no change in minimal slice |
| `rpc_club_handle_set` | **Defer** — no change in minimal slice |
| `rpc_club_members_discovery` | **Now:** Two-layer filter (global AND club override); drop `club_handle` from output; search/sort on display_name only |
| `can_admit_user_to_match` | **Now:** Path B two-layer (global AND club override); COALESCE club override to true when no row |
| `rpc_match_admission_targets` | **Now:** Two-layer filter in club_members_src; drop `club_handle` from output; search/sort on display_name |
| `rpc_match_invite_targets` | **Now:** Thin wrapper; inherits changes from rpc_match_admission_targets |
| `rpc_match_nominate_targets` | **Now:** Inherits; returns (user_id, display_name) — no club_handle |
| `rpc_profile_set_primary_club` | **Defer** — still syncs display_name from club_handle; will break when handle deprecated |

### D.2 Views

| View | Change |
|------|--------|
| `profile_display` | **Optional:** Add `booking_name` when needed |
| `v_group_member_display` | **Defer** — no change for group_display_name deprecation |

### D.3 UI Surfaces

| Surface | Change |
|---------|--------|
| `ClubMembersSection.tsx` | **Now:** Remove `club_handle` fallback; use `display_name` only. Remove `@${club_handle}`. |
| `ClubIdentityRow.tsx` | **Defer** — handle rename UI; will be removed when club_handle deprecated |
| API clients (play-network, matches) | **Now:** Drop `club_handle` from `ClubMemberDiscoveryRow` and `AdmissionTargetRow` types if returned |
| Profile / identity page | **Defer** — preferences UI |

---

## E. What Is Deferred

| Item | Reason |
|------|--------|
| `club_handle` / `club_handle_norm` deprecation | Requires rpc_club_join to not require handle; club_identities.club_handle NOT NULL; UI for join flow |
| `rpc_club_handle_check` / `rpc_club_handle_set` deprecation | Depends on club_handle removal |
| `rpc_profile_set_primary_club` display_name sync | Depends on club_handle; will need to stop syncing |
| `group_display_name` deprecation | Requires v_group_member_display change; assess callers |
| UI for per-club preferences | New feature (unless explicitly requested) |
| UI for booking_name | New feature |
| `validate_club_handle` | Keep for legacy rpc_club_handle_* until deprecated |

**Note:** `profiles.show_in_club_member_discovery` and `profiles.allow_non_group_invites` remain as global master switches. No deprecation.

---

## F. Implementation Order (Minimal Slice)

1. **Migration:** Add `club_identities.visible_in_club_member_discovery`, `club_identities.accept_non_group_invites_in_club`, `profiles.booking_name`. No backfill — new columns default NULL; COALESCE to true in logic.
2. **Update rpc_club_members_discovery:** Two-layer filter (global AND club override); drop club_handle from output; search/sort on display_name.
3. **Update rpc_match_admission_targets:** Same two-layer filter in club_members_src; drop club_handle from output; search/sort on display_name.
4. **Update can_admit_user_to_match Path B:** Two-layer (global AND club override); join club_identities for target+club when club context exists.
5. **Update TypeScript types:** Remove `club_handle` from `ClubMemberDiscoveryRow`, `AdmissionTargetRow`.
6. **Update ClubMembersSection.tsx:** Use display_name only; remove club_handle.

---

## G. Legacy / Deprecated (After Full Migration)

| Item | Status |
|------|--------|
| `club_identities.club_handle` | Legacy — to be dropped (deferred) |
| `club_identities.club_handle_norm` | Legacy — to be dropped (deferred) |
| `rpc_club_handle_check` | Legacy — to be dropped (deferred) |
| `rpc_club_handle_set` | Legacy — to be dropped (deferred) |
| `rpc_club_join(p_handle)` | Legacy — to become optional then removed (deferred) |
| `group_members.group_display_name` | Legacy — deferred |

**Not deprecated:** `profiles.show_in_club_member_discovery` and `profiles.allow_non_group_invites` remain as global master switches. Club-level columns are overrides, not replacements.
