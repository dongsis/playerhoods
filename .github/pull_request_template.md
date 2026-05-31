## Issue

Fixes #

## Summary

-

## Risk

- [ ] SMS reply parser
- [ ] Notification delivery
- [ ] Supabase migration
- [ ] Contact Player invite
- [ ] Magic link / email invitation
- [ ] Timezone / SMS copy
- [ ] No product runtime risk

## Required Behavior

- [ ] One participant/invite has one active RSVP code
- [ ] YES / NO / OUT / DETAILS use the same code
- [ ] Duplicate Contact Player invite does not create duplicate invitation anchors
- [ ] Duplicate Contact Player invite does not send duplicate SMS
- [ ] Confirmed / removed conflict requires explicit NO / OUT / decline link evidence
- [ ] SMS copy uses recipient name when available
- [ ] SMS time uses match local timezone
- [ ] No real SMS/email is sent during automated tests

## Tests

- [ ] `npm run verify:build`
- [ ] `npm run verify:sql`
- [ ] `npm run test:sms-rsvp`
- [ ] Not completed:

## Migration

Migration file:

No migration needed:

Rollback plan:

## Files Changed

-

## User Flow Affected

-

## Conflict Scan Result

-

## Environment Impact Report

Local code:

GitHub:

Vercel Preview:

Vercel Production:

Supabase Local:

Supabase Remote:

Production verification:

Unknowns:

## Screenshots / Logs

-

## Recommended Next Step

-
