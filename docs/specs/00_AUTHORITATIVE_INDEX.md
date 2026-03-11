Authoritative Index for PlayerHoods Database
PlayerHoods Database Governance Contract
1. Authority Hierarchy

This document is the highest authority for DB behavior and DB-facing implementation governance.

PlayerHoods v1.6.3 Consolidated Master Spec is authoritative for domain rules.

Play Network Core / Five Pillars implementation decisions are authoritative for Phase 1 discovery, invite, and relationship-entry behavior when explicitly incorporated into this document.

db_schema.sql reflects implementation but may contain drift.

When conflicts exist:

v1.6.3 + this document override db_schema.sql

Implementation must be aligned via append-only migration

Where this document contains Phase 1 authoritative decisions not yet reflected in schema, schema must be brought into alignment via append-only migration and validation

2. Core Invariants (Non-Negotiable)
2.1 Unified Confirmation Invariant

A participant (user OR guest) is confirmed if and only if:

participant_accepted_at IS NOT NULL

AND

org_approved_at IS NOT NULL

No exceptions. Guests are not exempt.

2.2 Status Is Derived — Never Written

status is a derived state.

public.match_participant_reconcile_status(p_mp_id) is the sole authority and dictates participant status based on acceptance timestamps.

No RPC, trigger, or migration may directly set status = 'confirmed'.

2.3 Deprecated Fields

The following fields are deprecated:

user_accepted_at

matches.admission_mode

They may exist for backward compatibility but:

MUST NOT be used in logic

MUST NOT be read inside reconcile

MUST NOT be used in new migrations

2.4 Restart Doctrine

Re-entry is permitted through:

rpc_match_request_join (user restart; caller in scope)

rpc_match_invite_user (organizer restart; thin wrapper around rpc_match_admit_user)

rpc_match_nominate_user (non-organizer, same ShareGroup; re-activates removed user as nominated)

Delegate-confirm does not itself re-entry; re-entry is via rpc_match_request_join, rpc_match_invite_user, or rpc_match_nominate_user.

Full flows and scope: see Match_Participation_Flows_and_Scope.md.

2.5 ShareGroup Boundary

ShareGroup trust applies ONLY to:

groups.group_kind = 'friend'

Club groups never imply trust equivalence.

3. Play Netw

The following decisions are authoritative for Play N and must govern all

3.

Invite Circle is a private, one-way personal list owned by the saving use

Saving a user to Invite Circle does not notify the target user.

Saving to Invite Circle does not itself create trust, membership, admissi

Invite Circle is a convenience layer for future discovery-to-invite workflows, not a substitute for match partic

3.2 Club Members Is a Disco

Club Members is a discovery surface.

Presence in Club Members means the user is discoverable within the relevant club/member-discovery context.

Presence in Club Members does not imply:

trust equivalence

group membership

invite permission

match participation eligibility by itself

Discovery and permission are distinct concepts and MUST remain distinct in schema and logic.

3.3 Groups Remain Valid but Are No Longer the Sole Invite Entry Path

Groups remain valid long-lived social/organizational containers.

However, groups are not the sole entry path for inviting users into matches.

Match invite flows must support direct invite paths originating from:

Group relationships

Club Members discovery

Invite Circle

Implementation MUST NOT assume that all legitimate match invites originate from group membership.

3.4 Match Invite Must Support Direct Invite from Club Members / Invite Circle

A match invite may originate directly from Club Members discovery or Invite Circle selection, subject to permission predicates.

Database logic must support direct invite without requiring prior group creation.

Existing match participation lifecycle invariants still apply after invite creation; direct-invite entry does not weaken acceptance / organizer approval requirements.

3.5 Non-Group Invite Permission Is Controlled Explicitly

Whether a user may be invited outside pre-existing group trust must be governed explicitly by profile-level permission controls.

The authoritative Phase 1 control is:

profiles.allow_non_group_invites

Discovery visibility and non-group invite permission are separate axes and MUST NOT be conflated.

That means:

a user may be discoverable but not inviteable via non-group path

a user may allow non-group invites without any implication of ShareGroup trust

