1️⃣ System_Blueprint.md
PlayerHoods v1.5 — System Blueprint

Authoritative Version: v1.5
Supersedes: v1.4
Status: Active

1. Governance Principles
1.1 No Reactivate Policy

There is no independent “reactivate” flow in v1.5.

Removed participants may re-enter only via:

rpc_match_invite_user

rpc_match_request_join

UI, API, RPC, RLS, and documentation must not expose any “reactivate” mechanism.

Action logs must record re-entry as:

invite

request_join

2. Scope Integrity Principle
2.1 Invite Scope is Authoritative

matches.invitation_scope_group_ids defines the only valid invite scope.

No fallback allowed to:

Organizer’s other groups

Platform-wide users

Club-wide user list

Any implicit scope expansion

Invite scope and request scope are equivalent in boundary.

3. Participant Lifecycle Model

Defined in Confirm_Model.md

4. Match Visibility Model

Defined in Match_Model.md

5. Identity & Presentation Model

Defined in Identity_Model.md

6. Discoverability Framework

Defined in Discoverability_Framework.md

7. Reconfirm Policy

If match details change (date, time, duration, venue):

All confirmed participants reset to pending reconfirmation.

participant_accepted_at = NULL

confirmed_at = NULL

org_approved_at remains unchanged.

Reconfirm cannot be bypassed.