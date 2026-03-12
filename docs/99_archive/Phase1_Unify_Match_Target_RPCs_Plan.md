# Phase 1 — Unify Match Target Read Model and Delete Legacy Target RPCs

## Goal

Make `rpc_match_admission_targets(p_match_id, p_search)` the **only** active user-target read model for match admission. Remove legacy split RPCs.

---

## Current State

| Function | Purpose | Caller gate | Returns |
|----------|---------|-------------|---------|
| `rpc_match_admission_targets(p_match_id, p_search)` | Unified read model | organizer OR (can_participants_invite + InScope/MatchAssociated) | user_id, display_name, avatar_url, club_handle, source, eligible, eligible_via, sort_name |
| `rpc_match_invite_targets(p_match_id, p_search)` | Thin wrapper | Organizer only (RAISE if non-org) | Same as admission_targets |
| `rpc_match_nominate_targets(p_match_id)` | Thin wrapper | Non-org only (empty if org) | user_id, display_name only |

Both wrappers delegate to `rpc_match_admission_targets`. The split exists for:
- **invite_targets**: organizer-only, raises on non-org
- **nominate_targets**: non-org only, returns empty for organizer; projects to (user_id, display_name)

---

## Functions to Remove

| Function | Migration that created it |
|----------|---------------------------|
| `rpc_match_invite_targets` | 20260312060000, 20260312040000 |
| `rpc_match_nominate_targets` | 20260312060000 |

---

## Functions to Keep

| Function | Notes |
|----------|-------|
| `rpc_match_admission_targets(p_match_id, p_search)` | Already the canonical read model. No changes to logic. |

---

## API/UI Callsites Impacted

### 1. `src/lib/api/matches.ts`

| Function | Current RPC | New RPC |
|----------|------------|---------|
| `getInviteTargets(matchId, search?)` | rpc_match_invite_targets | rpc_match_admission_targets |
| `getNominateTargets(matchId)` | rpc_match_nominate_targets | rpc_match_admission_targets |

**Change**: Both will call `rpc_match_admission_targets`. Map result to `ScopeUser[]` (id, display_name). The full row (avatar_url, source, eligible, etc.) is available but current UI only uses id/display_name.

### 2. `src/app/matches/[matchId]/page.tsx`

- Calls `getInviteTargets` when `isOrganizer` (line 67)
- Calls `getNominateTargets` when `canNominate` (line 70)
- **No change needed** — continues to use getInviteTargets / getNominateTargets; only the underlying RPC changes.

### 3. `src/app/matches/new/page.tsx`

- Calls `getInviteTargets` after match creation (line 88)
- **No change needed** — API function remains; implementation switches RPC.

### 4. `src/lib/api/play-network.ts`

- `getAdmissionTargets` already calls `rpc_match_admission_targets` directly
- **No change needed**

---

## Minimal Implementation Plan

### Step 1: Update `src/lib/api/matches.ts`

- `getInviteTargets`: Replace `rpc_match_invite_targets` with `rpc_match_admission_targets`
- `getNominateTargets`: Replace `rpc_match_nominate_targets` with `rpc_match_admission_targets`
- Both: pass `p_match_id`, `p_search` (null for nominate)
- Both: map `(user_id, display_name)` from full row to `ScopeUser[]`

### Step 2: Create migration to DROP legacy RPCs

New migration file: `supabase/migrations/YYYYMMDDHHMMSS_phase1_remove_legacy_target_rpcs.sql`

```sql
-- Phase 1: Remove legacy target RPCs. rpc_match_admission_targets is the single read model.
DROP FUNCTION IF EXISTS public.rpc_match_invite_targets(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_match_invite_targets(uuid);  -- older overload if exists
DROP FUNCTION IF EXISTS public.rpc_match_nominate_targets(uuid);
```

### Step 3: Update `src/lib/types/database.ts`

Remove type definitions for:
- `rpc_match_invite_targets`
- `rpc_match_nominate_targets`

### Step 4: Update or remove validation files

- `supabase/validation/20260312060000_match_admission_targets_unified_validation.sql` — remove assertions that check rpc_match_invite_targets and rpc_match_nominate_targets call rpc_match_admission_targets (those functions will no longer exist)
- `supabase/validation/20260312040000_match_invite_targets_unified_validation.sql` — may reference rpc_match_invite_targets; remove or archive if it only validates the removed function

### Step 5: Update documentation

- `docs/db/FACTS_functions.md` — remove rpc_match_invite_targets, rpc_match_nominate_targets
- `docs/db/PERMISSION_ARCHITECTURE_v1.md` — update to reference rpc_match_admission_targets only
- `docs/specs/Match_Participation_Flows_and_Scope.md` — update RPC table
- `docs/specs/Phase1_Read_Model_Alignment.md` — mark Phase 1 complete, remove wrapper references

---

## Behavior Preserved

| Scenario | Before | After |
|----------|--------|-------|
| Organizer fetches invite targets | rpc_match_invite_targets → data | rpc_match_admission_targets → data |
| Non-org (canNominate) fetches nominate targets | rpc_match_nominate_targets → data | rpc_match_admission_targets → data |
| Non-org calls getInviteTargets | Not called (UI hidden) | Not called |
| Organizer calls getNominateTargets | Not called (UI hidden) | Not called |
| Unauthorized caller | invite_targets RAISE; nominate_targets empty | admission_targets returns empty |

**Semantic change**: `rpc_match_invite_targets` used to RAISE when a non-organizer called it. After removal, the frontend will call `rpc_match_admission_targets` directly. The frontend only calls `getInviteTargets` when `isOrganizer`, so non-org never reaches it. If a bug allowed a non-org to call it, they would now get data (admission_targets returns for can_participants_invite users) instead of an error. This is acceptable per "no production data" and "prefer simpler paths."

---

## Follow-up Phase Dependencies

- **Phase 2** (Contact Player resolution): May eventually feed `rpc_match_admission_targets` with mixed targets (users + Contact Players). This phase establishes the single read-model entry point.
- **Phase 5** (terminology): UI terminology cleanup is independent; no dependency on Phase 1.

---

## Deliverables (Phase 1 Complete)

### A. What changed
- `getInviteTargets` and `getNominateTargets` now call `rpc_match_admission_targets` directly
- Migration `20260314000000` drops `rpc_match_invite_targets` and `rpc_match_nominate_targets`
- Types, validation, and docs updated

### B. Files/functions removed
- `rpc_match_invite_targets(uuid, text)` and `rpc_match_invite_targets(uuid)`
- `rpc_match_nominate_targets(uuid)`

### C. Files/functions added
- `supabase/migrations/20260314000000_phase1_remove_legacy_target_rpcs.sql`

### D. What existing behavior was intentionally preserved
- Invite/nominate UI behavior unchanged; callers still receive `ScopeUser[]` (id, display_name)
- Organizer-only and canNominate-only call patterns are unchanged

### E. What follow-up phase depends on this phase
- Phase 2 (Contact Player resolution) may feed into `rpc_match_admission_targets` for mixed targets
