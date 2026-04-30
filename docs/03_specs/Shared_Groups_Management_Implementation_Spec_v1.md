# Shared Groups Management Implementation Spec v1

**Status:** proposed implementation spec  
**Effective date:** 2026-04-13  
**Scope:** Shared Group list, detail space, membership management, join-preference-based add flow, request model, and notification rules  
**Authority note:** this document governs the Groups product slice only. It does not redefine Hoods, Proxy, Private List, or recruit logic.

---

## 1. Purpose

This document defines how Shared Groups should be implemented as a standalone product area.

This round is intentionally narrow:

- build `Groups` as a first-class shared space
- make Shared Group membership visible and explicit
- make add-to-group logic depend on the target user's Shared Group Join Preference
- reserve future structure for `Board`, `Discussion`, and `Files`

This round explicitly does **not** redesign Hoods, Proxy, Private List, or recruit systems.

---

## 2. Canonical Product Boundary

### 2.1 Shared Group definition

For this phase, there is only one group model:

- `Shared Group`

A Shared Group means:

- members know they belong to the group
- the group belongs to a clear sport
- the group is not an owner-only hidden list
- the group can carry long-term organization and communication

### 2.2 Boundary with other modules

`Groups` is responsible for:

- shared membership
- group-level identity and awareness
- future announcements and notices
- future discussion
- future files and shared resources
- group-level match entry points

`Hoods` remains responsible for:

- people discovery
- people filtering and sorting
- invite candidate selection
- person-level understanding

`Match flow` remains responsible for:

- `Invite People`
- `Invite Groups`
- `Visible to Groups`

### 2.3 Explicit non-goals

Do not build in this round:

- Private List
- Proxy logic
- Hoods IA redesign
- polished group chat system
- full file management system
- club-specific join preference
- recruit mechanism expansion

---

## 3. Main Navigation

`Groups` must remain a left-side first-level navigation item.

It must not be moved back under `Hoods`.

Canonical rule:

- `Hoods` manages the sport-scoped people network
- `Groups` manages the shared organization space

---

## 4. Groups List Page

### 4.1 Page goal

Show all Shared Groups the current user belongs to or is meaningfully related to through direct membership visibility.

### 4.2 Page structure

Suggested structure:

1. Page header
2. Search and lightweight filters
3. Shared Group cards grid or vertical list
4. Empty state

### 4.3 Header

Suggested header content:

- title: `Groups`
- subtitle: `Shared Groups are your shared sport spaces for membership, coordination, and future communication.`

Optional controls:

- `Search groups`
- `Filter by sport`
- `Sort by latest activity`
- `Sort by member count`
- `Sort alphabetically`

### 4.4 Group card fields

Each Shared Group card should show:

- `group name`
- `sport`
- `member count`
- `owner / captain / keeper` if defined
- `latest activity summary` as a lightweight placeholder
- `your role` if role metadata exists
- quick actions

### 4.5 Quick actions

Minimum quick actions:

- `Open Group`
- `Invite Group to Match`
- `Manage Group`

Future-ready optional actions:

- `Create Post`
- `View Files`

### 4.6 Empty state

Suggested copy:

`You're not in any Shared Groups yet. When you join or get added to one, it will appear here.`

---

## 5. Group Detail Page

Each Shared Group opens into an independent space with reserved long-term structure.

### 5.1 Top-level layout

Suggested layout:

1. Group header
2. Primary action row
3. Tabbed or segmented navigation:
   - `Overview`
   - `Board`
   - `Discussion`
   - `Files`

### 5.2 Group header

Header should show:

- `group name`
- `sport`
- `description`
- `owner / captain / keeper / admins`
- `your membership status`

Primary actions:

- `Add Member`
- `Invite Group to Match`
- `Manage Group`

### 5.3 Overview tab

The `Overview` tab should contain:

- group basic info
- sport
- owner / captain / keeper / admins
- member list
- group description
- optional rules
- your role and membership status

### 5.4 Board tab

The `Board` tab is the canonical home for:

