# Rebaseline Decision (V2.0)

## Decision

Approve Database Re-Baseline for V2.0 using a single frozen source point.

## Frozen Source Point

- Source branch: `v2.0`
- Source commit: `03522d7`
- Semantic label: guest invitation baseline governance complete
- Freeze rule: no DB semantic rewrites during baseline generation

## Goal Boundary

This rebaseline is for migration history reset strategy and governance hardening only.

Included:

- baseline SQL set
- security and RLS baseline
- required minimal seed
- migration archive and cutover strategy
- reset and validation procedure

Excluded:

- new product features
- large domain redesign
- bulk unverified function drops

## Governance Rules After Cutover

1. Reset starts from baseline SQL set.
2. New changes are append-only migrations after baseline.
3. Legacy cleanup drops objects via new migrations, never by rewriting history files.
4. Baseline docs are the authority-first read path for semantics.

## Approval Gate

Cutover is allowed only when all are true:

- local empty-db validation passed
- functional validation passed
- security validation passed
- staging validation passed
- authoritative docs updated
- archive strategy executed
