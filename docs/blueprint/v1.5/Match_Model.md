2️⃣ Match_Model.md
Match Model v1.5
1. Visibility Rules
1.1 Confirmed Participants

Visible to:

Organizer

Scope members

Participants (pending + confirmed)

Confirmed list is the social anchor layer.

1.2 Pending Participants

Organizer:

Full list visible

Confirmed participants:

See count only

Pending participants:

See self + count

Non-participants:

See count only (if match visible)

UI must display:

Pending (3)

Expandable only by Organizer.

1.3 Removed Participants

Visible only to:

Organizer

The removed participant (self notice only)

Never shown to other participants.

2. Nominate Logic

Allowed nominators:

Organizer

Confirmed participant

Pending participant

Nominate semantics:

join_method = 'nominated'

Requires participant acceptance

Requires organizer approval

Enters confirmed via reconcile

No fallback beyond match scope.

3. Manual Confirm Flow

Manual confirm applies to:

User

Guest (non-user)

Manual confirm does not expand scope.

Manual confirm must:

Write action log

Record participant_accepted_via = 'manual'