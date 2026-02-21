1️⃣ MatchContract_v1.5.md
MatchContract v1.5

Authoritative Scope: Match behavior, participant lifecycle, scope integrity
Supersedes: MatchContract v1.4
Status: Active

1. Scope Rules
1.1 Invitation Scope

Field:

matches.invitation_scope_group_ids uuid[]

Rules:

Defines authoritative boundary of eligible participants.

No fallback allowed.

Scope applies to:

invite

nominate

request_join

manual_confirm

1.2 Scope Prohibitions

Forbidden:

Organizer group fallback

Platform-wide user listing

Venue-wide implicit inclusion

Any "reactivate" flow

2. Participant Entry Methods

Field:

join_method text

Allowed values:

invited

requested

nominated

manual

3. Participant Confirmation Model

Fields:

participant_accepted_at timestamptz

participant_accepted_via text ('in_app' | 'manual')

org_approved_at timestamptz

confirmed_at timestamptz (reconcile only)

removed_at timestamptz

3.1 Confirmation Rule

A participant is confirmed if:

removed_at IS NULL
AND participant_accepted_at IS NOT NULL
AND org_approved_at IS NOT NULL

confirmed_at must be written by reconcile only.

3.2 Reconfirm Policy

When match details change:

participant_accepted_at = NULL

confirmed_at = NULL

org_approved_at preserved

Manual-confirmed users trigger dual notification.

4. Removal

Removal sets:

removed_at = now()
confirmed_at = NULL

Re-entry allowed only via:

rpc_match_invite_user

rpc_match_request_join

5. Visibility Contract

Confirmed:

Visible to scope members

Pending:

Organizer sees full list

Others see count only

Removed:

Organizer only

6. Reconcile Responsibility

Reconcile function is the only authority allowed to:

Set confirmed_at

Clear confirmed_at on removal/reset

No RPC may write confirmed_at directly.