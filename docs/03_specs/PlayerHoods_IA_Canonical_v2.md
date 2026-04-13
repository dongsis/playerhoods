# PlayerHoods IA Canonical v2

**Status:** active product IA rule  
**Effective date:** 2026-04-13  
**Scope:** front-end information architecture, navigation, naming, page boundary, and interaction-density rules for Hoods / Groups / Proxy  
**Authority note:** this document governs product IA and user-facing structure. It does not replace DB canonical documents unless a later implementation doc explicitly aligns them.

---

## 1. Purpose

This document freezes the current IA decision for the PlayerHoods front-end.

Its goal is to stop the product from mixing:

- Hoods as a people network
- Groups as a shared organization space
- Proxy as a long-term relationship-management capability

If an older plan, blueprint, or UI assumption conflicts with this document at the IA layer, this document wins.

---

## 2. Core Product Split

The front-end is formally split into two primary lines:

### 2.1 Hoods

Hoods solve the **people pool** problem for a given sport:

- who is in my pool
- who I can invite
- how I search, filter, sort, and understand people
- how I start a match flow from those people

### 2.2 Groups

Groups solve the **shared space** problem:

- which Shared Groups I belong to
- which members are in a Shared Group
- how announcements, discussion, files, and resources are organized
- how captain / keeper roles manage the group
- how group-level match actions are initiated

### 2.3 Final principle

**Hoods manage the people pool. Groups manage the shared space.**

These two mental models must not be merged into the same primary page structure.

---

## 3. Main Navigation

The left-side primary navigation is:

1. Inbox
2. Matches
3. Hoods
4. Groups
5. Venues
6. Gear
7. My Profile

### 3.1 Naming decisions

- `Players` is replaced by `Hoods` as the primary user-facing navigation label.
- `Groups` exists as a first-level navigation item.
- `Proxy` does not live under `Hoods`; it belongs under `My Profile`.

### 3.2 IA implication

Older references to `Players` as the main navigation destination should be treated as deprecated IA wording.

---

## 4. Private List Decision

### 4.1 Current decision

For this phase, **do not build Private List**.

### 4.2 Why

- it is too easy to confuse with Shared Groups
- it mixes shared grouping and owner-only private organization into one concept
- clarifying `Hoods + Shared Groups` is more important than introducing another list model

### 4.3 What remains

Only **Shared Group** is retained as the group model for this phase.

A Shared Group means:

- members know they belong to the group
- the group is a shared boundary, not an owner-only hidden list
- the group can be used for group-level match flows
- the group may later carry announcements, discussion, files, and resources

### 4.4 Explicitly not in scope

- Private List tab
- Private List management UI
- owner-only list grouping as a first-class IA object

---

## 5. Hoods IA

### 5.1 First level: sport tabs

Inside `Hoods`, the first level is a sport switcher.

Only sports enabled by the user in profile are shown.

Examples:

- if the user enables `tennis` only, show `My Tennis Hood`
- if the user enables `tennis` and `pickleball`, show `My Tennis Hood` and `My Pickleball Hood`
- if the user does not enable `badminton`, do not show `My Badminton Hood`

### 5.2 Second level: scope toggle on the same page

Within each sport hood, do not split the IA into disconnected pages such as:

- Contacts page
- Saved page
- From Group page
- standalone Discover page

Instead, use a shared page framework with a scope toggle:

- `In My Hood`
- `Discover`

### 5.3 Rule

`In My Hood` and `Discover` are not two unrelated products. They are two scopes within the same IA, using the same overall interaction model.

---

## 6. In My Hood

`In My Hood` is the unified list of people already admitted into the hood for that sport.

Sources may include:

- Contact Players
- Saved Players
- Players from Shared Groups

Rules:

- one real person should appear as one card
- people are not separated into large source-specific pages
- source is expressed as lightweight secondary context, not as top-level IA fragmentation

---

## 7. Discover

`Discover` is the other scope within the same page framework.

It may include:

- Club Members
- Played With
- future discover sources

Its role is to help the user:

- find people not yet in the hood
- save or bring them into the hood
- enter invite flows where rules allow

### 7.1 Shared interaction rule

`Discover` must not become a completely separate UI world from `In My Hood`.

Both scopes should share:

- search
- filters
- card style
- preview / detail reveal
- invite entry points

---

## 8. Hoods Visual Density

### 8.1 Default list density

The Hoods main list should stay highly minimal.

Default visible content on a person card:

- avatar
- display name

### 8.2 Do not show persistent tag walls by default

Do not make the default list noisy with always-visible labels such as:

- Contact
- Saved
- From Group
- Female
- club name
- Linked
- level

### 8.3 Secondary reveal pattern

Extra information should be revealed through secondary interaction, such as:

- hover
- click avatar
- click info
- right-click or `More`
- detail drawer

### 8.4 Responsibility split

The default list is responsible for:

- fast recognition
- fast selection
- fast invitation

The detail layer is responsible for:

- source
- group
- club
- gender
- level
- linked state
- other context

---

## 9. Hoods Filters and Sorting

The list stays visually minimal, but the hood must still support strong filtering and sorting.

### 9.1 Filters

Support filters by:

- source
- specific Shared Groups
- club
- gender
- level
- play style
- linked status
- availability

Source filter values may include:

- Contact
- Saved
- From Shared Group
- Discover

### 9.2 Sorting

Support sorting by:

- recently active
- recently interacted
- alphabetical
- club
- group
- gender
- source

