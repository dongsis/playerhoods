# Group Contract v1 (playerhoods.com)

> Status: **Frozen (v1)**  
> Scope: **All Group-related slices (DB / RLS / Service / UI)**  
> Dependency: **Must be used together with `GroupConstitution.md`**

---

## 0. Purpose

This document defines **system-level contracts** for Group-related enums and invariants.

- These values are **authoritative**.
- No slice may introduce new enum values without a new contract version.
- SQL, RLS, TypeScript, and UI must all conform to this file.

---

## 1. Core Dependency Rule (Mandatory)

Every slice involving Group **must explicitly declare**:

```
Dependency: Must be used together with `docs/constitution/Group Constitution.md`
`docs/governance/Group Governance – Technical Appendix.md`
```

And must follow this instruction:

> *Do not introduce new enum values or reinterpret existing ones.*

---

## 2. Group Enums

### 2.1 `group_type`

| Value | Description |
|------|-------------|
| `direct` | 2–4 members, peer-based, no organizer |
| `organized` | ≥5 members, requires boundary keeper |

**Invariants**
- `direct` groups must never require approval workflows
- `organized` groups must have a boundary keeper

---

### 2.2 `join_policy`

| Value | Applies To | Description |
|------|-----------|-------------|
| `invite_only` | direct / organized | Join only via invitation |
| `organizer_approval` | organized | Join requires boundary keeper approval |
| `auto_join` | organized | Eligible users auto-join |

**Invariants**
- `direct` groups: **only** `invite_only`
- `organized` groups: may use any of the above

---

### 2.3 `visibility`

| Value | Description |
|------|-------------|
| `private` | Visible only to members |
| `discoverable` | Discoverable and requestable |
| `link_accessible` | Accessible only via link |

---

## 3. Group Member Enums

### 3.1 `status`

| Value | Description |
|------|-------------|
| `pending` | Awaiting acceptance |
| `active` | Active member |
| `removed` | Removed (historical record) |

---

### 3.2 `join_method`

| Value | Description |
|------|-------------|
| `invited` | Invited by an existing member |
| `applied` | Applied to join |
| `link` | Joined via link |
| `founder` | Group creator |

---

## 4. Size & Governance Rules

### 4.1 Direct Group

- Member count (pending + active) **≤ 4**
- No organizer role
- No approval workflow

### 4.2 Organized Group

- Member count ≥ 5 (may start smaller during creation)
- Must have `boundary_keeper_user_id`
- Governance enforced via join_policy

---

## 4.3 View: `group_details` (Contract-level API)

The `group_details` view is the **Contract-level read API** for Group data.
Column order is **locked** and must not change in v1.

### Locked Column Order (positions 1-18)

| Position | Column Name | Type | Source |
|----------|-------------|------|--------|
| 1 | `id` | uuid | groups |
| 2 | `group_type` | text | groups |
| 3 | `name` | text | groups |
| 4 | `visibility` | text | groups |
| 5 | `join_policy` | text | groups |
| 6 | `created_by` | uuid | groups |
| 7 | `boundary_keeper_user_id` | uuid | groups |
| 8 | `invite_code` | text | groups |
| 9 | `invite_code_expires_at` | timestamptz | groups |
| 10 | `invite_code_max_uses` | integer | groups |
| 11 | `invite_code_uses` | integer | groups |
| 12 | `created_at` | timestamptz | groups |
| 13 | `updated_at` | timestamptz | groups |
| 14 | `member_count` | integer | computed |
| 15 | `pending_count` | integer | computed |
| 16 | `boundary_keeper_name` | text | computed (profiles) |
| 17 | `club` | text | groups (weak field) |
| 18 | `skill_level` | text | groups (weak field) |

### Rules
- `club` and `skill_level` are optional free-text metadata fields.
- They are weak fields and must not affect governance, eligibility, or RLS.
- Weak fields must never be used for:
  - eligibility
  - access control
  - visibility
  - RLS decisions

- **NO `table.*`**: View must use explicit column list
- **Column order is immutable** for v1
- **Future fields**: Must append after position 18 only
- **Migration**: Use `CREATE OR REPLACE VIEW` (after initial 009 migration)

---

## 5. Prohibited Concepts (Explicit)

The following **must never appear** in v1:

- Friends
- Followers
- Feeds
- Likes
- Scores / Ratings
- Chat systems
- Implicit social graphs

Any appearance requires immediate revision.

---

## 6. Versioning Rule

- Any new enum value requires:
  1. A new contract file (e.g. `GroupContract_v2.md`)
  2. Explicit migration slice
  3. Full DB / RLS / UI impact review

---

## 7. Final Authority

> If any slice output conflicts with this document, **this document wins**.

This contract overrides individual slice implementations.