- announcements
- pinned notices
- training posts
- activity posts
- future group-level match posts

For this phase it can be a structured placeholder, but the IA slot must exist.

### 5.5 Discussion tab

The `Discussion` tab is the canonical home for:

- group chat
- member discussion
- future threaded conversation

For this phase it can be a placeholder with an entry shell.

### 5.6 Files tab

The `Files` tab is the canonical home for:

- documents
- links
- images
- future structured shared resources

For this phase it can be a placeholder with correct IA positioning.

---

## 6. Membership Model

### 6.1 Core rule

All active Shared Group members can initiate `Add Member`.

This is a product decision.

It is not restricted to:

- owner
- captain
- keeper

### 6.2 Important distinction

The member who initiates add does **not** control whether the target joins immediately.

The final behavior is determined by the target user's:

- `Shared Group Join Preference`

### 6.3 Membership awareness rule

Every active member must be able to:

- see the group in `Groups`
- open group detail
- know the group name and sport
- know they are a member

A structure where only the creator knows the grouping does not qualify as `Shared Group`.

---

## 7. Shared Group Join Preference Dependency

The target user's existing profile setting controls the outcome.

### 7.1 Preference values

Supported values:

1. `For all sports, my approval is required`
2. `For sports I've selected, my approval is not required. For other sports, my approval is required.`
3. `For all sports, my approval is not required`

### 7.2 Evaluation flow

When user A tries to add user B to a Shared Group:

1. Resolve the group's sport
2. Read B's `Shared Group Join Preference`
3. Check whether the group sport is enabled in B's profile if option 2 is selected
4. Decide:
   - direct add
   - approval request

### 7.3 Decision table

#### Option 1

`For all sports, my approval is required`

Result:

- do not add directly
- create `group_join_request`
- B joins only after acceptance

#### Option 2A

`For sports I've selected, my approval is not required`

If the group's sport is enabled in B's profile:

- direct add
- no approval required
- send lightweight awareness notification

#### Option 2B

If the group's sport is **not** enabled in B's profile:

- do not add directly
- create `group_join_request`
- B joins only after acceptance

#### Option 3

`For all sports, my approval is not required`

Result:

- direct add
- no approval required
- send lightweight awareness notification

---

## 8. Add-to-Group Outcome Model

The add action should resolve into one of these explicit outcomes:

- `already_member`
- `already_pending`
- `direct_add_success`
- `approval_required_request_created`
- `not_allowed`
- `error`

### 8.1 UI requirement

The UI must clearly show which outcome occurred.

Good examples:

- `Added to group`
- `Approval requested`
- `Already a member`
- `Already pending approval`

Do not leave the initiator guessing whether the action succeeded silently or created a request.

---

## 9. Shared Group Membership State Machine

### 9.1 Member states

Suggested canonical membership states:

- `not_member`
- `pending_request`
- `active_member`
- `removed`

Optional request-only terminal state:

- `revoked`

### 9.2 State transitions

`not_member -> active_member`

- triggered by direct add
- allowed when target preference permits auto-join

`not_member -> pending_request`

- triggered by add attempt when approval is required

`pending_request -> active_member`

- triggered when target accepts

`pending_request -> not_member`

- triggered when target declines

`pending_request -> revoked`

- optional requester/system cancellation path

`active_member -> removed`

- triggered by remove member or leave group

`removed -> active_member`

- triggered by later direct re-add or accepted request

### 9.3 Invariants

At most one active membership per `group_id + user_id`.

At most one pending join request per `group_id + target_user_id`.

Direct add must still emit awareness notification.

---

## 10. group_join_request Data Model

Suggested table:

- `group_join_requests`

### 10.1 Required fields

- `id`
- `group_id`
- `sport_id`
- `requester_user_id`
- `target_user_id`
- `status`
- `created_at`
- `responded_at`
- `note`

### 10.2 Recommended snapshot fields

To preserve history and keep notifications stable:

