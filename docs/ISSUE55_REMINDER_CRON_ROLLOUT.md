# Issue #55 Reminder Cron Rollout

This note covers the production rollout gate for the reminder-only scheduled drain.

## Scope

- Vercel Cron calls only `/api/notifications/drain-reminders`.
- The generic `/api/notifications/drain` route remains manual and is not scheduled.
- The cron endpoint uses the #58 reminder-only drain path.
- A Supabase migration narrows reminder eligibility to a day-before sweep.

## Auth

Vercel Cron invokes cron paths with `GET`.

- Cron `GET /api/notifications/drain-reminders` requires `CRON_SECRET`.
- Manual `POST /api/notifications/drain-reminders` continues to require `NOTIFICATION_DRAIN_SECRET`.
- Missing or invalid auth returns the hidden `404 { "error": "not_found" }` response.
- The schedule is `0 21 * * *`, which is 21:00 UTC. This is around 5:00 PM in Ontario during summer time.
- Vercel Hobby cron is daily and not minute-precise; this is a day-before sweep, not near-real-time reminder delivery.

Before merge/production activation, set `CRON_SECRET` in Vercel Production. The value may match `NOTIFICATION_DRAIN_SECRET`, but it must be configured as `CRON_SECRET` because Vercel automatically sends that variable as the cron `Authorization: Bearer ...` header.

## Reminder Eligibility

The daily sweep should enqueue/process reminders only for:

- active, formed matches
- match local date is tomorrow, using the venue timezone when available
- confirmed participants only: `participant_accepted_at`, `org_approved_at`, and `removed_at is null`
- non-organizer participants
- `match_reminder` notification type only

Not eligible:

- same-day matches
- past matches
- unformed matches
- pending, waiting, declined, withdrawn, or removed participants
- invite, host-managed confirmation, confirmed lineup, critical update, cancellation, or generic queued deliveries

## Preflight Before Production Activation

Run read-only checks before merge or before observing the first cron run:

```sql
select d.delivery_status,
       d.payload->>'template_type' as template_type,
       d.channel,
       count(*) as count
from public.notification_deliveries d
where d.delivery_status in ('queued', 'sending')
group by d.delivery_status, d.payload->>'template_type', d.channel
order by template_type, d.delivery_status, d.channel;

select public.notification_reminder_drain_preview(50);
```

Expected safe state:

- queued/sending deliveries are understood and acceptable
- queued/sending non-reminders are zero or explicitly accepted
- `wouldProcess.total` is expected
- `queuedReminderDeliveries.total` is expected
- `dueReminderCandidates.total` is expected
- same-day and past reminders are skipped

## First Cron Observation

After production deployment and owner approval:

- Observe Vercel logs for `GET /api/notifications/drain-reminders`.
- Confirm no requests hit `/api/notifications/drain`.
- Confirm only reminder delivery rows are claimed or sent.
- Confirm no invite, host-managed confirmation, confirmed lineup, critical update, cancellation, or generic queued deliveries are processed.
- Confirm no unexpected provider traffic.

## Rollback / Disable

Fast disable:

- Remove or rotate `CRON_SECRET`; cron requests will fail auth and return 404.
- Disable Cron Jobs in the Vercel dashboard if immediate pause is needed.

Code rollback:

- Revert the cron wiring commit or remove `vercel.json` in a follow-up PR.

Database rollback:

- None for this PR.
