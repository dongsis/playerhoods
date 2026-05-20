# PlayerHoods Layered QA Plan

This plan keeps browser automation small and moves most risk coverage into cheap,
repeatable layers.

## Layer 1: Dev Flow State Gallery

Route: `/dev/qa-flows`

Purpose:
- Render important UI card states without walking complete product flows.
- Provide stable `data-testid` anchors before writing any browser tests.
- Stay local/dev-only by default.

Covered state families:
- Welcome card: `0`, `1`, `2`, `3+` saved Player Cards
- Match card: draft, open, pending, formed, canceled
- Invite card: pending, accepted, declined, expired, canceled
- Request to Join card: sent, approved, declined, withdrawn, match full
- Player card: registered, contact, private, blocked
- Group contact card: shared, saved, linked

## Layer 2: QA Seed Data

Script:

```bash
npm run qa:seed
npm run qa:seed:apply
```

Seed personas:
- Host A new user
- Player B open to discovery/invites
- Player C strict privacy
- Contact D unregistered email/phone contact
- Host E second host

The script is dry-run by default. `--apply` requires service-role credentials.

## Layer 3: SQL Integration Tests

Runner: `tests/test_runner_qa_core_business_logic.sql`

Coverage:
- Invite eligibility
- Privacy restrictions
- Block override
- Duplicate invite prevention
- Contact Player vs registered user handling
- Match formed logic
- Request-to-join transition primitives

These checks should run before any E2E suite because they catch business-rule drift
without browser flake.

## Layer 4: Small Playwright Suite

Add only after Layers 1-3 are stable.

Maximum first suite:
- New user adds one contact and creates singles match
- User adds three contacts and creates doubles match
- Host invites registered player and player accepts
- Host invites unregistered contact
- Player requests to join and host approves

Rules:
- Use `data-testid` selectors only.
- Avoid CSS selectors and fixed sleeps.
- Use web-first assertions.
- Enable Playwright traces only for this small suite.
