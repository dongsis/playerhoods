# TASK: Implement invitation notification/event architecture for playerhoods.com
# Scope: Email Magic Link Invite Flow v1 + emit event + event processor + delivery worker
# IMPORTANT: Follow existing project conventions. Append-only migrations only. Do not rewrite old logic unless necessary.

## 0. Goal

Implement the first working version of playerhoods.com invitation delivery architecture for:
- match invite via email
- magic link auth
- invitation landing page
- Accept / Decline flow

Architecture must use:

1. emit event
2. event processor
3. delivery worker

Do NOT implement “page directly sends email”.
Do NOT implement “click email link auto-accepts invitation”.

Magic link is only for email identity verification.
Final business confirmation must happen on invitation page via Accept / Decline.

---

## 1. Product rules to preserve

### 1.1 Required flow
Flow must be:

1. inviter creates invitation
2. system persists email invitation
3. system emits domain event
4. event processor creates notification + email delivery job
5. delivery worker sends email
6. invitee clicks View Invitation link
7. if not logged in, complete magic link auth
8. after auth, land on `/invitations/:id`
9. user explicitly clicks Accept or Decline
10. system writes result back to business object

### 1.2 Absolutely do not do
Do NOT:
- auto accept on email click
- auto confirm on magic link callback
- treat email click as final business confirmation
- allow wrong-email logged-in user to accept
- allow duplicate accept side effects

### 1.3 First version scope
Implement only:
- related_type = match
- email invitation
- invitation page
- Accept / Decline
- audit events
- magic link verification integration

Do NOT implement yet:
- group invite
- activity invite
- SMS
- push
- multi-email account merge
- multi-invitation combined inbox
- auto-accept flow

---

## 2. Architecture to implement

We want 3 layers:

### Layer A: emit event
Business actions emit domain events after transaction success.

### Layer B: event processor
Processor reads domain events and creates:
- user-visible notifications
- delivery records/jobs

### Layer C: delivery worker
Worker picks queued deliveries and actually sends email via Resend.

No direct email sending from page components.

---

## 3. Data model

Implement these new tables if not already present.

### 3.1 domain_events
Purpose: immutable business events

Suggested fields:
- id uuid pk
- event_type text not null
- aggregate_type text not null
- aggregate_id uuid not null
- actor_user_id uuid null
- payload jsonb not null default '{}'
- created_at timestamptz not null default now()

Indexes:
- (aggregate_type, aggregate_id)
- (event_type, created_at desc)

### 3.2 email_invitations
Purpose: invitation business object

Suggested fields:
- id uuid pk
- inviter_user_id uuid not null
- target_email text not null
- target_name text null
- related_type text not null   -- first version only 'match'
- related_id uuid not null
- status text not null default 'pending'
- magic_link_flow_status text not null default 'not_opened'
- accepted_by_user_id uuid null
- accepted_at timestamptz null
- declined_at timestamptz null
- expires_at timestamptz null
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

Suggested status domain:
- pending
- accepted
- declined
- expired
- canceled

Suggested magic_link_flow_status:
- not_opened
- opened
- verified_email
- landed

Indexes:
- (target_email)
- (related_type, related_id)
- (status, created_at desc)

### 3.3 email_invitation_events
Purpose: audit/debug trail for invitation state machine

Suggested fields:
- id uuid pk
- invitation_id uuid not null fk
- event_type text not null
- actor_user_id uuid null
- metadata jsonb not null default '{}'
- created_at timestamptz not null default now()

Suggested event_type values:
- invitation_created
- email_delivery_requested
- email_sent
- email_failed
- invitation_opened
- invitation_verified_email
- invitation_landed
- invitation_accepted
- invitation_declined
- invitation_expired

Index:
- (invitation_id, created_at asc)

### 3.4 notifications
If notification table already exists from notification MVP, reuse it.
Otherwise add:

- id
- user_id
- event_id
- notification_type
- priority
- title
- body
- data jsonb
- status
- read_at
- created_at

### 3.5 notification_deliveries
If already exists, reuse it.

Need fields at least:
- id
- notification_id
- channel   -- first version use 'email' and optionally 'in_app'
- provider  -- resend
- destination
- delivery_status -- queued/sending/sent/failed/skipped
- attempt_count
- last_attempt_at
- sent_at
- provider_message_id
- error_code
- error_message
- payload jsonb
- created_at

---

## 4. Domain events to support

Implement these event types.

