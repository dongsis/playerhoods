Schema_Reference_v1.5.md
Schema Reference v1.5

Authoritative Schema Snapshot
Match & Participant Related Tables

Table: matches
Field	Type	Notes
id	uuid	PK
organizer_id	uuid	FK users
invitation_scope_group_ids	uuid[]	authoritative boundary
start_at	timestamptz	
duration_minutes	int	
venue_id	uuid	FK venue
Table: match_participants
Field	Type	Description
id	uuid	PK
match_id	uuid	FK matches
user_id	uuid nullable	FK users
guest_id	uuid nullable	FK guests
join_method	text	invited/requested/nominated/manual
participant_accepted_at	timestamptz	participant side confirmation
participant_accepted_via	text	in_app/manual
org_approved_at	timestamptz	organizer approval
confirmed_at	timestamptz	reconcile-only
removed_at	timestamptz	removal timestamp
manual_confirmed_by	uuid nullable	who performed manual confirm
Invariants

confirmed_at must be null if:

removed_at is not null

participant_accepted_at is null

org_approved_at is null

participant_accepted_via required if participant_accepted_at not null.

join_method immutable after confirmed.

No direct write to confirmed_at outside reconcile.