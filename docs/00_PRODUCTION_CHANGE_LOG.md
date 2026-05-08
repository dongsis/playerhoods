# Production Change Log

This log records production-related baselines, releases, deployment/database alignment, verification, and rollback status.

## 2026-05-08 - Production Baseline

| Field | Value |
|---|---|
| Date | 2026-05-08 |
| Change ID | baseline-2026-05-08-bc36051 |
| Type | Production Baseline |
| GitHub main | bc3605189be29fc432747f6ad728161140e90827 |
| Vercel Production | bc3605189be29fc432747f6ad728161140e90827 |
| Supabase Remote latest migration | 20260508144500_mark_legacy_group_invite_user_rpc.sql |
| Status | Production aligned, full smoke test pending |
| Production verification | login page reachable only; core flows not verified |
| Notes | local worktree contains uncommitted contact/link/person-scope changes and local runtime logs; these are not part of production. |

Environment Impact Report:

| Environment | Impact |
|---|---|
| Local | Baseline recorded from local reconciliation. Local worktree still contains uncommitted contact/link/person-scope changes and local runtime logs. |
| GitHub | GitHub main confirmed at `bc3605189be29fc432747f6ad728161140e90827` before this documentation change. |
| Vercel Preview | Unknown. |
| Vercel Production | Confirmed at `bc3605189be29fc432747f6ad728161140e90827` before this documentation change. |
| Supabase Local | No production baseline impact. |
| Supabase Remote | Confirmed latest remote migration `20260508144500_mark_legacy_group_invite_user_rpc.sql` before this documentation change. |
| Production verification | Login page reachable only; full core flows pending. |
