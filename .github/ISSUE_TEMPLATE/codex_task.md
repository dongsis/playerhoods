---
name: Codex task
about: Plan and execute a scoped Codex task with explicit safety gates
title: ''
labels: triage-needed
assignees: ''
---

## Repo Workflow Rule

Do not work directly on `main`. Do not push `main`. Do not pull, rebase, or merge into a dirty worktree. Do not run destructive cleanup or stash without explicit approval. Create a clean worktree from latest `origin/main`, create a dedicated branch, keep the PR diff limited to approved files, and report `git status`, changed files, branch name, verification results, and confirmation that no unrelated dirty files are included before commit/push.

## Summary

-

## Scope

-

## Non-Goals

-

## Allowed Files / Likely Files

-

## DB Impact

- None expected / TBD.

## PII / Privacy Impact

- None expected / TBD.

## Notification / Email / SMS Impact

- None expected / TBD.

## Validation Requirements

- `git diff --check`
- Build/typecheck if app or package files change
- SQL regression if database behavior changes
- Other:

## Stop Conditions

- Scope is ambiguous or expanding
- Unrelated dirty files are present
- PII exposure risk appears
- Lifecycle enum/check constraint changes are needed
- Supabase Remote migration would be required
- Production deploy or production delivery would be required
- Required validation is blocked

## Required Final Report

- Issue / PR:
- Branch:
- Worktree:
- Changed files:
- Validation results:
- Blocked validations:
- PII/privacy impact:
- Environment impact:
- Unrelated dirty files included: Yes/No

## Production / Remote Gate

Do not merge, deploy, apply Supabase Remote migrations, run production validation, or send production notification/email/SMS traffic without explicit owner approval.
