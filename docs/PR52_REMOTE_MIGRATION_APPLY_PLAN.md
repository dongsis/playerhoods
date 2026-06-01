# PR #52 Remote Migration Apply Plan

Issue #48 migration:

```text
supabase/migrations/20260531120000_issue48_one_sms_code_one_pending_anchor.sql
```

Status as of this PR:

- GitHub: PR only, not merged.
- Vercel Production: not deployed by this PR.
- Supabase Remote: not applied.
- Production verification: not verified.
- Real SMS/email/provider traffic: not sent by tests.

## Controlled Window

Apply the Supabase Remote migration only after explicit owner approval.

Use a quiet window where invite, SMS reply, notification delivery, and Add More Players mutation traffic is paused or operationally quiet. The migration performs duplicate cleanup before adding partial unique indexes, so concurrent rows during that window could create avoidable apply risk.

## Pre-Apply Read-Only Checks

Run before applying the migration on Supabase Remote.

Duplicate active unconsumed SMS RSVP codes per participant:

```sql
select
  participant_id,
  count(*) as active_code_count,
  array_agg(id order by created_at desc, id desc) as code_ids,
  array_agg(code order by created_at desc, id desc) as codes
from public.match_participant_sms_reply_codes
where consumed_at is null
group by participant_id
having count(*) > 1
order by active_code_count desc, participant_id;
```

Duplicate pending email invitation anchors per participant:

```sql
select
  match_participant_id,
  count(*) as pending_anchor_count,
  array_agg(id order by created_at desc, id desc) as invitation_ids
from public.email_invitations
where match_participant_id is not null
  and status = 'pending'
group by match_participant_id
having count(*) > 1
order by pending_anchor_count desc, match_participant_id;
```

Current queued invite/SMS delivery state:

```sql
select
  channel,
  status,
  count(*) as delivery_count
from public.notification_deliveries
where channel in ('sms', 'email')
  and status in ('queued', 'processing', 'retry')
group by channel, status
order by channel, status;
```

Existing active reply-code volume:

```sql
select
  count(*) as active_sms_reply_codes
from public.match_participant_sms_reply_codes
where consumed_at is null;
```

Existing pending participant-anchor volume:

```sql
select
  count(*) as pending_participant_anchors
from public.email_invitations
where match_participant_id is not null
  and status = 'pending';
```

## Apply Procedure

Do not run this until owner approval is explicit.

Recommended procedure:

```text
1. Confirm GitHub PR #52 merge commit is the intended release commit.
2. Confirm Vercel Production deployment state separately.
3. Confirm invite/SMS mutation traffic is quiet.
4. Run the pre-apply read-only SQL checks above and save results.
5. Apply the Supabase migration using the project-approved Supabase Remote deploy procedure.
6. Run the post-apply verification SQL below and save results.
7. Run controlled production validation.
```

Example command, if this repository's standard Supabase CLI release procedure is approved for the target project:

```bash
supabase db push
```

If the production process uses a different approved migration command or dashboard action, use that instead and record the exact command/action in the production change log.

## Post-Apply Verification SQL

Confirm there are no duplicate active unconsumed SMS codes:

```sql
select
  participant_id,
  count(*) as active_code_count
from public.match_participant_sms_reply_codes
where consumed_at is null
group by participant_id
having count(*) > 1;
```

Expected result: zero rows.

Confirm there are no duplicate pending email anchors:

```sql
select
  match_participant_id,
  count(*) as pending_anchor_count
from public.email_invitations
where match_participant_id is not null
  and status = 'pending'
group by match_participant_id
having count(*) > 1;
```

Expected result: zero rows.

Confirm unique indexes exist:

```sql
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'uq_match_participant_sms_reply_codes_one_unconsumed',
    'uq_email_invitations_one_pending_match_participant'
  )
order by indexname;
```

Expected result: two rows.

Confirm updated functions exist, including the legacy 5-arg compatibility signature:

```sql
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'notification_create_or_get_sms_reply_code',
    'notification_match_payload',
    'rpc_sms_reply_handle',
    'rpc_email_invitation_create'
  )
order by p.proname, args;
```

Expected result includes:

```text
rpc_email_invitation_create(p_target_email text, p_target_name text, p_related_type text, p_related_id uuid, p_expires_at timestamp with time zone)
rpc_email_invitation_create(p_target_email text, p_target_name text, p_related_type text, p_related_id uuid, p_expires_at timestamp with time zone, p_target_phone text)
```

The 6-argument signature is transactionally recreated by the migration without default arguments. This avoids PostgreSQL overload ambiguity while preserving both the legacy 5-argument contract and the SMS-capable 6-argument contract after the migration has completed.

Confirm no real-provider validation traffic was sent by the SQL checks:

```sql
select
  channel,
  status,
  count(*) as delivery_count
from public.notification_deliveries
where channel in ('sms', 'email')
  and created_at >= now() - interval '30 minutes'
group by channel, status
order by channel, status;
```

This query is observational only. Do not drain or process queued production deliveries unless separately approved.

## Production Validation Plan

Use controlled validation after merge, deploy, and remote migration apply are each explicitly confirmed.

- SQL-level validation: run the post-apply verification SQL above.
- No-real-SMS validation: validate generated SMS copy and RSVP code reuse through database rows or mocked/non-sending paths only.
- Provider validation: do not send real Twilio/SMS/email traffic unless separately approved.
- Webhook validation: if inbound SMS behavior must be checked, use a signed test webhook path or SQL-level RPC call with disposable test data only.
- User-facing validation: verify invitation links and match participant state with disposable test participants.

## Rollback

Rollback is forward-only.

- If a function behavior issue is found, apply a follow-up migration restoring prior function definitions or adding a compatibility wrapper.
- If an index blocks a required production behavior, apply a follow-up migration relaxing or replacing the affected partial unique index.
- Data cleanup is not perfectly reversible from database state alone because superseded SMS codes are consumed and duplicate pending anchors are canceled with metadata.
- Code rollback alone is insufficient after Supabase Remote migration apply.

## Merge Gate

Do not merge PR #52 until:

- Build/typecheck is passing.
- SQL Regression Check is passing.
- Full SQL suite is passing.
- Issue #48 SQL runner is passing.
- SMS copy guard is passing.
- Codex PR Review is PASS, PASS_WITH_CAVEAT, or owner-accepted with documented caveats.
- This remote apply plan is reviewed.
- Owner explicitly approves merge.
