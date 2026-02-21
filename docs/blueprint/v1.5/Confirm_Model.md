3️⃣ Confirm_Model.md
Confirm Model v1.5
1. Field Definitions

participant_accepted_at
participant_accepted_via
org_approved_at
confirmed_at

2. Responsibilities
2.1 participant_accepted_at

Meaning:
Participant side confirmation.

Applies to:

User (in_app or manual)

Guest (manual only)

2.2 participant_accepted_via

Values:

in_app

manual

2.3 org_approved_at

Organizer approval timestamp.

2.4 confirmed_at

Derived field.

Must be written only by reconcile logic.

Condition:

removed_at IS NULL
AND participant_accepted_at IS NOT NULL
AND org_approved_at IS NOT NULL

No RPC may directly write confirmed_at.

3. Reconfirm After Match Change

On match update:

participant_accepted_at = NULL
confirmed_at = NULL

org_approved_at remains.

Manual-confirmed participants trigger dual notification:

User

Manual confirmer

Either confirmation restores participant_accepted_at.