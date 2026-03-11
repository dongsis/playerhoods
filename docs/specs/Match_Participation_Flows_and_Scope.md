# Match Participation: Invite, Nominate, Confirm, Accept, Remove — Flows & Scope

**Status:** Authoritative reference (align with v1.6.3 + v1.7 guest/nominate behaviour)  
**Last updated:** 2026-03 (post re-entry via nominate, delegate confirm, guest flows)

---

## 1. Scope & helper definitions

### 1.1 Match-level scope

| Term | Definition | Used for |
|------|------------|----------|
| **invitation_scope_group_ids** | `matches.invitation_scope_group_ids` — array of group IDs. Can be empty/NULL. | Who can be invited (target), who can request join, who can see invite/nominate targets. |
| **is_user_in_scope_groups(scope_group_ids, user_id)** | True iff user is an **active** member of at least one of the given groups. | Target eligibility (invite/request_join); caller eligibility (nominate targets). |
| **is_caller_in_match_scope(match_id)** | `is_user_in_match_scope(match_id, auth.uid())`. | RLS, UI “in scope” for match. |
| **is_user_in_match_scope(match_id, user_id)** | True iff `invitation_scope_group_ids` is non-empty and `is_user_in_scope_groups(invitation_scope_group_ids, user_id)`. | Whether a user is “in scope” for that match. |

### 1.2 Association & share group

| Term | Definition | Used for |
|------|------------|----------|
| **is_user_match_associated(match_id, user_id)** | True iff user has a **non-removed** participant row (pending or confirmed). Removed participants are **not** match-associated. | Caller gates (nominate, delegate confirm), target lists (nominate_targets), “already a participant” checks. |
| **is_caller_match_associated(match_id)** | `is_user_match_associated(match_id, auth.uid())`. | RLS, UI “match associated”. |
| **do_users_share_group(user_a, user_b)** | True iff both are active members of at least one **friend** group (`group_kind = 'friend'`). Club groups do **not** count. | Nominate/delegate-confirm **target**: caller may only nominate/delegate-confirm users in a shared friend group. Invite **target**: organizer may invite if target in scope OR share group with organizer. |
| **sharegroup_exists(user_a, user_b)** | Same idea as `do_users_share_group` (used in RLS). | RLS: who can see pending invited/nominated rows. |

### 1.3 Organizer & confirmation helpers

| Term | Definition |
|------|------------|
| **is_match_organizer(match_id, user_id)** | `matches.organizer_id = user_id`. |
| **is_caller_confirmed_in_match(match_id)** | Caller has a **confirmed** participant row. Used in RLS so confirmed participants can see certain pending rows. |

---

## 2. Entry points (how a user/guest gets into a match)

| Action | RPC | Caller | Target | Scope / gates | Re-entry (removed → active)? | Result (join_method, timestamps) |
|--------|-----|--------|--------|----------------|------------------------------|-----------------------------------|
| **Invite (user)** | `rpc_match_invite_user` (organizer wrapper → `rpc_match_admit_user`) | **Organizer only** | User | Target: **InScope(target) OR ShareGroup(target, organizer)**. No scope required for organizer to invite. | **Yes.** Re-entry: clear removed_at, set join_method=invited, **org_approved_at=now()**; participant_accepted_at=NULL → user must Accept to confirm. | invited; org_approved_at set; participant_accepted_at NULL → pending until user Accept. |
| **Request join** | `rpc_match_request_join` | User (self) | — | Caller must be **InScope(caller)** (match must have non-empty scope; caller in one of those groups). | **Yes.** Re-entry: clear removed_at, join_method=requested, participant_accepted_at=now(); org_approved_at=NULL → pending until org Approve. | requested; participant_accepted_at set; org_approved_at NULL → pending until org Approve. |
| **Nominate (user)** | `rpc_match_nominate_user` | **Non-organizer** + match.can_participants_invite_users + **(InScope(caller) OR MatchAssociated(caller))** | User | Target: **ShareGroup(target, caller)** only; target ≠ caller; target **not** match-associated (so removed is OK — we re-entry). | **Yes.** Re-entry: clear removed_at, join_method=nominated, nominated_by=caller; participant_accepted_at=NULL, org_approved_at=NULL. | nominated; both timestamps NULL → pending until user Accept **and** org Approve (order arbitrary). |
| **Nominate (guest / Contact Player)** | `rpc_match_nominate_guest` | **Organizer OR MatchAssociated** | Guest (from caller’s roster) | Guest in caller’s `user_roster_guests`; guest active. | N/A (no “removed” re-entry for guest in same row; duplicate active guest rejected). **Organizer:** org_approved_at only (auto org confirm); participant_accepted_at NULL → guest pending until "Confirm can come". **Non-org:** org_approved_at NULL → pending until delegate_confirm_participant + org Approve. | nominated; organizer auto-approves; guest stays pending until delegate_confirm. |