### 9.3 Design intent

The system should not rely on many source tabs. The organizing model is:

- one unified people flow
- scope toggle
- filters
- sorting

---

## 10. Hoods Person Cards

Default card content:

- avatar
- display name

Primary action:

- `Invite to Match`

Secondary actions should be available through hover, `More`, or preview:

- `View`
- `Save / Unsave`
- `Add to Shared Group`
- `Edit Contact` for owner-only cases
- `View details`

### 10.1 Important rule

Information density must stay low. The main list must not become a tag wall.

---

## 11. Invite and Admission Model

Organizer-side people-add logic is standardized into three entry types:

1. `Invite People`
2. `Invite Groups`
3. `Visible to Groups`

Older terms should be retired from user-facing IA and copy, including:

- `Nominate a Player`
- `Direct Invite Contact Player`
- `Player recruit group`

### 11.1 Invite People

Applies to:

- registered users
- Contact Players

Rules:

- this is a named invitation to specific people
- Contact Players use this path
- multi-select is supported
- the primary candidate pool comes from the current sport hood

### 11.2 Invite Groups

Applies to:

- registered members of a Shared Group

Rules:

- this is a group-level invite
- do not pre-create participant rows for every member
- create a participant row only when a specific member accepts

### 11.3 Visible to Groups

Applies to:

- Shared Groups

Rules:

- these groups can see the match
- members may request to join
- this is not an active invitation

### 11.4 Member-side response model

Member actions are standardized as:

- `Accept Invite`
- `Request to Join`

Mapping:

- `Invite People` / `Invite Groups` -> `Accept Invite`
- `Visible to Groups` -> `Request to Join`

---

## 12. Groups IA

`Groups` is an independent main navigation area. It is not a source tab under `Hoods`.

### 12.1 Groups list page

The Groups home page lists all Shared Groups.

Each group card should show:

- group name
- sport
- member count
- owner / captain / keeper
- latest activity or board summary
- quick actions

Quick actions may include:

- `Open Group`
- `Invite Group to Match`
- `Create Post`
- `Manage Group`

### 12.2 Group detail page

Each Shared Group opens into its own space.

Recommended structure:

- `Overview`
- `Board`
- `Discussion`
- `Files`

`Overview` includes:

- group basic info
- members
- roles
- rules
- sport
- owner / captain / admins

`Board` includes:

- announcements
- pinned posts
- training posts
- match or recruit posts

`Discussion` includes:

- group communication
- future threaded discussion where needed

`Files` includes:

- documents
- images
- links
- future shared resources

### 12.3 Shared Group principle

A Shared Group must satisfy:

- members know they belong to the group
- the boundary is shared, not hidden
- management may be concentrated in captain / keeper roles
- membership awareness remains shared

---

## 13. Messaging Boundary

Group communication belongs in:

- Group detail page
- Board
- Discussion
- Files

Personal or direct communication remains in:

- Inbox
- Messages

### 13.1 Important rule

Do not push group chat, notice, or file management back into `Hoods`.

`Hoods` only handles the people pool.

---

## 14. Proxy Placement

`Proxy` does not live inside `Hoods`.

Its canonical placement is:

- `My Profile -> Match Proxy`

### 14.1 Why

Proxy is:

- long-term relationship management
- cross-match
- cross-person
- not part of the core day-to-day people-pool browsing task

### 14.2 What Hoods may still show

Hoods or person detail may show lightweight proxy state or an entry point, but must not become the main proxy-management surface.

---

## 15. Notification Principle

Hoods, Groups, and Proxy follow a **low-interruption notification** model.

Rules:

- avoid interrupting unless necessary
- changes not directly related to the user should not proactively notify
- prefer in-page summary first
- use blue dots or lightweight indicators second
- Hoods is not a message center

### 15.1 Hoods notifications

Hoods should only surface directly relevant changes such as:

- a new person entering my hood
- my contact becoming linked
- a group change I own that affects my hood

### 15.2 Groups notifications

Proactive notification should be considered mainly when:

- I am owner / captain / keeper
- the group change directly affects me
- there is an announcement or action requiring my attention

Ordinary member changes should remain low-interruption whenever possible.

---

## 16. Explicit Non-goals for This Phase

Do not build the following in this phase:

- Private List
- Linked management tab
- Proxy tab inside Hoods
- group communication inside Hoods
- group announcements, files, or discussion as Hoods responsibilities
- a separate fragmented UI system for Discover

---

## 17. Terminology and Migration Rule

At the IA and user-facing copy layer:

- prefer `Hoods` over `Players`
- prefer `Shared Groups` / `Groups` over private-list style grouping language
- prefer `Invite People`, `Invite Groups`, and `Visible to Groups` over older invite terminology

If older technical residue remains in code, schema, or historical documents, treat it as implementation legacy rather than the target IA vocabulary.

---

## 18. Canonical Statement

**Hoods = sport-scoped people network.**  
**Groups = shared communication and organization space.**

Hoods unify Contact Players, Saved Players, and Players from Shared Groups within the current sport through scope toggle, filters, sorting, and secondary detail reveal rather than through many source-specific pages.

Groups exist as a first-level navigation area and carry group list, group detail, announcement, discussion, files, and future organization capability distinct from generic external chat groups.

Proxy returns to `My Profile` for primary management.  
Private List is not part of the current phase.  
Sport hood tabs only show sports enabled in profile.  
Person cards remain minimal by default, showing avatar and name first, with richer context revealed secondarily.
