---
name: playerhoods-rpc-authority
description: RPC authority and SECURITY DEFINER enforcement rules for playerhoods.com v1.4. Ensures all identity and governance mutations occur via secure RPC.
license: Proprietary
metadata:
  domain: playerhoods.com
  version: "1.4"
  layer: rpc
---

# PlayerHoods RPC Authority Skill

This skill enforces RPC authority model.

## Core invariant: RPC-only mutation

Claude must generate RPC for:

- identity writes
- membership writes
- governance writes

Direct table mutation must not be used.

## SECURITY DEFINER invariant

All governance RPC must include:

SECURITY DEFINER

## Auth invariant

All RPC must validate:

auth.uid()

Example pattern:

DECLARE
  v_user_id uuid := auth.uid();

IF v_user_id IS NULL THEN
  RAISE EXCEPTION 'not authenticated';
END IF;

## Authority boundary invariant

Only authorized roles may mutate governance state.

RPC must enforce authority checks.

## Identity invariant

club_identities must be mutated only via RPC.

Never directly update profiles identity fields.
