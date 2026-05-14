# Current Product Rules - May 2026

Last updated: 2026-05-12

## Purpose

This document freezes the current PlayerHoods product rules for the May 2026 prelaunch phase.

It is a product and implementation-alignment document. It does not introduce new schema, migrations, UI work, or backend behavior by itself.

If older code, migrations, generated types, or archived docs use legacy naming, treat those as implementation residue unless this document explicitly says the legacy path remains part of the current product.

## 1. Hoods

Hoods = sport-scoped people network.

A Hood is the user's personal people network for a selected sport. It is where the user discovers, saves, reviews, and later invites people to play.

Current Hoods people sources:

- registered users the viewer has saved
- Contact Players owned by the viewer
- linked Contact Players rendered through their registered-user identity when the link is confirmed
- eligible people surfaced through shared Groups
- eligible people surfaced through club or city discovery
- exact email / phone search results, subject to privacy rules

Hoods is not a group chat area and is not a proxy-management workspace.

## 2. Groups

Groups = shared organization space.

A Group is a shared coordination space for a set of people who organize or play together. Groups carry shared membership, shared contacts, group info, group resources, and group-level match visibility or invitation scope.

Current Groups responsibilities:

- group identity and settings
- group members
- shared Contact Players / group contacts
- group locations and regular venues
- resources, photos, links, and files
- discussion or coordination inside the group detail surface
- match invite and visibility scope when a match uses the group

Groups are not a private saved-player list. Groups should not be used as the replacement for Hoods.

## 3. Identity Boundaries

### Registered User

A Registered User is a formal PlayerHoods account that can log in. The registered account owns its own profile, visibility settings, saved people, groups, and match actions.

Registered Users may be discovered, saved, invited, and added to Groups according to the applicable visibility and permission rules.

### Contact Player

A Contact Player is a non-registered or not-yet-linked person entered by an owner for sports coordination.

Contact Player data has two layers:

- shared person identity, such as display name and avatar
- owner-private contact record, such as raw email, raw phone, notes, and private details

Owner-private contact details must not be exposed to other users.

Contact Players can be invited to games now. Their coordination path may become smoother later if they join PlayerHoods and confirm a link.

### Linked Contact

A Linked Contact is not a fourth identity type.

It means a Contact Player / guest person has been explicitly linked to a Registered User after confirmation by the registered user.

Linked Contact rules:

- the registered-user identity becomes the preferred display identity
- historical Contact Player records remain for history and owner-private context
- linking does not automatically create group membership
- linking does not automatically grant Match Proxy authority
- linking does not expose private contact details
- linking does not silently merge or delete historical records

## 4. Discover -> Save -> Invite

The current product path is:

Discover -> Save -> Invite

Discovery helps users find relevant people. Saving adds a person to the user's Hood. Invitation happens later from match or group flows.

Do not introduce product language such as:

- friend request
- connected
- connection
- unconnect
- private list
- global display-name search

Saving is one-way owner convenience unless another flow explicitly creates reciprocal rights.

## 5. Exact Email / Phone Search

Exact Email / Phone Search is a privacy-aware registered-user lookup path.

Rules:

- Search input may be normalized email or normalized phone.
- A result may only be shown when there is an exact match under the current privacy policy.
- Matched raw email or phone must not be exposed to the searcher.
- If the target allows contact-info-based saving, show a saveable registered-user card.
- If the target disables contact-info-based saving, do not allow direct save from that private signal.
- If direct save is not allowed, the allowed action is a privacy-safe Save Request.

Same-club same-display-name weak match:

- may be shown only when normal club discovery or shared-club context permits a limited preview
- must never auto-save
- must never auto-link
- must never auto-merge
- allowed action is Save Request, not direct private-info save

Exact Email / Phone Search is not Contact Player import. Product copy should avoid naming that makes users think they are uploading contacts for the platform.

## 6. Save Request

A Save Request is an Inbox request, not free-form chat.

Rules:

- requester asks to save the target registered user
- target can Allow Save or Decline
- Allow Save creates a saved relationship from requester to target
- Decline does not reveal private information
- Decline or pending status prevents immediate repeated requests
- requester-target pair is rate-limited to one request per 30 days
- if pending or recently declined, UI should show a disabled state and the next eligible date when available

Save Request does not create group membership, match participation, proxy authority, or reciprocal saved status.

## 7. Group Member Add Scope

Group member add should use scoped, trusted sources.

Current allowed sources:

- saved registered users
- eligible registered users already related through the group or venue context
- Contact Players the acting user can view and is allowed to share into the group
- group contacts already within that group context

Rules:

- Adding a Registered User to a Group is a group membership action.
- Adding a Contact Player to a Group creates or uses a group contact path, not full registered membership.
- Group contacts remain limited shared contacts until the person becomes a registered member through the normal membership flow.
- Linked Contact display may prefer the registered-user card, but linked status alone does not create membership.

## 8. Linked Contact Display

When a Contact Player resolves to a confirmed Registered User, prefer the registered-user identity card in user-facing people lists.

Display strategy:

- show the registered user's display name and avatar where available
- avoid duplicate Contact card plus Registered User card for the same canonical person
- keep owner-private contact history available only in owner-visible detail or edit surfaces
- do not expose private raw email, raw phone, owner notes, or source contact record details
- use linked state as display resolution, not as a permission upgrade

The product should not expose a separate Linked management tab in this phase.

## 9. Match Invite Entries

Match Invite currently has three product entries:

### Invite People

Invite specific people to the match.

Eligible people can include:

- saved registered users
- owned Contact Players
- linked Contact Players resolved to registered-user identity
- eligible group contacts
- other scoped eligible people returned by match invite APIs

### Invite Groups

Invite a Group to the match so the group can be used as a trusted invitation source.

Group invitation is distinct from inviting each individual person manually.

### Visible to Groups

Make the match visible or requestable to selected Groups.

This is request scope / visibility scope. It is not the same as direct invitation.

Preferred user-facing labels:

- Invite People
- Invite Groups
- Visible to Groups

Avoid product-facing labels based on older internal mechanics, such as Nominate or Direct Invite Contact Player.

## 10. Explicitly Out of Scope This Phase

The following are not part of the current phase:

- Private List as a product surface
- Hoods-level group chat
- Hoods-level Proxy tab
- Linked management tab
- global display-name search
- automatic same-name linking
- automatic same-name saving
- automatic merge of Contact Player and Registered User records
- exposing private contact details to non-owners
- treating Contact Player group contacts as full group members
- using linked status as a permission upgrade

These may be reconsidered later, but they should not be implemented or reintroduced during this phase without a new product decision document.

## 11. Naming Rules

Use current product vocabulary:

- Hoods
- Saved
- Contact Player
- Registered User
- Linked Contact only as an internal bridge/display state
- Add My Contact
- Add regular players
- Invite People
- Invite Groups
- Visible to Groups
- Exact Email / Phone Search
- Save Request

Avoid product-facing legacy vocabulary:

- Players as a top-level replacement for Hoods
- Private List
- Direct Invite Contact Player
- Nominate
- Linked tab
- Connection / Friend / Connected / Unconnect

Legacy names may remain in code, schema, tests, or historical migrations until cleanup, but new user-facing surfaces and current docs should follow this rule set.

