# Contact Player + Match Proxy Canonical Spec v1.2

**Status:** authoritative  
**Scope:** Contact Player identity, visibility, save/group/match admission, Match Proxy authority boundary  
**Last updated:** 2026-05-12

---

## 1. Purpose

This spec defines the canonical model for:

- Contact Player as a system-level limited person node
- the boundary between Contact Player and a private contact record
- how Contact Players may be saved, grouped, and admitted into matches
- how Match Proxy authority is granted
- which actions remain principal self-service even when a proxy exists

This spec supersedes any earlier rule set that allowed participant-side match authority to arise from:

- shared group
- shared match
- participant status
- contact owner status
- social closeness
- ad-hoc delegate-confirm flows

---

## 2. Core Concepts

### 2.1 Person Node

A system-level person record representing a real human being across the product.

This is the canonical object for:

- save
- shared match relationships
- shared group relationships
- direct invite
- Match Proxy binding

### 2.2 Contact Record

A private owner-scoped contact entry.

This contains owner-private data such as:

- phone
- email
- notes
- source

### 2.3 Contact Player

Contact Player is a **system-level limited person node**.

It is not the private contact record itself.  
Multiple private contact records may point to the same Contact Player person node.

### 2.4 Linked User

When a Contact Player later registers, the system may link that person node to a registered platform user.

`linked` is an identity bridge only. It is **not** an automatic permission upgrade.

### 2.5 Principal

The person whose match participation is being managed.

A principal may be:

- a registered user
- a Contact Player / limited person

### 2.6 Match Proxy

A Match Proxy is a **registered user explicitly approved by the principal** to manage participant-side match actions for that principal.

This replaces the old ad-hoc delegate-confirm model.

---

## 3. Canonical Definitions

### 3.1 Contact Player

Contact Player is a system-level limited person node with these properties:

- can be maintained by one or more owners
- can be direct-invited into a match without prior registration
- can be saved after trusted exposure
- can be added to a group as a limited group contact
- does not appear in public discovery
- does not expose owner-private contact details
- does not participate in recruit flows
- does not gain ad-hoc delegate authority
- can be a principal for Match Proxy bindings
- contact owner is not automatically a Match Proxy

### 3.2 Match Proxy

Match Proxy is a registered user with explicit, person-level proxy authority for:

- accept invitation
- decline invitation
- complete participant-side confirmation
- withdraw participation
- review the principal's participation status and necessary match details

Match Proxy authority:

- must come from explicit binding
- does not come from shared group, shared match, participant status, contact ownership, or generic trust
- does not inherit organizer powers
- does not inherit discovery, group, or ShareGroup privileges
- does not replace the principal's self-service rights

---

## 4. Canonical Data Model

### 4.1 Person Layer

Canonical shared identity layer. Suggested table: `people`.

Suggested fields:

- `person_id`
- `person_type`
- `display_name`
- `avatar_url`
- `linked_user_id nullable`
- `primary_sport`
- `status`
- `created_at`

### 4.2 Contact Record Layer

Owner-private contact layer. Suggested table: `contact_records`.

Suggested fields:

- `contact_record_id`
- `owner_user_id`
- `person_id`
- `raw_name`
- `raw_phone`
- `raw_email`
- `owner_notes`
- `source`
- `created_at`

### 4.3 Relationship Layer

Suggested shared relationship table: `person_relationships`.

Representative relationship types:

- `saved`
- `shared_match`
- `same_group`
- `group_contact`
- `direct_contact`
- `linked`
- `imported_by`

Direct Intro Share is a trusted-exposure source for saving, but it is not a separate authority layer. It may be represented by a `contact_intro_shares` provenance record and, when accepted, a `person_relationships.relationship_type = 'saved'` row for the recipient.

### 4.4 Proxy Binding Layer

Suggested table: `person_match_proxies`.

Representative fields:

- `binding_id`
- `principal_person_id`
- `proxy_user_id`
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

### 4.5 Group Contact Layer

Suggested table: `group_contacts`.

Representative fields:

- `group_contact_id`
- `group_id`
- `person_id`
- `membership_type`
- `created_by`
- `created_at`
- `removed_at`

---

## 5. Visibility Model

### 5.1 Owner Visibility

The owner may view the full contact record, including:

- phone
- email
- notes
- source
- owner-private management metadata

### 5.2 Non-owner Visibility

Non-owners may only view minimum necessary Contact Player data after trust conditions are met.

Allowed visibility:

- display name
- avatar
- non-sensitive sport info
- relevant shared match / shared group context
- direct Intro context such as "Intro from Nancy"
- whether direct invite is allowed
- whether the person is already saved by the viewer

Forbidden visibility:

- phone
- email
- external handles
- owner notes
- owner-private tags
- raw contact-record contents
- another user's `contact_record_id` as a UI/API handle

### 5.3 Proxy Visibility

