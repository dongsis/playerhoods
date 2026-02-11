> **Superseded**  
> This document has been superseded by the v1.3 release.  
> Please refer to the corresponding `*_v1.3.md` document for the authoritative version.

# Match Invitation & Registration Spec v1.2

## [v1.3] Admission & Removal Semantics Update
This document is governed by **Match Admission Semantics v1.3**:
- **Request** is group-based (scope groups only), not individual-based.
- **Invite / Nominate** target individuals and are not restricted by scope.
- **Removed** is inactive but reversible; re-entry occurs by **reactivating the same participant record**.
- If removed by **ORG**, re-entry requires **ORG reactivation** before user can accept.
- Removed users within scope may see a rejoin / waiting entry.
See: `docs/governance/Execution_State_Addendum_v1.3.md`


Status: Frozen (Authoritative)
Applies to: playerhoods.com v1.2
Last updated: 2026-02-XX

## 1. Scope & Goals

This document defines the authoritative rules for how participants (users and guests) join a match, how confirmations are handled, and how final participation is determined.

Design goals:

Avoid status explosion

Support dual-sided confirmation (user + organizer)

Allow parallel (non-sequential) confirmation

Preserve fast flows for common cases

Keep match_participants.status limited to three values only

## 2. Core Data Model
### 2.1 match_participants.status (Frozen)

Allowed values (unchanged):

pending

confirmed

removed

No additional status values are allowed in v1.x.

### 2.2 Dual Confirmation Fields (v1.2)

The following fields are used to express confirmation without introducing new statuses:

user_accepted_at timestamptz null
Indicates the user has confirmed availability.

org_approved_at timestamptz null
Indicates the organizer has approved the participant.

(Optional, recommended)
org_approved_by uuid null

### 2.3 Effective Confirmation (Derived Rule)

- A participant is effectively confirmed if:

> User participant (user_id is not null):

user_accepted_at IS NOT NULL
AND
org_approved_at IS NOT NULL


> Guest participant (guest_id is not null):

org_approved_at IS NOT NULL


- When effective confirmation becomes true, the system must set:

status = 'confirmed'


- If not effectively confirmed:

status = 'pending'


status = 'removed' is terminal.

## 3. Join Paths (Authoritative)
3.1 Join Method Enum (Frozen)

The following join_method values are used:

> created

> invited

> requested

> guest_added

No new join_method values are introduced in v1.2.

## 4. Authoritative Join & Confirmation Table (v1.2)
Path	Actor	join_method	Initial status	user_accepted_at	org_approved_at	Who confirms	Final confirmation condition
Match created	ORG (system)	created	confirmed	null	now()	N/A	immediate
ORG invites user	ORG	invited	pending	null	now()	User (self)	user accepts
User accepts invite	User	invited	pending	now()	already set	User	confirmed
User requests join	User	requested	pending	now()	null	ORG	ORG approves
ORG approves request	ORG	requested	pending	already set	now()	ORG	confirmed
MP nominates user	MP (allowed)	requested	pending	null	null	User + ORG	user accepts + ORG approves
ORG adds guest	ORG	guest_added	confirmed	N/A	now()	N/A	immediate
MP adds guest	MP (allowed)	guest_added	pending	N/A	null	ORG	ORG approves
ORG rejects any pending	ORG	any	→ removed	unchanged	unchanged	ORG	terminal
User withdraws	User	any	→ removed	unchanged	unchanged	User	terminal
## 5. Key Semantics (Non-Negotiable)
- 5.1 Request Join = User Already Accepted

When a user performs Request Join:

The system must set user_accepted_at = now()

This represents:

“I want to join AND I confirm I can attend.”

There is no additional user accept step required.

- 5.2 Parallel Confirmation Is Allowed

User acceptance and organizer approval do not require ordering

Either side may act first

Confirmation is evaluated via derived rules

- 5.3 Organizer Rejection Preempts User

If the organizer rejects a participant:

status is set to removed

The participant must not appear in user-facing pending lists

No further confirmation actions are possible

- 5.4 Guest Semantics

Guests do not have user_accepted_at

Guest participation is confirmed only by organizer approval

MP-added guests require organizer approval

ORG-added guests are confirmed immediately

## 6. Capabilities Interaction (Summary)

Capabilities do not change confirmation semantics:

can_add_participants
Allows MP to create pending participants only
(never auto-confirmed)

can_remove_participants
Allows removal of pending or confirmed participants

Organizer authority always supersedes participant capabilities.

## 7. Invariants (v1.2)

The following are global invariants:

status is not a workflow engine

Confirmation logic must be field-based + derived

No new status values without v2

No sequential dependency between user and organizer confirmation

Rejected (removed) participants are terminal

## 8. Implications for Implementation
Backend

All confirmation logic must go through RPC

RPCs must call a reconciliation step to set status='confirmed' when conditions are met

Frontend

UI may show two independent indicators:

“User confirmed”

“Organizer approved”

“Confirmed participant” means both are satisfied

## 9. Versioning

v1.0: Single-sided confirmation


v1.2: Dual confirmation via fields (this document)

This document supersedes all prior Match Invitation & Registration specs.