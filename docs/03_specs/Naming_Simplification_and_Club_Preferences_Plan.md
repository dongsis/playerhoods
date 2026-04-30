# Naming Simplification and Venue-Scoped Preferences Plan

**Status:** Plan / design (implementation slice TBD)  
**Context:** Consolidate fragmented naming model; add club-scoped preference overrides while keeping global master switches.

---

## Two-Layer Discovery/Invite Preferences Model

### Layer 1: Global master switches (profiles) — KEEP

| Column | Purpose |
|--------|---------|
| `profiles.show_in_venue_member_discovery` | Master switch for discovery. If OFF → behavior OFF everywhere; club-level controls may be hidden/disabled. |
| `profiles.allow_non_group_invites` | Master switch for non-group invites. If OFF → behavior OFF everywhere. |

**Important:** These remain authoritative. Do NOT deprecate.

### Layer 2: Venue-scoped overrides (venue_identities) — ADD

| Column | Purpose |
|--------|---------|
| `venue_identities.visible_in_venue_member_discovery` | Override: visible in this club's discovery. Only applies when global switch is ON. |
| `venue_identities.accept_non_group_invites_in_venue` | Override: accept non-group invites in this club. Only applies when global switch is ON. |

**Semantics:** Venue-level settings are scoped overrides, not replacements. They only matter when the corresponding global switch is ON.

### Effective logic

**Discovery in a club:**
```
profiles.show_in_venue_member_discovery = true
AND COALESCE(venue_identities.visible_in_venue_member_discovery, true) = true
```

**Non-group invites in a club:**
```
profiles.allow_non_group_invites = true
AND COALESCE(venue_identities.accept_non_group_invites_in_venue, true) = true
```

When target has no `venue_identities` row for the club: treat club override as true (COALESCE to true).

---

## A. Inventory of Current Handle/Name Fields and Dependent Functions

### A.1 Tables and Columns

| Location | Column | Purpose | Used as |
|----------|--------|---------|---------|
| **profiles** | `display_name` | Global display name | Primary name everywhere |
| **profiles** | — | (no `booking_name`) | — |
| **profiles** | `show_in_venue_member_discovery` | Global discoverability | Filter in club discovery |
| **profiles** | `allow_non_group_invites` | Global non-group invite permission | Filter in `can_admit_user_to_match` |
| **venue_identities** | `venue_handle` | Venue-scoped handle (unique per club) | Display, search, sort fallback |
| **venue_identities** | `venue_handle_norm` | GENERATED: `lower(trim(venue_handle))` | Uniqueness constraint |
| **group_members** | `group_display_name` | Group-scoped alias | Fallback in `v_group_member_display` |
| **guests** | `display_name` | Guest name | N/A (out of scope) |

### A.2 Functions Using venue_handle / venue_handle_norm

| Function | Usage |
|----------|-------|
| `validate_venue_handle(p_handle)` | Validates handle format; used by check/set/join |
| `rpc_venue_handle_check(p_venue_id, p_handle)` | Checks availability; uses `venue_handle_norm` for uniqueness |
| `rpc_venue_handle_set(p_venue_id, p_new_handle)` | Updates `venue_handle` in venue_identities |
| `rpc_venue_join(p_venue_id, p_handle)` | Inserts `venue_identities(venue_id, user_id, venue_handle)`; first club sets `display_name` |
| `rpc_profile_set_primary_venue(p_venue_id)` | Sets `display_name = venue_handle` of that club |
| `rpc_venue_members_discovery(p_venue_id, p_search)` | Returns `venue_handle`; search/sort uses `venue_handle` as fallback |
| `rpc_match_admission_targets(p_match_id, p_search)` | Returns `venue_handle`; search/sort uses `venue_handle` as fallback |

### A.3 Functions Using profiles.show_in_venue_member_discovery / allow_non_group_invites

| Function | Usage |
|----------|-------|
| `rpc_venue_members_discovery` | `p.show_in_venue_member_discovery = true` |
| `rpc_match_admission_targets` (club_members_src) | `p.show_in_venue_member_discovery = true` |
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
| `VenueIdentityRow.tsx` | `identity.venue_handle`, `onRename` → `setVenueHandle` (rpc_venue_handle_set) |
| `VenueMembersSection.tsx` | `m.display_name \|\| m.venue_handle`, `@${m.venue_handle}` |
| `identities.ts` | `checkVenueHandle`, `joinVenue`, `setVenueHandle`, `setPrimaryVenue` |
| Onboarding / join flow | `rpc_venue_join(p_venue_id, p_handle)` — requires handle on join |
| Profile page | Venue identities with handle rename; group aliases |

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
| `show_in_venue_member_discovery` | **Keep** — global master switch (Layer 1) |
| `allow_non_group_invites` | **Keep** — global master switch (Layer 1) |
| Other (avatar, etc.) | Unchanged |