- `group_name_snapshot`
- `sport_name_snapshot`
- `requester_display_name_snapshot`

### 10.3 Suggested status values

- `pending`
- `accepted`
- `declined`
- `revoked`

### 10.4 Suggested constraints

- only one `pending` row per `group_id + target_user_id`
- accepted request must result in `group_members` row creation
- request resolution must be auditable

---

## 11. Add Member UX

### 11.1 Entry point

Place `Add Member` in Group detail header and/or Overview member section.

### 11.2 Picker source

The picker should prefer people relevant to the group's sport:

- contacts
- saved people
- other known people

This is a sourcing convenience only.

It must not turn Groups into a Hoods page.

### 11.3 Interaction flow

1. Open `Add Member`
2. Search/select a person
3. Show target summary
4. On submit, evaluate preference outcome
5. Return immediate feedback

### 11.4 Result feedback

If direct add succeeds:

- `Added to group`
- optional subtext: `They can now see this Shared Group in Groups.`

If approval is required:

- `Approval requested`
- optional subtext: `They need to accept before joining this Shared Group.`

If already active:

- `Already a member`

If already pending:

- `Approval already pending`

---

## 12. Notifications Principle

Shared Group management follows low-interruption behavior.

### 12.1 Cases that should notify

- I receive a group join approval request
- my group join request was accepted
- my group join request was declined
- I was directly added to a Shared Group
- I am keeper / captain / owner and a critical group management event occurred

### 12.2 Cases that should not strongly interrupt

- ordinary member list churn unrelated to me
- general member changes with no direct action
- routine group activity not directly tied to my action

### 12.3 Direct-add awareness notification

Direct add must never be fully silent.

Suggested copy:

- `You were added to Tennis Group "Fire" by Nancy.`

This should be lightweight, not high-interruption.

---

## 13. API and Permission Shape

### 13.1 Minimum backend capabilities

Suggested RPC/service surface:

- `list_my_shared_groups()`
- `get_shared_group_detail(group_id)`
- `add_member_to_shared_group(group_id, target_user_id, note?)`
- `list_group_join_requests(group_id?)`
- `accept_group_join_request(request_id)`
- `decline_group_join_request(request_id)`
- `remove_group_member(group_id, target_user_id)`

### 13.2 Add-member backend contract

`add_member_to_shared_group(...)` should:

1. verify caller is an active group member
2. load target join preference
3. load group sport
4. decide direct add vs request
5. return structured result

Suggested response shape:

- `result: 'already_member' | 'already_pending' | 'direct_add_success' | 'approval_required_request_created'`
- `group_id`
- `target_user_id`
- `request_id` nullable
- `message`

### 13.3 Permissions

For this round:

- any active group member may initiate add
- remove member may remain restricted by existing policy if needed
- edit group info may remain restricted by existing keeper/admin policy

---

## 14. Acceptance Criteria

The implementation is acceptable only if all are true.

### 14.1 IA

- `Groups` is a first-level navigation item
- `Groups` has a list page
- each group has a detail space
- detail space includes `Overview`, `Board`, `Discussion`, `Files`

### 14.2 Shared Group semantics

- members know they belong to the group
- the group has a clear sport
- the group is a shared boundary, not a hidden list

### 14.3 Add-to-group behavior

- all active members can initiate add
- target preference determines direct add vs approval request
- approval-required cases create `group_join_request`
- direct add creates membership immediately
- direct add still sends lightweight awareness notification

### 14.4 Future readiness

- group detail page reserves space for `Board`, `Discussion`, and `Files`
- the information architecture does not collapse Groups back into Hoods

---

## 15. Implementation Notes for Current Codebase

Based on the current front-end direction:

- keep `Groups` as first-level dashboard navigation
- keep Shared Group detail as independent route and shared-space shell
- evolve existing group detail into fuller `Overview` content
- add membership request infrastructure instead of reusing hidden or owner-only list semantics
- do not expand Proxy or Private List in this round

The current group detail shell can remain visually lightweight, but the boundary and behavior must follow this spec.
