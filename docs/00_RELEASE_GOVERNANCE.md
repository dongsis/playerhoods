# Release Governance

Last updated: 2026-05-08

This document is the rulebook for Codex, Cursor, Claude Code, and maintainers when changing PlayerHoods production-related code, database behavior, deployment state, or release documentation.

`00_RELEASE_GOVERNANCE.md` records rules.  
`00_PRODUCTION_CHANGE_LOG.md` records facts.

## Environment Definitions

| Environment | Definition | Do Not Confuse With |
|---|---|---|
| Local code | The current workspace on this machine, including uncommitted files. | GitHub, Preview, Production |
| GitHub | The remote repository state, especially `main`. | Vercel Production or Supabase Remote |
| Vercel Preview | Non-production Vercel deployment for branch/preview review. | Production |
| Vercel Production | The production web deployment served to users. Must be tied to a specific commit before being called deployed. | GitHub commit alone |
| Supabase Local | Local Supabase stack and local database. Useful for migration rehearsal. | Supabase Remote |
| Supabase Remote | Production Supabase project and remote database. Must be checked directly for migration state. | Local migration files |

## Release Types

| Type | Definition | Logging Requirement |
|---|---|---|
| Patch | Small, low-risk change with limited blast radius, such as docs, copy, minor UI, or a narrow bug fix. | One change-log row is usually enough unless production state is affected. |
| Mini Release | Bounded product change touching a small flow or multiple files. May include a narrow additive migration. | Change-log row plus short notes and verification status. |
| Structural Release | Change affecting canonical identity, permissions, RLS, RPCs, migrations, data model, invitation/request/confirmation flows, Contact Player, Identity Link, Saved/Invite Circle, Request Scope, Group/Hoods visibility, or other multi-surface behavior. | Detailed change-log block required, including rollout, verification, rollback, and known risks. |

## Status Definitions

| Status | Definition |
|---|---|
| Draft | Local changes only, not committed. |
| GitHub only | Committed to GitHub, not confirmed deployed. |
| Preview deployed | Confirmed deployed to Vercel Preview. |
| Production deployed | Confirmed deployed to Vercel Production at a specific commit. |
| DB remote applied | Related Supabase migration confirmed applied to Supabase Remote. |
| Production aligned | GitHub main, Vercel Production, and Supabase Remote are aligned for the change. |
| Verified | Required production smoke/core-flow checks passed. Login page reachability alone is not full verification. |
| Rolled back | Change was reverted, disabled, or superseded by a rollback commit/deployment/fix migration. |

## Unknown Rule

If a status cannot be confirmed, write `Unknown`. Do not infer.

Required examples:

- A GitHub commit is not the same as Vercel Production deployed.
- A migration file created locally or committed to GitHub is not the same as Supabase Remote applied.
- A successful local build is not production verification.
- A reachable login page is not a full production smoke test.

## Required Start-of-Task Reading

For production-related work, read these first:

1. `docs/00_RELEASE_GOVERNANCE.md`
2. `docs/00_PRODUCTION_CHANGE_LOG.md`

Then classify the change as Patch, Mini Release, or Structural Release before acting.

## Required Final Report

Every Codex task that touches or evaluates production-related work must end with an Environment Impact Report.

The report must include:

- Local code impact
- GitHub impact
- Vercel Preview impact
- Vercel Production impact
- Supabase Local impact
- Supabase Remote impact
- Production verification impact
- Current status
- Unknowns

If there is no impact for an environment, write `No change`.

## Required Change Log Update

Every production-related change must update:

`docs/00_PRODUCTION_CHANGE_LOG.md`

This includes local-only Draft changes, GitHub-only commits, Vercel Production deployments, Supabase Remote migration applications, production verification, rollback, and release assessments.

Each record must include:

1. Date
2. Change ID
3. Release Type
4. Summary
5. GitHub commit hash
6. Migration file, if any
7. Vercel Production status
8. Supabase Remote status
9. Production verification status
10. Current status
11. Rollback method

For Structural Releases, also include:

- Migration details
- Remote apply status
- Vercel deployment status
- Online verification steps
- Rollback method
- Known risks

## What Not To Record As Product Change

Do not record local runtime logs as product changes, including:

- `.next-start.err`
- `.next-start.out`
- `.next-dev.*`
- other generated local runtime logs

Do not record secrets, tokens, passwords, service-role keys, or private user data.

Safe to record:

- Commit hashes
- Migration filenames
- Deployment status
- Verification steps
- Rollback notes

## Fixed Language

Use precise language:

Correct:

> Current GitHub main committed content is aligned with Vercel Production and Supabase Remote. Local uncommitted changes are not part of production.

Incorrect:

> All current changes are in production.

Correct:

> Login page reachable only; core flows not verified.

Incorrect:

> Production verified.
