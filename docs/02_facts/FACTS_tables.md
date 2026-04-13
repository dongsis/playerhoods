# Database Facts: Tables

**Status:** current active index  
**Scope:** tables most relevant to the Contact Player / Match Proxy model  
**Last updated:** 2026-04-10

This file is intentionally focused on active, high-signal tables rather than historical exhaustiveness.

---

## Table: public.people

**Purpose:** canonical shared person-node layer. Represents one real human across registered-user and Contact Player flows.

**PK:** `person_id`

**Key columns:**

- `person_type`
- `display_name`
- `avatar_url`
- `linked_user_id nullable`
- `primary_sport_id nullable`
- `status`
- `created_at`
- `updated_at`

**Notes:**

- Contact Player is a limited person node in this table.
- Registered users also resolve into this layer.
- Match Proxy bindings attach here, not to private contact records.

---

## Table: public.contact_records

**Purpose:** owner-private contact record layer for Contact Players.

**PK:** `contact_record_id`

**FKs:**

- `owner_user_id -> auth.users.id`
- `person_id -> public.people.person_id`

**Key columns:**

- `raw_name`
- `raw_phone`
- `raw_email`
- `owner_notes`
- `source`
- `created_at`

**Notes:**

- This is the canonical home for owner-private phone / email / notes.
- Save and proxy authority do not attach here.

---

## Table: public.person_relationships

**Purpose:** canonical relationship layer between a viewer / owner and a person node.

**PK:** `relationship_id`

**Key columns:**

- `actor_user_id`
- `person_id`
- `relationship_type`
- `source_group_id nullable`
- `source_match_id nullable`
- `created_at`

**Representative relationship types:**

- `saved`
- `shared_match`
- `same_group`
- `group_contact`
- `direct_contact`
- `linked`
- `imported_by`

---

## Table: public.person_match_proxies

**Purpose:** explicit Match Proxy authority bindings.

**PK:** `binding_id`

**FKs:**

- `principal_person_id -> public.people.person_id`
- `proxy_user_id -> auth.users.id`

**Key columns:**

- `scope`
- `status`
- `requested_by_user_id`
- `invited_via`
- `invited_to`
- `confirmed_at`
- `rejected_at`
- `revoked_at`
- `created_at`
- `updated_at`

**Notes:**

- Canonical scope is `manage_match_participation`.
- Shared group, shared match, participant status, and contact ownership do not create rows here.

---

## Table: public.group_contacts

**Purpose:** Contact Players added to groups as limited members / group contacts.

**PK:** `group_contact_id`

**FKs:**

- `group_id -> public.groups.id`
- `person_id -> public.people.person_id`

**Key columns:**

- `membership_type`
- `created_by`
- `created_at`
- `removed_at`

**Notes:**

- This table represents trusted group inclusion for Contact Players.
- It does not grant full registered group-member semantics.

---

## Table: public.groups

**Purpose:** trust circles and scope containers for invite and relationship flows.

**PK:** `id`

**FKs:**

- `boundary_keeper_id -> auth.users.id`
- `created_by -> auth.users.id`
- `primary_sport_id -> public.sports.id`

**Notes:**

- Groups may now include both full registered members and limited Contact Player group contacts.

---

## Table: public.group_members

**Purpose:** full registered-user group membership rows.

**PK:** `id`

**FKs:**

- `group_id -> public.groups.id`
- `user_id -> auth.users.id`

**Notes:**

- Contact Players do not appear here as full members.
- This table must not be used to infer Match Proxy authority.

---

## Table: public.guests

**Purpose:** compatibility-backed Contact Player contact-record table used by current app flows.

**PK:** `id`

**FKs:**

- `created_by -> auth.users.id`
- `person_id -> public.people.person_id`

**Key columns:**

- `display_name`
- `email nullable`
- `phone nullable`
- `notes nullable`
- `status`
- `person_id`

**Notes:**

- `guests` is no longer the canonical identity layer by itself.
- It behaves as a compatibility contact-record surface linked to the person layer.
- Non-owner reads must not expose private contact fields.

---

## Table: public.user_roster_guests

**Purpose:** owner-scoped shortcut list pointing from a user to their private Contact Player records.

**PK:** `(owner_user_id, guest_id)`

**FKs:**

- `guest_id -> public.guests.id`

**Notes:**

- This remains an owner-private convenience layer.
- The canonical shared identity still lives in `people`.

---

## Table: public.match_participants

**Purpose:** per-match participation rows for registered users and Contact Players.

**PK:** `id`

**FKs:**

- `match_id -> public.matches.id`
- `user_id -> auth.users.id` nullable
- `guest_id -> public.guests.id` nullable
- `created_by -> auth.users.id`
- `org_approved_by -> auth.users.id` nullable
- `manual_confirmed_by -> auth.users.id` nullable

**Key columns:**

- `status`
- `join_method`
- `participant_accepted_at`
- `participant_accepted_via`
- `org_approved_at`
- `removed_at`
- `confirmed_at`

**Constraints:**

- exactly one identity column is set: `user_id` xor `guest_id`
- active-user and active-guest uniqueness are enforced per match

**Notes:**

- Confirmation invariant remains: confirmed iff participant side and organizer side are both present.
- Contact Player entry path is direct invite only.
- Participant-side authority for another person must not be inferred from the row alone.

---

## Table: public.match_participant_actions

**Purpose:** lifecycle audit log for participant actions.

**PK:** `id`

**Key columns:**

- `match_id`
- `match_participant_id`
- `action_type`
- `created_by`
- `created_at`

**Representative active action types:**

- `invite`
- `nominate`
- `request_join`
- `reenter`
- `accept`
- `approve`
- `withdraw`
- `decline`
- `remove`
- `reject_request`
- `revoke_invite`
- `reject_nomination`
- `remove_confirmed`
- `proxy_confirm`
- `guest_invitation_accept`
- `guest_invitation_decline`

**Notes:**

- Legacy `delegate_manual_confirm` may remain in history, but it is no longer the canonical model.

---

## Table: public.matches

**Purpose:** match records, schedule, venue, scope, and organizer-owned settings.

**PK:** `id`

**Key columns:**

- `organizer_id`
- `venue_id nullable`
- `sport_id`
- `match_date`
- `start_time`
- `duration_minutes`
- `invitation_scope_group_ids`
- `can_participants_invite_users`

**Notes:**

- `can_participants_add_guests` is legacy and not canonical for Contact Player admission.
- Organizer approval remains distinct from participant-side acceptance.

---

## Table: public.profiles

**Purpose:** registered-user profile layer.

**PK:** `id`

**Notes:**

- A registered user also resolves into `people`.
- Being linked to a Contact Player does not collapse the distinction between profile, person node, contact record, and proxy binding.

---

## Table: public.identity_links

**Purpose:** bridge verified contact channels to existing compatibility surfaces.

**PK:** `id`

**Key columns:**

- `provider`
- `verified_email`
- `user_id`
- `linked_type`
- `linked_id`

**Notes:**

- `linked` is identity bridge only.
- `linked` does not itself grant Match Proxy authority.

---

## Table: public.user_invite_circle

**Purpose:** registered-user save / invite-circle relation for registered people.

**PK:** implementation-specific row id plus unique owner-target pair

**Notes:**

- For Contact Players, canonical save now belongs in the person-relationship layer.
- This table remains a registered-user compatibility surface.