3.6 Discoverability and Invitation Permission Are Separate Axes

The system MUST preserve a strict distinction between:

discoverability: whether a user can be surfaced in Club Members / discovery

invitation permission: whether a user may be invited via a specific path

Authoritative Phase 1 discovery control:

profiles.show_in_club_member_discovery

Authoritative Phase 1 non-group invite control:

profiles.allow_non_group_invites

No migration, policy, or RPC may collapse these into a single implied permission.

4. Permission Architecture Requirements

To prevent drift, all new invite / discovery / match-entry logic must follow a three-layer structure:

4.1 Layer A — RPC / Action Layer

RPCs may:

validate parameters

call authoritative permission predicates

perform writes

emit domain events

log actions

invoke reconcile where required

RPCs MUST NOT become the primary home of scattered business-permission logic.

4.2 Layer B — Permission Predicate Layer (can_*)

Business-action permission decisions should be centralized in a small set of authoritative predicate functions, for example:

can_invite_user_to_group(...)

can_nominate_user_to_match(...)

can_delegate_confirm(...)

can_view_match_participants(...)

can_manage_match_participants(...)

These functions express final business permission conclusions.

4.3 Layer C — Helper / Fact Layer

Predicate functions may compose smaller helper functions such as:

is_match_organizer(...)

is_user_in_match_scope(...)

is_user_match_associated(...)

do_users_share_group(...)

is_group_active_member(...)

is_match_participant_confirmed(...)

Helper functions express facts, not final action permission decisions.

4.4 Required Separation

helper functions = fact predicates / reusable truth units

can_* functions = action-level permission predicates

RPCs = orchestration only

This separation is mandatory for new Play Network Core work and strongly preferred for refactors of existing invite / participation flows.

5. Migration Writing Principles

All migrations are append-only.

Existing migration files must never be modified.

No migration may introduce:

direct status = 'confirmed'

logic dependent on deprecated fields

implicit trust via club groups

implicit invite permission purely from discovery visibility

implicit equivalence between Invite Circle membership and participation / approval state

All invariant changes must preserve data consistency.

All Phase 1 discovery/invite migrations must preserve the distinction between:

discovery

relationship convenience

permission

participation state

6. Mandatory Pre-Migration Checklist

Before generating SQL, the Agent MUST:

Read and acknowledge this file (00_AUTHORITATIVE_INDEX.md)

Confirm alignment with PlayerHoods v1.6.3 Consolidated Master Spec

Confirm alignment with the Play Network Core Authoritative Decisions in this file

Inspect current schema (db_schema.sql and/or migrations)

Explicitly describe:

what invariant or authoritative rule is affected

risk to existing data

backfill plan

validation query

whether the migration affects:

discovery

invite permission

participation lifecycle

trust boundary

No SQL may be generated before this checklist is satisfied.

7. Mandatory Requirements for Each Migration PR

Each migration PR must include:

migration SQL file

FACTS patch (or regenerate)

at least 3 validation SQL queries covering:

structure

permission / policy behavior

data-state correctness

For migrations affecting Play Network Core, validation must also cover whichever are applicable:

discovery visibility

non-group invite permission

direct invite path from Club Members / Invite Circle

preservation of confirmation invariant

absence of implicit trust from club membership

No migration PR is complete without these validations.

8. Implementation Notes for Phase 1

For Phase 1 Play Network Core work, the preferred implementation order is:

freeze authoritative rules

add minimal schema support

add minimal helper functions

add minimal can_* predicate layer

update / add RPCs

wire UI/API surfaces

validate end-to-end flows

The minimum authoritative Phase 1 data controls are expected to include:

profiles.show_in_club_member_discovery

profiles.allow_non_group_invites

profiles.auto_add_played_users_to_invite_circle

user_invite_circle

These are authoritative targets for implementation alignment, even if not yet present in current schema.

9. Interpretation Rule

If implementation behavior appears valid in current schema but conflicts with:

the confirmation invariant

ShareGroup boundary

Play Network Core authoritative decisions

explicit profile-based permission controls

the separation between discovery and invite permission

then the implementation is considered drift and must be corrected via append-only migration.