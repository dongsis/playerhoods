# PlayerHoods Identity Model

Last updated: 2026-05-12

## Purpose

This document defines the canonical identity model for:

- registered users
- contact players
- linked contacts / linked guests
- verified email identity used for linking and exact lookup

This document is product- and business-facing. It describes the intended canonical path even where legacy schema or compatibility RPCs still exist.

## Core Identity Objects

### Registered User

A Registered User is a formal PlayerHoods account.

- Core key: `user_id`
- Account auth source: Supabase Auth
- Profile layer: `profiles`
- Shared person layer: `people`

Registered User is the only identity type that can log in directly.

### Contact Player

A Contact Player is a non-registered player entered by a registered user for sports coordination.

- Compatibility key: `guest_id`
- Canonical shared person key: `person_id`
- Owner-private record key: `contact_record_id`

Contact Player is not the same thing as the owner's private contact record. Multiple private contact records may point to the same shared person.

### Linked Guest / Linked Contact

Linked Guest or Linked Contact is not a separate fourth product identity.

It means:

- the person started as a Contact Player / guest
- the system later identified a matching Registered User
- the Registered User explicitly confirmed the link

Canonical meaning:

- the shared person node remains the same person
- the registered account becomes the active future account path
- historical guest records remain in place unless explicitly migrated in a separate historical cleanup strategy

`linked` is an identity bridge state, not a separate user type and not an automatic permission upgrade.

## Canonical Data Layers

### Auth Layer

Authentication is handled by Supabase Auth.

Current primary login flow:

- Google OAuth

Future login flows may include:

- Apple
- Facebook
- email OTP
- other Supabase-supported auth providers

Because auth providers may change, business logic must not use provider-specific naming such as `google_email`.

### Shared Person Layer

Canonical table:

- `people`

Canonical fields already aligned with this model:

- `person_id`
- `person_type`
- `display_name`
- `linked_user_id`

### Owner-private Contact Layer

Canonical table:

- `contact_records`

Owner-private data belongs here, including:

- raw contact email
- raw contact phone
- owner notes
- source metadata

### Compatibility Contact Layer

Compatibility table:

- `guests`

This remains an active business surface for current flows, but it is not the only identity truth by itself.

### Relationship Layer

Canonical table:

- `person_relationships`

This is where saved, shared-match, group-contact, and linked relationship context should live.

### Direct Intro Share Layer

Canonical table:

- `contact_intro_shares`

This records direct user-to-user Intro sharing for a person node.

Rules:

- sharing means sharing the `people.person_id` / Intro, not sharing a private `contact_records` row
- sender and recipient may see the share record, but the recipient must not see raw phone, raw email, owner notes, private tags, or source contact record details
- accepting an Intro creates or reuses a `person_relationships` row with `relationship_type = 'saved'`
- Intro sharing is not a Match Proxy grant, group membership grant, group admin grant, or public discovery grant
- existing `guest_id` compatibility paths may remain internally, but new user-facing APIs should prefer person-node wrappers

## User Email Identity

PlayerHoods currently mainly uses Google OAuth, but Google is only the current authentication provider.

Google login exists so that:

1. the user does not need a PlayerHoods-specific password
2. Google performs identity authentication
3. Supabase Auth stores `auth.users.email`
4. the business layer should refer to this as `verified_auth_email`, not `google_email`

The product must distinguish two different email concepts.

### A. Auth Email / Login Email

Source:

- Supabase Auth
- currently often from Google OAuth
- in the future possibly Facebook, Apple, email OTP, or other auth providers

Purpose:

- login identity
- account recovery
- identity linking

Business naming:

- `verified_auth_email`
- `auth_email_normalized`

Rules:

- do not hardcode provider-specific naming such as `google_email`
- treat this as a verified identity channel only when the auth provider / auth system has actually verified it
- do not publicly display it

### B. Profile Contact Email

Source:

- user manually enters it in PlayerHoods profile

Purpose:

- day-to-day communication
- match notifications
- Exact Email / Phone Search
- identity linking

Business naming:

- `profile_contact_email`
- `profile_contact_email_normalized`
- `profile_contact_email_verified_at`

Rules:

