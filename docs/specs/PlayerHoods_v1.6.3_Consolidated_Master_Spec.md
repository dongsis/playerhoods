# PlayerHoods v1.6.3 --- Consolidated Master Specification (Authoritative)

Status: FINAL / AUTHORITATIVE\
Effective Version: v1.6.3\
Generated On: 2026-03-02 UTC

------------------------------------------------------------------------

# 0. Version Authority Rule

If any conflict exists between historical documents (v1.2--v1.4) and
v1.6.x:

Higher version prevails.

v1.6.3 \> v1.6.2-lite \> v1.6.1 \> v1.5 \> v1.4 \> v1.3 \> v1.2

All overridden clauses are considered deprecated and non-authoritative.

------------------------------------------------------------------------

# 1. Core Architectural Principles

## 1.1 Statuses Are Not Workflows

match_participants.status is terminal summary only.

Allowed values (frozen): - pending - confirmed - removed

No additional status values permitted in v1.x.

All workflow is expressed via explicit fields and reconciliation logic.

------------------------------------------------------------------------

# 2. Participation Identity Model

## 2.1 Exactly-One Identity Invariant

A participant must satisfy:

Exactly one of: - user_id IS NOT NULL - guest_id IS NOT NULL

Never both. Never neither.

This must be enforced via database CHECK constraint.

------------------------------------------------------------------------

# 3. Unified Confirmation Invariant (Authoritative)

Effective confirmation is identical for user and guest:

participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL

Confirmed status must only be produced by reconciliation logic.

No RPC may directly set status='confirmed'.

------------------------------------------------------------------------

# 4. Confirmation Field Semantics

participant_accepted_at: - Represents participant-side consent. - For
users: in-app or delegated/manual. - For guests: always
delegated/manual.

participant_accepted_via: - 'in_app' - 'manual' - 'delegate_manual'

org_approved_at: - Represents roster approval by organizer.

confirmed_at: - Snapshot timestamp written only by reconciliation.

------------------------------------------------------------------------

# 5. Restart Doctrine (Inherited from v1.3, Still Authoritative)

Restart channels only:

User → rpc_match_request_join Organizer → rpc_match_invite_user

No branching on: - removed_by - previous join_method - previous
confirmation state

On restart: - removed_at = NULL - removed_by = NULL - removal_note =
NULL

Scope required only for first-entry request (mp == NULL).

------------------------------------------------------------------------

# 6. Nominate Logic (v1.6.1 Refactor, v1.7 Re-entry)

Caller gate: - caller != organizer - match.status = 'active' -
match.can_participants_invite_users = true - (InScope OR
MatchAssociated)

Target gate: - ShareGroup(target, caller) - target != caller - not
already active participant (is_user_match_associated = false; removed
users are not associated, so re-entry via nominate is allowed)

Nominate result: - join_method = 'nominated' - participant_accepted_at =
NULL - org_approved_at = NULL - status = pending (or re-entry: clear
removed_at, same fields)

Requires both user accept and org approval (order arbitrary).

For full flows (invite, nominate, confirm, accept, remove) and scope
definitions, see **Match_Participation_Flows_and_Scope.md**.

------------------------------------------------------------------------

# 7. Manual Confirm Modes

## 7.1 Organizer Manual Confirm

Writes: - participant_accepted_at = now() - participant_accepted_via =
'manual' - org_approved_at = now()

Reconcile → confirmed.

## 7.2 Delegated Manual Confirm

Writes: - participant_accepted_at = now() - participant_accepted_via =
'delegate_manual'

Must NOT write org_approved_at.

Status remains pending until organizer approval.

------------------------------------------------------------------------

# 8. Match Detail Change Reconfirmation

When match date/time/location/duration changes:

For all confirmed participants (user AND guest):

-   participant_accepted_at = NULL
-   confirmed_at = NULL
-   status → pending

org_approved_at remains unchanged.

Guests are NOT exempt.

------------------------------------------------------------------------

# 9. Sports Dimension (v1.6.3)

## 9.1 sports table

Dictionary of supported sports.

## 9.2 matches.sport_id

Required. Every match has exactly one sport.

## 9.3 groups.primary_sport_id

Friend groups SHOULD set. Club groups MAY be NULL.

## 9.4 user_sports & guest_sports

Used for filtering and personalization only. Do not affect trust
boundaries.

------------------------------------------------------------------------

# 10. Club Hub (Option A)

## 10.1 groups.group_kind

Values: - friend - club

## 10.2 ShareGroup Trust Boundary

ShareGroup applies ONLY to groups where group_kind='friend'.

Club groups never grant trust equivalence.

## 10.3 Club Identity Overlay

club_identity table provides alias display inside club context.

display_name is independent global identity.

Club handles are optional overlays, not mandatory identity roots.

------------------------------------------------------------------------

# 11. Personal Roster (v1.6.2-lite)

Contact Player = guests table.

Personal Roster = user_roster_guests (bookmark layer).

Roster does not imply governance or ownership.

------------------------------------------------------------------------

# 12. Removed Semantics

removed status represents: - organizer rejection - participant
withdrawal - admin removal

Restart uses unified doctrine. No reactivate RPC permitted.

------------------------------------------------------------------------

# 13. Deprecated / Superseded Clauses

The following are deprecated:

-   Guest confirmed via org_approved_at only (v1.3 rule)
-   user_accepted_at field
-   admission_mode logic
-   Strong club-handle-as-identity requirement (v1.4)

------------------------------------------------------------------------

# 14. Global Invariants

✔ Exactly-one identity enforced\
✔ Confirmation unified for user and guest\
✔ Only organizer can produce immediate confirmed\
✔ Delegated confirm never sets org_approved_at\
✔ ShareGroup excludes club groups\
✔ Status remains three-state\
✔ No implicit workflow encoding in status

------------------------------------------------------------------------

# END OF AUTHORITATIVE SPEC
