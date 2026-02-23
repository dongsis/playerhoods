---
name: playerhoods-migrations
description: Migration safety and schema evolution rules for playerhoods.com v1.5. Enforces append-only evolution, identity safety, and invariant preservation.
license: Proprietary
metadata:
  domain: playerhoods.com
  version: "1.5"
  layer: migrations
---

# PlayerHoods Migration Safety Skill

This skill enforces safe schema evolution.

## Core invariant: non-destructive evolution

Claude MUST NOT generate migrations that:

- DROP identity tables
- DROP club_identities
- DROP club_admins
- mutate identity authority columns directly

Allowed:

- CREATE TABLE
- ALTER TABLE ADD COLUMN
- CREATE INDEX
- CREATE RPC

Restricted:

- ALTER identity authority columns
- direct mutation of identity structure

## Identity safety invariant

club_identities is the authoritative identity layer.

Claude must not generate migrations that bypass club_identities.

## Governance invariant

groups remain sole relationship container.

Migration must not introduce alternate membership models.

## Migration review workflow

Before generating migration, Claude must verify:

- invariant safety
- identity safety
- governance consistency