An active Match Proxy may see only what is necessary for match participation management, such as:

- invitations
- pending / confirmed / declined participation status
- necessary match time / place / roster information
- limited participation-related messaging context

Proxy visibility must not expose:

- owner-private contact metadata
- non-participation account privacy
- unrelated private profile details

### 5.4 Public Discovery

Contact Players do **not** enter:

- platform-wide player search
- venue member discovery
- club member discovery
- default player discovery
- default public invite candidate pools

Proxy binding does not change these discovery rules.

---

## 6. Identity Uniqueness and De-duplication

### 6.1 Principle

The system should represent Contact Player as **one shared person**, not one separate person per owner.

### 6.2 Target Behavior

If multiple users record the same real person, the preferred frontend result is:

- one Contact Player card
- optional trust copy such as "Known by 3 members"

### 6.3 Merge Policy

Use cautious merge rules:

- auto-merge only for high-confidence matches such as normalized phone, normalized email, or same linked user
- suggest merge for medium-confidence matches such as strong name similarity plus overlapping relationship graph
- do not auto-merge for low-confidence cases such as same-name only

Proxy bindings attach to the person node, not a private contact record.

---

## 7. Save Policy

### 7.1 Save Object

The saved object is always the **person node**, never another user's private contact record.

### 7.2 Save Eligibility

A user may save a Contact Player only when at least one of these is true:

- they are the owner of a contact record for that person
- they have a valid shared match relationship with that person
- they share a group that explicitly includes that person as a group contact / limited member
- they received a direct Contact Intro Share for that person

### 7.3 Save Effects

Save allows:

- keeping the person in private saved people lists
- easier future direct invite
- retaining trusted context

Save does **not** allow:

- contact detail exposure
- recruit power
- proxy power
- public discovery
- automatic upgrade to full member rights

### 7.4 Save vs Proxy

Save is a light relationship.  
Proxy binding is explicit authority.

Save never equals proxy binding.

### 7.5 Direct Contact Intro Share

Contact Intro Share is a direct registered-user-to-registered-user exposure mechanism.

Product wording:

- "Share Linda's Intro"
- "Nancy shared Linda's Intro with you."
- "Save Linda to your Hood."
- "Contact details stay private."

The sender shares the person node / Intro. The sender does not share the private contact record.

The recipient may see only minimum necessary person-card data and may save the person to their Hood. The recipient must not receive:

- phone
- email
- external handles
- owner notes
- owner-private tags
- source `contact_record_id`
- Match Proxy authority
- group membership

Direct Intro Share grants trusted exposure sufficient for Save to Hood. It does not grant contact-detail visibility, Match Proxy authority, group member rights, group admin rights, or public discovery.

---

## 8. Match Admission Policy

### 8.1 Only Standard Admission Path

Contact Player enters a match through **direct invite only**.

### 8.2 No Recruit

Contact Player does not participate in recruit flows.

This means:

- not a recruit audience target
- not broadcast by group/list/tag recruit sends
- not surfaced by public "looking for players" flows

### 8.3 Direct Invite Scope

The invite must be:

- single-person
- person-specific
- explicitly addressed to one concrete principal
- exposed to the UI by `person_id`, not by another user's `guest_id`, `contact_record_id`, phone, or email

New user-facing match invite surfaces should use a `person_id`-first wrapper. The backend may internally resolve legacy `guest_id` compatibility paths and private invitation channels, but those identifiers and channels must not become frontend product objects.

If a Contact Player has a confirmed linked registered user, future match invitations may prefer the registered-user path. The linked state is still an identity bridge only: it does not create Match Proxy authority, group membership, organizer authority, or contact-detail visibility.

### 8.4 Accepted Contact Player

After accepting, Contact Player may:

- view necessary match details
- accept or decline
- complete participant-side confirmation
- appear in the match participant roster

### 8.5 Contact Player Restrictions in Match

Even after joining a match, Contact Player may not:

- proxy-manage others
- nominate others
- invite others
- enter public player pools
- auto-upgrade to full registered-member capability

---

## 9. Group Membership Policy

### 9.1 Allowed

Contact Player may be added to a group as a Shared Contact.

### 9.2 Membership Type

Contact Player group inclusion is represented by `group_contacts`.

It is rendered in product as:

- `Shared Contact`

It must not create a `group_members` row. `group_members` is reserved for registered users who know they belong to the group.

### 9.3 Effects

When a Contact Player is added to a group, group members may:

- see that person
- save that person
- direct-invite that person into matches

### 9.4 Non-effects

Group contact inclusion does **not** grant:

- full registered membership
- a `group_members` row
- full ShareGroup privilege semantics
- group announcements / discussion / files access as a full member
- ad-hoc delegate or proxy power
- nominate / invite-others power
- public discovery
- contact-detail exposure

### 9.5 Group vs Proxy