### 4.1 invitation.email_invitation_created
When inviter creates a match invitation.

aggregate_type = 'email_invitation'
aggregate_id   = invitation.id

payload example:
{
  "invitation_id": "...",
  "related_type": "match",
  "related_id": "...",
  "target_email": "person@example.com",
  "target_name": "Alice",
  "inviter_user_id": "...",
  "inviter_display_name": "Nancy"
}

### 4.2 invitation.email_link_opened
When invitation link is opened the first time.

### 4.3 invitation.email_verified
When target email has completed magic link verification.

### 4.4 invitation.landed
When verified/logged-in user lands on invitation page.

### 4.5 invitation.accepted
When user clicks Accept successfully.

### 4.6 invitation.declined
When user clicks Decline successfully.

### 4.7 invitation.expired
Optional first version if implementing expiration job.

---

## 5. Event processor responsibilities

Implement a processor entry point like:

- processDomainEvent(eventId)

This processor should route by event_type.

### 5.1 For invitation.email_invitation_created
Must:
1. read invitation + inviter + related match summary
2. create audit row: email_delivery_requested
3. create notification record if appropriate
4. create notification_delivery row with:
   - channel = 'email'
   - provider = 'resend'
   - destination = target_email
   - delivery_status = 'queued'
   - payload containing invitation_id and email template data

Optional:
- create an internal in_app notification for inviter ("Invitation sent") only if trivial and low-risk
- otherwise skip inviter in-app for v1

### 5.2 For invitation.email_link_opened
Must:
- set email_invitations.magic_link_flow_status = 'opened' if still earlier state
- append email_invitation_events row
- be idempotent

### 5.3 For invitation.email_verified
Must:
- verify current authenticated user's email matches target_email
- set magic_link_flow_status = 'verified_email'
- append event row
- optionally store claimed/verified user reference if useful

### 5.4 For invitation.landed
Must:
- set magic_link_flow_status = 'landed' if appropriate
- append event row
- idempotent

### 5.5 For invitation.accepted
Must:
- append event row
- optionally create recipient notification(s) later if needed
- but first version priority is business write-through, not broad fan-out

### 5.6 For invitation.declined
Must:
- append event row
- update invitation state safely and idempotently

---

## 6. Delivery worker responsibilities

Implement worker entry point like:

- processQueuedNotificationDeliveries(limit?: number)

This worker should:
1. select queued email deliveries
2. lock rows safely
3. mark as sending
4. render email
5. send with Resend
6. mark as sent or failed
7. append email_invitation_events row if this delivery is tied to invitation flow

### 6.1 Email subject/body
Use invitation email template with:
- inviter name
- match summary
- simple CTA button text: "View Invitation"
- no "Accept Now"
- no implication that clicking email instantly confirms

### 6.2 Link format
CTA should eventually land user at invitation flow, using:
- invitation id
- redirect target to `/invitations/:id`
- auth callback compatibility

### 6.3 Delivery retry
First version can keep it simple:
- attempt_count increments
- failed stays failed
- do not build complex exponential retry if not needed yet
But code should be structured so retry can be added later.

---

## 7. Invitation page behavior

Implement route:
- `/invitations/[id]`

### 7.1 Page should display
- inviter
- invite type
- match summary
- current invitation status
- Accept button
- Decline button

### 7.2 Not logged in
If user is not logged in:
- do not allow Accept/Decline
- show message requiring email verification
- offer magic link auth
- after auth return to same invitation page

### 7.3 Logged in but wrong email
If session user email != target_email:
- block Accept / Decline
- show mismatch message clearly
- do not mutate invitation

### 7.4 Logged in with matching email
Allow Accept / Decline.

---

## 8. Accept / Decline business rules

### 8.1 Accept
Implement server-side action/function:
- acceptInvitation(invitationId)

Must validate:
1. invitation exists
2. status is pending
3. not expired
4. not canceled
5. current session user exists
6. current session user email matches target_email
7. related match still exists and still allows join
8. idempotency: repeated Accept must not duplicate participant creation

Then:
- create or locate platform user/profile if needed
- link invitation to accepted_by_user_id
- set accepted_at
- set status = accepted
- write into match business object
  - either create or activate correct participant record
  - follow current authoritative match admission model
- emit domain event: invitation.accepted

### 8.2 Decline
Implement:
- declineInvitation(invitationId)

Must validate similar rules except no participant write.

Then:
- set status = declined
- set declined_at
- emit domain event: invitation.declined

