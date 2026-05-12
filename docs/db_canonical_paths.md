# PlayerHoods DB Canonical Paths

Last updated: 2026-05-05

## Purpose

This document defines the canonical database paths for current PlayerHoods development. New code should follow these paths and avoid legacy objects listed in `db_legacy_inventory.md`.

## Identity Model

Canonical identity model:

- `people`
- `contact_records`
- `person_relationships`
- `profiles`
- `identity_links`

Reference document:

- [Identity Model](./identity_model.md)

Notes:

- `Registered User` remains a `user_id`-centric identity.
- `Contact Player` remains a `guest / person / contact_record` model.
- `Linked Guest / Linked Contact` is a link state, not a separate product identity.
- Verified email identity must be treated as a user-level verified email set, not as a provider-specific `google_email` concept.

## Venue / Club Membership and Discovery

Use:
- `venue_user_relationships`
- `rpc_venue_people_discovery_v2`

Do not use:
- `venue_identities`
- `rpc_venue_members_discovery`
- `profiles.show_in_venue_member_discovery`

Notes:
- Venue / club relationship and discovery should be relationship-specific, not global profile-level.
- Venue member discovery visibility belongs on the relationship row via `visible_in_venue_member_discovery`.
- This document follows the current codebase canonical path. If a future redesign moves venue discovery to a different relationship model, handle that in a separate migration / refactor task.

## Sports Profile and Player Level

Use:
- `user_sports`
- `user_sport_profiles`
- sport-aware profile data

Do not use:
- `profiles.level`
- `profiles.plays_singles`
- `profiles.plays_doubles`

Notes:
- Player level and play preferences are sport-specific.
- UI surfaces should read level from the active sport profile, not from `profiles`.

## Venue Relationships

Use:
- `venue_user_relationships`

Do not use:
- `profiles.secondary_venue_ids`
- `venue_identities`

Notes:
- A user can relate to multiple venues/clubs. Use relationship records, not profile array fields.

## Court Assignment

Use:
- `match_courts`

Do not use:
- `matches.court_ids`

Notes:
- Court assignment should be normalized through `match_courts`.
- `matches.court_ids` is compatibility residue only.

## Discovery / Save / Invite

Current product path:
Discover -> Save -> Invite

Do not introduce:
- Connection
- Friend request
- Connected
- Unconnect
- global display name search

Current discovery scopes:
- Club Discovery
- City Discovery
- Exact Email / Phone Search

Registered players can be discovered and saved.
Existing Contact Player system remains unchanged.

For registered-user discovery naming:
- Use `Email / Phone Search` or `Exact Email / Phone Search`
- Avoid contact-based discovery naming that overlaps with Contact Player terminology

Notes:
- Contact Player is a separate module and should not be mixed into registered-user discovery naming.
- Legacy database field / RPC names may still retain older wording internally for compatibility, but new product-facing code and docs should prefer email/phone wording.

## Contact Player Intro Sharing

Use:
- `people`
- `contact_records`
- `person_relationships`
- `contact_intro_shares`

Rules:
- A Contact Intro Share shares a person node, not a private contact record.
- The recipient may save the person to Hood through `person_relationships.relationship_type = 'saved'`.
- The recipient must not receive raw phone, raw email, owner notes, private tags, or another user's `contact_record_id`.
- Direct Intro Share is a save eligibility source only. It does not create group membership, Match Proxy authority, recruit eligibility, or public discovery.
- Keep existing `guest_id` compatibility paths internally, but prefer `person_id`-first wrappers for new user-facing APIs.

## Contact Player Match Invite Wrappers

Use:
- `rpc_match_contact_person_targets(p_match_id, p_search)`
- `rpc_match_invite_contact_person(p_match_id, p_person_id)`

Rules:
- Match invite UI should consume Contact Player candidates as person cards: `person_id`, display name, avatar, source, and invite eligibility only.
- Do not expose `guest_id`, `contact_record_id`, phone, email, or private invite channel details as frontend product objects.
- The invite wrapper validates match invite authority and trusted exposure, then resolves a registered-user path or a private invitation channel internally.
- If a person has a confirmed linked registered user, the wrapper may prefer the registered-user path. This does not grant proxy, group member, admin, or contact-detail rights.
- Legacy `guest_id` RPCs remain available for compatibility and should not be globally removed without a separate migration plan.

## Prelaunch Legacy Handling

- Remove active business references first.
- Keep generated types, historical migrations, and compatibility SQL intact until post-launch cleanup is explicitly planned.