---

## 3. Confirm / Accept (getting to confirmed)

Unified invariant: **confirmed ⇔ participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL**. Status is derived by `match_participant_reconcile_status` only.

| Action | RPC | Caller | Target / row | Effect | Note |
|--------|-----|--------|--------------|--------|------|
| **Accept (user)** | `rpc_match_accept_invite` | Participant (self) | Own row | Sets participant_accepted_at=now(), participant_accepted_via=in_app. Reconcile → confirmed if org_approved_at already set. | For invited/nominated/requested; also used to re-confirm after match detail change. |
| **Approve (org)** | `rpc_match_org_approve_participant` | **Organizer only** | Any pending participant (user or guest) | Sets org_approved_at (and org_approved_by). Reconcile → confirmed if participant_accepted_at already set. | **Order-free:** org can Approve first or user Accept first. |
| **Manual confirm (org, existing row)** | `rpc_match_manual_confirm` | **Organizer only** | Pending **user** participant row | Sets participant_accepted_at + org_approved_at (and via=manual). Reconcile → confirmed. | One-click full confirm for user. For guest use Approve + delegate_confirm_participant. |
| **Manual confirm user (by id)** | `rpc_match_manual_confirm_user` | **Organizer only** | User not yet in match (by user_id) | Inserts or re-entries, sets both timestamps → confirmed. | Alternate entry path (scope: InScope(target) OR ShareGroup(target, org)). |
| **Delegate confirm (participant)** | `rpc_match_delegate_confirm_participant` | **User:** Non-org, InScope or MatchAssociated, ShareGroup(caller, participant). **Guest:** Any active participant (incl. organizer) | Pending **user** (invited/nominated) or **guest** participant row | Sets participant_accepted_at=now(), participant_accepted_via=delegate_manual. **Does not** set org_approved_at. Guest branch emits `match.guest_delegate_confirmed`. | Single entry point for both user and guest. User needs org Approve; guest needs org Approve. |

---

## 4. Remove

| Action | RPC | Caller | Target | Effect |
|--------|-----|--------|--------|--------|
| **Remove participant** | `rpc_match_remove_participant` | **Organizer only** (or policy that allows “manager”) | Any non-removed participant row | Sets removed_at, removed_by. Reconcile → status=removed, confirmed_at=NULL. |
| **User withdraw** | `rpc_match_user_withdraw` | Participant (self) | Own row | Sets removed_at, removed_by=self. Reconcile → removed. |

After remove, **re-entry** is allowed only via:
- **User:** `rpc_match_request_join` (if in scope) or `rpc_match_invite_user` (organizer; wrapper around `rpc_match_admit_user`) or **`rpc_match_nominate_user`** (same-group non-org; re-entry supported).
- **Guest:** No “removed” state re-use; new nominate only.

---

## 5. Target RPCs (who can be invited / nominated)