Shared group is only a trust signal.  
It never creates Match Proxy authority by itself.

---

## 10. Match Proxy Policy

### 10.1 Legacy Delegate Confirm Is Retired

The old ad-hoc delegate-confirm model is retired.

The following relationships must not independently create participant-side authority:

- shared group
- shared match
- participant status
- contact owner status
- generic social closeness

### 10.2 Only Explicit Binding Grants Authority

Only an explicit principal-approved binding grants Match Proxy authority.

### 10.3 Applicable Principals

The principal may be:

- a registered user
- a Contact Player / limited person

### 10.4 Proxy Must Be Registered

The proxy must be a registered user.

Contact Player may not serve as a proxy.

### 10.5 Scope

Current canonical scope:

- `manage_match_participation`

### 10.6 Principal Retained Authority

Even with one or more active Match Proxy bindings, the principal keeps full self-service participant-side authority.

### 10.7 Allowed Actions

An active Match Proxy may:

- accept invitation
- decline invitation
- complete participant-side confirmation
- withdraw / cancel participation
- review invitations and participation status
- review necessary details for matches involving that principal
- send limited participation-related responses

### 10.8 Forbidden Actions

A Match Proxy may not:

- invite other participants
- nominate other participants
- approve other participants
- remove other participants
- manage recruit visibility
- edit organizer-owned match core details
- manage groups
- modify principal identity or private contact settings
- delegate onward to a third person
- gain public discovery privileges
- inherit ShareGroup privileges as though they were the principal

### 10.9 Contact Owner Is Not Auto-proxy

Creating or maintaining a contact record never automatically grants global match participation authority.

### 10.10 Verification

A binding must be confirmed through at least one verifiable principal-controlled channel:

- email
- SMS

Without verifiable contact, the binding cannot become active.

### 10.11 Lifecycle

Recommended statuses:

- `pending`
- `active`
- `rejected`
- `revoked`
- `expired` (optional)

### 10.12 Revocation

The principal may revoke a binding at any time.

### 10.13 Concurrent Self and Proxy Actions

Principal and active proxy may both operate.  
The current state machine decides which action is valid.  
Audit must distinguish self action vs proxy action.

---

## 11. Cross-rules

- Contact Player can have one or more Match Proxies.
- Contact Player can never become a Match Proxy.
- Contact Player never gains proxy power from match, save, group, or link relationships.
- `linked` never auto-creates a proxy binding.
- group trust never replaces explicit principal consent.

---

## 12. Linked Policy

- `linked` means identity bridge only
- `linked` does not auto-upgrade discovery privileges
- `linked` does not auto-create proxy binding
- `linked` does not auto-create group membership
- `linked` does not require rewriting historical match participant rows
- `linked` does not collapse the boundaries between person node, contact record, registered user identity, and proxy binding

---

## 13. UI Model

### 13.1 Default Display

The frontend should default to showing the **person node**, not raw contact records.

### 13.2 Duplicate Avoidance

When multiple users record the same person, the UI should prefer one person card over repeated duplicate contacts.

### 13.3 Detail View

The UI may show relationship provenance such as:

- "Nancy knows this person"
- "Also saved by others in this group"
- "Known by 3 members"

It must not show someone else's phone, email, or private notes.

### 13.4 Proxy UI

The UI must clearly distinguish:

- owner
- saved-by
- group-known
- proxy-for

Proxy actions should be auditable in copy such as:

- "Confirmed by Nancy on behalf of Cindy"
- "Declined by John on behalf of Alex"

---

## 14. Product Invariants

These invariants are authoritative:

- Contact Player is not a private contact record; it is a system-level limited person node.
- Save targets the person node, not another user's private contact record.
- Contact Player does not enter public discovery by default.
- Contact Player does not participate in recruit.
- Contact Player enters a match through direct invite only.
- Contact Player may join groups only as a limited group contact / limited member.
- Contact Player never becomes ad-hoc delegate authority and never becomes Match Proxy.
- Match participation authority for another person comes only from explicit principal-approved proxy binding.
- Shared group, shared match, participant status, contact ownership, and social closeness do not create proxy authority.
- Principal keeps full self-service participant-side rights even with active proxies.
- `linked` means identity bridge only; it does not auto-upgrade permissions and does not auto-create proxy authority.
- Multiple contact records may point to one person node.
- The UI should show one person wherever feasible, not duplicated contact rows.

---

## 15. Final Product Statement

Contact Player is a system-level limited person node, not a private contact row.

It can be direct-invited, saved through trust-qualified exposure, and included in trusted circles as a limited group contact. It does not participate in recruit, does not expose private contact details, and does not gain ad-hoc delegate power.

Participant-side match authority for another person comes from Match Proxy binding only, never from shared group, shared match, contact ownership, or generic closeness.

Contact Player may therefore be a principal with explicit registered-user Match Proxies, while still retaining the principal's own self-service rights at all times.