### 8.3 Idempotency
If accepted already:
- do not create second participant
- return stable success result / already accepted state

If declined already:
- return stable already declined state

If expired:
- block Accept
- show expired state only

---

## 9. Match write-through integration

For first version, related_type='match' only.

On Accept:
- write invitation result into match participation model
- do not invent a parallel shadow model
- integrate with existing participant model

Important:
- respect current playerhoods.com admission semantics
- do not bypass the authoritative match participant flow in a way that conflicts with existing nominate/confirm logic
- if there is already an existing participant record for this user/email-derived user, handle idempotently

If needed, implement a dedicated server-side function like:
- acceptMatchInvitation(invitationId, sessionUserId)

This function should own all validations and writes.

---

## 10. Suggested file structure

Use something like:

src/
  lib/
    invitations/
      create-email-invitation.ts
      accept-invitation.ts
      decline-invitation.ts
      get-invitation-by-id.ts
      validators.ts
      email-template.ts
    notifications/
      emit/
        emit-domain-event.ts
      processors/
        process-domain-event.ts
        handlers/
          invitation-email-invitation-created.ts
          invitation-email-link-opened.ts
          invitation-email-verified.ts
          invitation-landed.ts
          invitation-accepted.ts
          invitation-declined.ts
      workers/
        process-queued-notification-deliveries.ts
      channels/
        email/
          send.ts
          render-invitation-email.ts

app/
  invitations/[id]/page.tsx
  auth/callback/route.ts

supabase/
  migrations/
    xxxx_create_domain_events.sql
    xxxx_create_email_invitations.sql
    xxxx_create_email_invitation_events.sql
    xxxx_create_notifications.sql           -- only if not already present
    xxxx_create_notification_deliveries.sql -- only if not already present
    xxxx_invitation_rls.sql

---

## 11. RLS / security

### 11.1 email_invitations
Users should NOT be able to arbitrarily query all invitations.

For v1:
- reads for invitation detail should go through server-side code
- direct broad client-side access should be avoided

### 11.2 notifications / deliveries / domain_events
- domain_events: internal only
- notification_deliveries: internal only
- notifications: users can only read their own, if already implemented

### 11.3 critical mutation
Accept / Decline must be server-side only.

Do not trust client-provided email.
Always derive user email from authenticated session.

---

## 12. Supabase auth integration

Use Supabase magic link / OTP flow.
Do not re-implement auth.

Need:
- auth callback route
- redirect back to `/invitations/:id`
- after auth success, emit `invitation.email_verified` if invitation context is present

Also when landing invitation page after verified auth:
- emit `invitation.landed`

---

## 13. Minimal implementation sequence

Implement in this order:

### Phase 1
1. migrations:
   - domain_events
   - email_invitations
   - email_invitation_events
   - notifications / deliveries if missing
2. create invitation server action/service
3. emit `invitation.email_invitation_created`
4. event processor handler for this event
5. delivery worker email sending
6. invitation email template
7. `/invitations/[id]` page
8. auth callback redirect support
9. Accept / Decline server actions
10. emit accepted / declined events

### Phase 2
11. opened / verified / landed event emission
12. expiration handling
13. resend flow
14. better audit details

---

## 14. Deliverables expected from this task

Please implement:

1. migrations
2. server-side invitation creation flow
3. event emitter utility
4. event processor utility + handlers
5. delivery worker utility
6. email invitation template
7. invitation page
8. accept / decline actions
9. basic tests or at least a manual verification checklist

---

## 15. Manual test checklist

Provide a checklist covering:

### Case A
- create match invitation to unregistered email
- queued delivery created
- worker sends email
- click email
- complete magic link
- land on invitation page
- click Accept
- invitation becomes accepted
- participant is created exactly once

### Case B
- same flow but click Decline
- invitation becomes declined
- no duplicate participant write

### Case C
- logged in with wrong email
- invitation page blocks Accept

### Case D
- open same accepted invitation again
- UI shows accepted state
- no duplicate writes

### Case E
- expired invitation
- Accept blocked

---

## 16. Important constraints

- append-only migrations only
- do not break existing match flow
- do not add fake temporary shortcuts that bypass email verification
- do not auto-accept on callback
- keep code modular so activity/group can be added later
- keep delivery worker isolated from page logic
- keep event processor isolated from provider implementation

At the end, summarize:
- what files were added
- what files were changed
- any assumptions made
- any TODOs intentionally deferred