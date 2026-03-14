# Per-Club Per-User Preference Gap — Design Note

**Status:** Design/spec only (no implementation in this round)  
**Context:** Phase 1 read-model alignment; invite/discovery scope is currently too broad.

**Update:** The implementation direction uses a **two-layer model** (global master switches in profiles + club-scoped overrides in club_identities). See `Naming_Simplification_and_Club_Preferences_Plan.md` for the authoritative model. This note describes the original gap; the solution is to extend `club_identities` with override columns, not replace global profile flags.

---

## 1. Problem

The current model lacks **per-club per-user settings**. For each user inside each club context, we need settings such as:

- Whether the user wants to be **shown in that club** (discovery / roster visibility)
- Whether the user **accepts invites** in that club context
- Potentially other club-specific discovery/invite preferences

**Current issue:** The system effectively includes all club members in invite/discovery scope too broadly. There is no way for a user to opt out of being discoverable or inviteable within a specific club.

---

## 2. What Is Missing Today

| Area | Current behavior | Gap |
|------|------------------|-----|
| **Discovery** | `rpc_club_members_discovery` returns all club members. | No per-club opt-out for "don't show me in this club". |
| **Invite targets** | `rpc_match_admission_targets` / `rpc_match_invite_targets` include users in scope groups or share groups. | No per-club "don't invite me in this club" preference. |
| **Profile** | `profiles` has global display_name, avatar, etc. | No club-scoped visibility or invite-acceptance flags. |

---

## 3. Proposed Minimal Data Model

### 3.1 New table: `club_member_preferences`

| Column | Type | Description |
|--------|------|--------------|
| `id` | uuid | PK |
| `club_id` | uuid | FK clubs |
| `user_id` | uuid | FK profiles (auth.users) |
| `visible_in_club` | boolean | Default `true`. If `false`, exclude from club discovery / invite target lists in this club. |
| `accept_invites_in_club` | boolean | Default `true`. If `false`, exclude from invite/nominate target lists in this club (or treat as "do not invite"). |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Unique constraint:** `(club_id, user_id)` — one row per user per club.

**RLS:** User can read/write only their own rows (`user_id = auth.uid()`).

**Note:** User must be a club member (or have club_identity) to have a row. Creation can be on-demand when user first joins club or first visits club settings.

### 3.2 Alternative: extend `club_identities`

If `club_identities` already links user↔club, we could add columns there instead of a new table:

- `visible_in_club` (boolean, default true)
- `accept_invites_in_club` (boolean, default true)

**Trade-off:** Keeps one row per user-club, but mixes identity (handle) with preferences. A separate table keeps concerns separated and allows preferences even if identity is optional.

---

## 4. How This Differs From Global Profile Settings

| Aspect | Global profile | Per-club preferences |
|--------|----------------|----------------------|
| **Scope** | Applies everywhere | Applies only within a specific club |
| **Example** | "Display name", "Avatar" | "Don't show me in Club X", "Don't invite me in Club Y" |
| **Storage** | `profiles` | `club_member_preferences` (or `club_identities` extension) |

A user might want to be discoverable in Club A but not in Club B. Global profile cannot express that.

---

## 5. Read-Model Filtering Changes

| RPC / View | Change |
|------------|--------|
| `rpc_club_members_discovery` | Exclude users where `club_member_preferences(club_id, user_id).visible_in_club = false` (or no row → default true). |
| `rpc_match_admission_targets` / `rpc_match_invite_targets` | When resolving targets from club/scope, exclude users where `accept_invites_in_club = false` for the relevant club. Match's club comes from `matches.club_id` or organizer's primary club. |
| `rpc_match_nominate_targets` | Same: exclude users who have `accept_invites_in_club = false` in the club context of the match. |

**Edge case:** Matches without `club_id` — need a rule (e.g. use organizer's primary club, or skip preference filter when no club).

---

## 6. What Should Remain Out of Scope (For Now)

- **Group-level preferences** — e.g. "don't show me in Group X" — not in this slice.
- **Match-type preferences** — e.g. "don't invite me to doubles" — not in this slice.
- **Notification preferences** — e.g. "don't email me for Club Y invites" — separate concern.
- **UI for editing preferences** — design only; implementation deferred.
- **Migration strategy** — how to backfill defaults for existing club members — deferred.

---

## 7. Implementation Order (When Implemented)

1. Add `club_member_preferences` table (or extend `club_identities`).
2. Add RLS.
3. Update `rpc_club_members_discovery` to filter by `visible_in_club`.
4. Update `rpc_match_admission_targets` (and wrappers) to filter by `accept_invites_in_club` for the match's club.
5. Add minimal UI: club settings page or profile → "Visibility in [Club]" toggle.

---

## References

- `Match_Participation_Flows_and_Scope.md`
- `Phase1_Read_Model_Alignment.md`
- `rpc_club_members_discovery`, `rpc_match_admission_targets`