- it must be verified before it can be used as a high-confidence identity signal
- an unverified profile contact email must not be used as a high-confidence link condition
- it must not be publicly displayed

## Verified Email Set

Identity linking should not query only `auth.users.email`.

Canonical business rule:

each registered user has a verified email set

that set may include:

- verified auth email
- verified profile contact email

Suggested app-facing canonical path:

- `v_user_verified_emails`

Suggested output:

- `user_id`
- `email_normalized`
- `email_type` with values `auth` or `profile_contact`
- `verified_at`

Identity link logic should query the user's verified email set, not only the auth email.

## Email Matching Rules

Contact Player / guest email may generate a high-confidence link candidate if it exactly matches any verified normalized email belonging to a registered user.

Allowed high-confidence email sources:

1. registered user `verified_auth_email`
2. registered user `verified profile_contact_email`

Mandatory rules:

- matching must use normalized exact email match
- unverified profile contact email must not be used for high-confidence linking
- if the auth provider does not provide a verified email, no high-confidence email link should be generated from auth email
- if a future login provider has no verified email or an unusable email, high-confidence email linking must not trigger from that provider

## High-confidence Match Outcome

Even when email is high-confidence, the system must not silently merge.

High-confidence email match should only do the following:

- create a link candidate
- queue a review prompt for the registered user

It must not immediately:

- mutate historical participant rows
- delete guest rows
- delete contact records
- auto-archive contact records without user confirmation
- switch future invite path before confirmation

## Link Confirmation Rule

Only after the registered user explicitly clicks `Link to my account` may PlayerHoods execute the active-link workflow.

That confirmed-link workflow may then:

- attach the person to the registered user
- create saved registered-player relations where needed
- soft archive old private contact records
- preserve private notes and historical invitations
- switch future invitations to the registered-user path

It must not automatically:

- create `group_members` rows
- create Match Proxy bindings
- grant keeper/admin authority
- mutate historical match participant rows solely because a linked user exists
- expose another user's private contact details

For MVP this soft archive means:

- set `contact_records.archived_at`
- set `contact_records.archive_reason = linked_to_registered_user`
- set `contact_records.replaced_by_user_id`
- hide archived contact records from active Contacts / Hoods contact views by default
- do not delete historical guest rows, invitations, notes, or match participation rows

Group Contact rows remain group-scoped Shared Contacts. A linked registered user may be rendered as the PlayerHoods identity for that shared person, but the registered user is not made a full group member unless they explicitly join or accept a normal group membership flow.

## MVP Review Scope

Current MVP review scope is intentionally limited.

Included:

- guest / contact records that already exist in the PlayerHoods identity graph
- verified-email high-confidence candidates for explicit user review

Not included:

- generic `invitation_target` review for plain historical email invitation rows with no contact / guest identity object behind them

Reason:

- those rows often do not carry enough identity context to produce a useful merge or ownership transition
- they usually do not include private contact notes, saved-player relationships, or shared-person structure

Current MVP product choice:

- keep explicit review focused on guest / contact candidates
- when a contact is explicitly linked, notify relevant contact owners in-app that future invitations can go to the registered PlayerHoods account

## Privacy Rules

PlayerHoods must not publicly show:

- auth email
- profile contact email
- normalized email forms

Email identity data is only for:

- verified identity matching
- exact lookup where product rules allow it
- service communication where the user explicitly enabled it

## Current Canonical Naming Summary

Use:

- `verified_auth_email`
- `auth_email_normalized`
- `profile_contact_email`
- `profile_contact_email_normalized`
- `profile_contact_email_verified_at`
- `v_user_verified_emails`

Avoid:

- `google_email`
- provider-specific email naming in product or business logic
- using raw unverified profile email as a high-confidence identity signal

## Relationship to Existing Schema

Current codebase facts relevant to this model:

- `profiles.contact_email` already exists as a user-entered contact email field
- current link compatibility flow mainly uses `identity_links.verified_email`
- current reconcile logic is still primarily email-driven

This document establishes the intended canonical direction:

- auth-provider email is an auth identity channel, not provider-specific business data
- profile contact email is a separate user-managed contact channel
- both may belong to the same verified email set
- only verified channels participate in high-confidence email link candidate generation