| RPC | Returns | Caller gate | Who is in the list |
|-----|---------|-------------|--------------------|
| **rpc_match_admission_targets** | (user_id, display_name, avatar_url, club_handle, source, eligible, eligible_via, sort_name) | Organizer OR (can_participants_invite + InScope/MatchAssociated) | Reentry, invite_circle, club_members, groups. API maps to (user_id, display_name) for invite/nominate UI. |

---

## 6. RLS (match_participants visibility)

- **Organizer:** sees all rows.
- **Self:** sees own row (user_id = auth.uid()).
- **Others:** see a row if: status=confirmed (and caller in scope or share group with org or match-associated), **or** additional policies:
  - Pending **invited** user, sharegroup_exists(caller, user_id), caller confirmed in match, (in scope or match-associated).
  - Pending **nominated** user, sharegroup_exists(caller, user_id), (in scope or match-associated).
  - Pending **guest**, caller confirmed in match, (in scope or match-associated).

So: confirmed participants see other confirmed; confirmed participants who share a group with a pending invited/nominated user see that user; confirmed see pending guests.

---

## 7. Match detail change (reconfirm)

When match date / time / duration / club_id / court_ids change:

- **fn_match_detail_change_reconfirm** clears, for all **confirmed** non-removed participants **except the organizer**: participant_accepted_at, participant_accepted_via, manual_confirmed_by, confirmed_at. org_approved_at **preserved**. Reconcile → status pending. Applies to **both user and guest** participants.

---

## 8. Summary table (caller → action)

| Caller | Can invite user | Can nominate user | Can request join | Can Accept | Can Approve | Can Manual confirm | Can Delegate confirm (participant) | Can Remove |
|--------|------------------|--------------------|-------------------|------------|------------|--------------------|-----------------------------------|------------|
| **Organizer** | ✓ (invite_user) | ✗ | ✗ | ✓ (own) | ✓ | ✓ (user row) | ✓ (guest only; user uses manual) | ✓ |
| **Non-org, in scope or match-associated** | ✗ | ✓ (if can_participants_invite_users) | ✓ (if in scope) | ✓ (own) | ✗ | ✗ | ✓ (user: share group; guest: any) | ✗ |
| **Participant (self)** | — | — | — | ✓ (own) | — | — | — | — | ✓ (withdraw) |

---

## 9. Documents to update

After this flow doc is in place, update:

1. **docs/specs/PlayerHoods_v1.6.3_Consolidated_Master_Spec.md**  
   - Add explicit note that **nominate supports re-entry** (removed → nominated).  
   - Optionally add a short “Entry & confirm matrix” referring to this doc.

2. **docs/specs/00_AUTHORITATIVE_INDEX.md**  
   - In “Restart Doctrine”, add: **Re-entry also allowed via rpc_match_nominate_user** (non-org, same ShareGroup). So restart channels are: request_join, invite_user, **nominate_user** (for removed user).

3. **docs/db/FACTS_functions.md**  
   - For each RPC in §2–§5, ensure **Notes** mention: caller gate, target scope, re-entry yes/no, and “Order-free: org Approve and user Accept in any order” where relevant.  
   - Add **rpc_match_nominate_guest**, **rpc_match_delegate_confirm_participant** (single entry for user + guest), **setMatchCourts** (if you document API).  
   - **is_user_match_associated**: note “excludes removed”.

4. **docs/db/FACTS_tables.md**  
   - **match_participants**: confirm join_method values (invited, requested, nominated, manual, guest_add, etc.) and that confirmation is unified (participant_accepted_at + org_approved_at).  
   - **match_participant_actions**: add action_type values used in v1.7 (e.g. nominate_guest, delegate_manual_confirm, reenter).

5. **This file (Match_Participation_Flows_and_Scope.md)**  
   - Keep as the single place for “who can do what, with which scope, and re-entry rules”. Link to it from FACTS and from the Master Spec.