### B.2 venue_identities

| Column | Change |
|--------|--------|
| `venue_handle` | **Deprecate** — no longer used for naming (deferred) |
| `venue_handle_norm` | **Deprecate** — remove with venue_handle (deferred) |
| `visible_in_venue_member_discovery` | **Add** — `boolean` nullable, DEFAULT true. Venue override (Layer 2). |
| `accept_non_group_invites_in_venue` | **Add** — `boolean` nullable, DEFAULT true. Venue override (Layer 2). |

**Semantics:** `venue_identities` = club membership + club-scoped preference overrides. Effective behavior = global AND club override.

### B.3 group_members

| Column | Change |
|--------|--------|
| `group_display_name` | **Deprecate later** — if safe; requires `v_group_member_display` to use only `display_name` |

---

## C. Minimal Migration / Implementation Slice

### Slice 1: Add New Columns (append-only, non-breaking)

**Migration:** Add to `venue_identities`:
```sql
ALTER TABLE public.venue_identities
  ADD COLUMN IF NOT EXISTS visible_in_venue_member_discovery boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS accept_non_group_invites_in_venue boolean DEFAULT true;
```
(Nullable: NULL = no override = treat as true per COALESCE in effective logic.)

**Migration:** Add to `profiles`:
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS booking_name text;
```

### Slice 2: Update Read Model to Use Two-Layer Preferences

**rpc_venue_members_discovery:**
- Discovery filter: `p.show_in_venue_member_discovery = true` AND `COALESCE(ci.visible_in_venue_member_discovery, true) = true`
- Keep: `p.display_name`, `p.avatar_url` for output
- Remove: `ci.venue_handle` from output; use `p.display_name` only
- Search: `p.display_name ILIKE ...` only (drop `ci.venue_handle ILIKE`)
- Sort: `p.display_name` only

**rpc_match_admission_targets:**
- club_members_src: `p.show_in_venue_member_discovery = true` AND `COALESCE(ci.visible_in_venue_member_discovery, true) = true`
- Remove: `venue_handle` from RETURNS; use `display_name` only
- Search: `p.display_name ILIKE` only (drop `ci.venue_handle ILIKE`)
- Sort: `p.display_name` only

**can_admit_user_to_match (Path B — non-group direct):**
- Effective: `p_target.allow_non_group_invites = true` AND `COALESCE(ci.accept_non_group_invites_in_venue, true) = true`
- Venue context: match.venue_id or organizer.primary_venue_id
- If target has no venue_identity for that club: treat club override as true (COALESCE to true)

### Slice 3: rpc_venue_join — Stop Requiring Handle

**Current:** `rpc_venue_join(p_venue_id, p_handle)` — requires handle, inserts venue_identities with venue_handle.

**Target:** `rpc_venue_join(p_venue_id)` — no handle. Insert `venue_identities(venue_id, user_id)` with defaults for new columns. For first club: set `primary_venue_id`; set `display_name` from `profiles` if empty (use first_name/last_name or placeholder) — do NOT use handle.

**Compatibility:** Add overload `rpc_venue_join(p_venue_id, p_handle text DEFAULT NULL)`. If `p_handle` provided, treat as legacy: still insert venue_handle (for backward compatibility during deprecation). If NULL, insert without venue_handle. **Problem:** venue_handle is NOT NULL today. So we cannot add a row without it.

**Alternative:** Keep `venue_handle` column but make it nullable in a later migration. For now: minimal slice does NOT change rpc_venue_join signature. Defer handle deprecation.

### Slice 4: What to Implement Now (Minimal)

1. **Add columns:** `venue_identities.visible_in_venue_member_discovery`, `venue_identities.accept_non_group_invites_in_venue`, `profiles.booking_name`.
2. **Update rpc_venue_members_discovery:** Use two-layer filter: `p.show_in_venue_member_discovery = true` AND `COALESCE(ci.visible_in_venue_member_discovery, true) = true`. Drop `venue_handle` from output; use `p.display_name` only. Update search/sort.
3. **Update rpc_match_admission_targets:** Same two-layer filter in club_members_src. Drop `venue_handle` from output. Update search/sort.
4. **Update can_admit_user_to_match Path B:** Two-layer: `p_target.allow_non_group_invites = true` AND `COALESCE(ci.accept_non_group_invites_in_venue, true) = true`. No backfill needed — new columns default NULL, COALESCE to true.

### Slice 5: What to Defer

- Deprecation of `venue_handle` / `venue_handle_norm` (requires rpc_venue_join change, UI changes)
- Deprecation of `group_display_name`
- UI for editing `visible_in_venue_member_discovery` and `accept_non_group_invites_in_venue` per club (unless explicitly requested)
- UI for `booking_name`

---

## D. Affected RPCs / Views / UI Surfaces

### D.1 RPCs — Changes Required

| RPC | Change |
|-----|--------|
| `rpc_venue_join` | **Defer** — keep as-is; handle deprecation later |
| `rpc_venue_handle_check` | **Defer** — no change in minimal slice |
| `rpc_venue_handle_set` | **Defer** — no change in minimal slice |
| `rpc_venue_members_discovery` | **Now:** Two-layer filter (global AND club override); drop `venue_handle` from output; search/sort on display_name only |
| `can_admit_user_to_match` | **Now:** Path B two-layer (global AND club override); COALESCE club override to true when no row |
| `rpc_match_admission_targets` | **Now:** Two-layer filter in club_members_src; drop `venue_handle` from output; search/sort on display_name |
| `rpc_match_admission_targets` | **Now:** Canonical unified target read model for invite and nominate surfaces |
| `rpc_profile_set_primary_venue` | **Defer** — still syncs display_name from venue_handle; will break when handle deprecated |

### D.2 Views

| View | Change |
|------|--------|
| `profile_display` | **Optional:** Add `booking_name` when needed |
| `v_group_member_display` | **Defer** — no change for group_display_name deprecation |

### D.3 UI Surfaces

| Surface | Change |
|---------|--------|
| `VenueMembersSection.tsx` | **Now:** Remove `venue_handle` fallback; use `display_name` only. Remove `@${venue_handle}`. |
| `VenueIdentityRow.tsx` | **Defer** — handle rename UI; will be removed when venue_handle deprecated |
| API clients (play-network, matches) | **Now:** Drop `venue_handle` from `VenueMemberDiscoveryRow` and `AdmissionTargetRow` types if returned |
| Profile / identity page | **Defer** — preferences UI |

---

## E. What Is Deferred

| Item | Reason |
|------|--------|
| `venue_handle` / `venue_handle_norm` deprecation | Requires rpc_venue_join to not require handle; venue_identities.venue_handle NOT NULL; UI for join flow |
| `rpc_venue_handle_check` / `rpc_venue_handle_set` deprecation | Depends on venue_handle removal |
| `rpc_profile_set_primary_venue` display_name sync | Depends on venue_handle; will need to stop syncing |
| `group_display_name` deprecation | Requires v_group_member_display change; assess callers |
| UI for per-club preferences | New feature (unless explicitly requested) |
| UI for booking_name | New feature |
| `validate_venue_handle` | Keep for legacy rpc_venue_handle_* until deprecated |

**Note:** `profiles.show_in_venue_member_discovery` and `profiles.allow_non_group_invites` remain as global master switches. No deprecation.

---

## F. Implementation Order (Minimal Slice)

1. **Migration:** Add `venue_identities.visible_in_venue_member_discovery`, `venue_identities.accept_non_group_invites_in_venue`, `profiles.booking_name`. No backfill — new columns default NULL; COALESCE to true in logic.
2. **Update rpc_venue_members_discovery:** Two-layer filter (global AND club override); drop venue_handle from output; search/sort on display_name.
3. **Update rpc_match_admission_targets:** Same two-layer filter in club_members_src; drop venue_handle from output; search/sort on display_name.
4. **Update can_admit_user_to_match Path B:** Two-layer (global AND club override); join venue_identities for target+club when club context exists.
5. **Update TypeScript types:** Remove `venue_handle` from `VenueMemberDiscoveryRow`, `AdmissionTargetRow`.
6. **Update VenueMembersSection.tsx:** Use display_name only; remove venue_handle.

---

## G. Legacy / Deprecated (After Full Migration)

| Item | Status |
|------|--------|
| `venue_identities.venue_handle` | Legacy — to be dropped (deferred) |
| `venue_identities.venue_handle_norm` | Legacy — to be dropped (deferred) |
| `rpc_venue_handle_check` | Legacy — to be dropped (deferred) |
| `rpc_venue_handle_set` | Legacy — to be dropped (deferred) |
| `rpc_venue_join(p_handle)` | Legacy — to become optional then removed (deferred) |
| `group_members.group_display_name` | Legacy — deferred |

**Not deprecated:** `profiles.show_in_venue_member_discovery` and `profiles.allow_non_group_invites` remain as global master switches. Venue-level columns are overrides, not replacements.
