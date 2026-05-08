# Release Governance

Last updated: 2026-05-08

This document defines how PlayerHoods tracks production-related changes across code, deployments, and databases.

## Environments

| Environment | Definition | Notes |
|---|---|---|
| Local | The developer workspace on this machine. | May contain uncommitted changes, local logs, local builds, and local database state. Local is not production. |
| GitHub | The remote repository state, especially `main`. | A commit on GitHub is source-controlled, but not automatically proven deployed or applied to any database. |
| Vercel Preview | A non-production Vercel deployment, usually branch/PR scoped. | Useful for review, but not the production user surface. |
| Vercel Production | The production web deployment served to users. | Must be reconciled to a specific Git commit before being called aligned. |
| Supabase Local | The local Supabase stack and local database. | Used for migration rehearsal and local testing. It does not prove remote database state. |
| Supabase Remote | The production Supabase project and remote database. | Must be checked independently with remote migration state before being called aligned. |

## Change Types

| Type | Definition |
|---|---|
| Patch | A small, low-risk change with limited blast radius. Usually UI copy, local styling, minor bug fix, or docs. May not require a migration. |
| Mini Release | A bounded product change that touches multiple files or one small flow. May include a migration if the migration is additive and narrow. Requires a clear verification plan. |
| Structural Release | A change that affects canonical identity, permissions, data model, business workflow, database functions, migration semantics, or multi-surface behavior. Requires explicit release assessment, rollout order, verification, and rollback plan. |

## Release States

| State | Definition |
|---|---|
| Draft | Local-only work. Not committed to GitHub. Not deployed. Not applied to Supabase Remote. |
| GitHub only | Committed and pushed to GitHub, but not confirmed deployed to Vercel Production or applied to Supabase Remote. |
| Production deployed | Confirmed deployed to Vercel Production at a specific commit. Database state may still be pending. |
| DB remote applied | Confirmed applied to Supabase Remote through a specific migration. Web production deployment may still be pending. |
| Production aligned | GitHub main, Vercel Production, and Supabase Remote are reconciled and point to the expected commit/migration state. |
| Verified | Production aligned and required production smoke/core-flow checks have passed. |
| Rolled back | A previous production change has been reverted or superseded by a rollback commit, deployment, and/or database rollback/fix migration. |

## Unknown Rule

If a state cannot be confirmed from reliable evidence, write `Unknown`.

Do not guess. Do not infer production deployment, remote database application, or production verification from local success alone.

Examples:

- If GitHub has a commit but Vercel Production commit was not checked, Vercel Production is `Unknown`.
- If a migration exists locally but `supabase migration list --linked` was not checked, Supabase Remote is `Unknown`.
- If the login page loads but core flows were not tested, production verification is `login page only; core flows not verified`.

## Environment Impact Report

Codex must output an Environment Impact Report for every task that touches or evaluates production-related code, database behavior, release state, deployment state, or production verification.

The report must include:

- Local worktree impact
- GitHub impact
- Vercel Preview impact
- Vercel Production impact
- Supabase Local impact
- Supabase Remote impact
- Production verification impact
- Unknowns

If there is no impact for an environment, write `No change`.

## Production Change Log Requirement

Every production-related change must update `docs/00_PRODUCTION_CHANGE_LOG.md`.

This includes:

- Production baseline records
- GitHub-only changes intended for production
- Vercel Production deployments
- Supabase Remote migration applications
- Production verification results
- Rollbacks
- Structural Release assessments

The change log should state what is known and mark unknowns explicitly.
