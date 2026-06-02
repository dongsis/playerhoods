-- Issue #55: daily day-before reminder sweep.
-- Vercel Hobby cron is daily; reminders are intentionally not near-real-time.

comment on column public.matches.player_reminder_minutes is
  'Match-level reminder setting. NULL means no reminder; non-null means send one day-before reminder during the daily reminder sweep. Same-day matches are skipped.';

create or replace function public.notification_should_send_match_reminder(
  p_match_id uuid,
  p_participant_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_match public.matches%rowtype;
  v_mp public.match_participants%rowtype;
  v_venue_tz text;
  v_local_tomorrow date;
  v_dedupe_key text;
begin
  select * into v_match from public.matches where id = p_match_id;
  select * into v_mp from public.match_participants where id = p_participant_id;

  if v_match.id is null or v_mp.id is null then
    return false;
  end if;

  select coalesce(v.timezone, 'America/Toronto')
  into v_venue_tz
  from public.venues v
  where v.id = v_match.venue_id;

  v_venue_tz := coalesce(v_venue_tz, 'America/Toronto');
  v_local_tomorrow := (now() at time zone v_venue_tz)::date + 1;
  v_dedupe_key := 'match_reminder:' || p_match_id::text || ':' || v_match.match_date::text;

  return v_match.status = 'active'
    and v_match.formed_at is not null
    and v_match.player_reminder_minutes is not null
    and v_match.match_date is not null
    and v_match.start_time is not null
    and v_match.match_date = v_local_tomorrow
    and public.notification_is_participant_confirmed(v_mp)
    and coalesce(v_mp.user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_match.organizer_id
    and not exists (
      select 1
      from public.match_participant_notification_events e
      where e.participant_id = p_participant_id
        and e.notification_type = 'match_reminder'
        and e.dedupe_key = v_dedupe_key
    );
end;
$$;

create or replace function public.notification_enqueue_match_reminder_if_needed(
  p_participant_id uuid
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_match_id uuid;
  v_match_date date;
begin
  select mp.match_id, m.match_date
  into v_match_id, v_match_date
  from public.match_participants mp
  join public.matches m on m.id = mp.match_id
  where mp.id = p_participant_id;

  if v_match_id is null or not public.notification_should_send_match_reminder(v_match_id, p_participant_id) then
    return null;
  end if;

  return public.notification_enqueue_for_participant(
    p_participant_id,
    'match_reminder',
    'match_reminder:' || v_match_id::text || ':' || v_match_date::text
  );
end;
$$;

create or replace function public.notification_enqueue_due_match_reminders(
  p_limit integer default 50
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer := 0;
  v_row record;
  v_delivery uuid;
begin
  for v_row in
    select mp.id
    from public.match_participants mp
    join public.matches m on m.id = mp.match_id
    left join public.venues v on v.id = m.venue_id
    where m.status = 'active'
      and m.formed_at is not null
      and m.player_reminder_minutes is not null
      and m.match_date = ((now() at time zone coalesce(v.timezone, 'America/Toronto'))::date + 1)
      and public.notification_should_send_match_reminder(m.id, mp.id)
    order by m.match_date asc nulls last, m.start_time asc nulls last
    limit greatest(1, p_limit)
  loop
    v_delivery := public.notification_enqueue_match_reminder_if_needed(v_row.id);
    if v_delivery is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.notification_reminder_drain_preview(
  p_limit integer DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_limit integer := greatest(1, p_limit);
  v_due_candidates jsonb;
  v_queued_reminders jsonb;
  v_would_process jsonb;
  v_skipped_non_reminders jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total', coalesce(sum(count), 0),
    'byChannel', coalesce(
      jsonb_agg(
        jsonb_build_object('channel', channel, 'count', count)
        ORDER BY channel
      ),
      '[]'::jsonb
    )
  )
  INTO v_due_candidates
  FROM (
    SELECT r.channel, count(*)::integer AS count
    FROM public.match_participants mp
    JOIN public.matches m ON m.id = mp.match_id
    LEFT JOIN LATERAL public.notification_recipient_for_participant(mp.id) r ON true
    WHERE m.status = 'active'
      AND m.formed_at IS NOT NULL
      AND m.player_reminder_minutes IS NOT NULL
      AND public.notification_should_send_match_reminder(m.id, mp.id)
      AND nullif(btrim(r.destination), '') IS NOT NULL
    GROUP BY r.channel
  ) grouped;

  SELECT jsonb_build_object(
    'total', coalesce(sum(count), 0),
    'byChannel', coalesce(
      jsonb_agg(
        jsonb_build_object('channel', channel, 'count', count)
        ORDER BY channel
      ),
      '[]'::jsonb
    )
  )
  INTO v_queued_reminders
  FROM (
    SELECT nd.channel, count(*)::integer AS count
    FROM public.notification_deliveries nd
    JOIN public.matches m ON m.id::text = nd.payload->>'match_id'
    JOIN public.match_participants mp ON mp.id::text = nd.payload->>'match_participant_id'
    LEFT JOIN public.venues v ON v.id = m.venue_id
    WHERE nd.delivery_status IN ('queued', 'sending')
      AND nd.payload->>'template_type' = 'match_reminder'
      AND m.status = 'active'
      AND m.formed_at IS NOT NULL
      AND m.player_reminder_minutes IS NOT NULL
      AND m.match_date = ((now() at time zone coalesce(v.timezone, 'America/Toronto'))::date + 1)
      AND public.notification_is_participant_confirmed(mp)
      AND coalesce(mp.user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> m.organizer_id
    GROUP BY nd.channel
  ) grouped;

  SELECT jsonb_build_object(
    'total', coalesce(sum(count), 0),
    'byNotificationType', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'notificationType', notification_type,
          'channel', channel,
          'count', count
        )
        ORDER BY notification_type, channel
      ),
      '[]'::jsonb
    )
  )
  INTO v_would_process
  FROM (
    SELECT 'match_reminder'::text AS notification_type, claimable.channel, count(*)::integer AS count
    FROM (
      SELECT nd.id, nd.channel
      FROM public.notification_deliveries nd
      JOIN public.matches m ON m.id::text = nd.payload->>'match_id'
      JOIN public.match_participants mp ON mp.id::text = nd.payload->>'match_participant_id'
      LEFT JOIN public.venues v ON v.id = m.venue_id
      WHERE nd.delivery_status = 'queued'
        AND nd.payload->>'template_type' = 'match_reminder'
        AND m.status = 'active'
        AND m.formed_at IS NOT NULL
        AND m.player_reminder_minutes IS NOT NULL
        AND m.match_date = ((now() at time zone coalesce(v.timezone, 'America/Toronto'))::date + 1)
        AND public.notification_is_participant_confirmed(mp)
        AND coalesce(mp.user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> m.organizer_id
      ORDER BY nd.created_at ASC
      LIMIT v_limit
    ) claimable
    GROUP BY claimable.channel
  ) grouped;

  SELECT jsonb_build_object(
    'total', coalesce(sum(count), 0),
    'byNotificationType', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'notificationType', notification_type,
          'channel', channel,
          'count', count
        )
        ORDER BY notification_type, channel
      ),
      '[]'::jsonb
    )
  )
  INTO v_skipped_non_reminders
  FROM (
    SELECT
      coalesce(e.notification_type, nd.payload->>'template_type', nd.payload->>'notification_type', 'unknown') AS notification_type,
      nd.channel,
      count(*)::integer AS count
    FROM public.notification_deliveries nd
    LEFT JOIN public.match_participant_notification_events e ON e.delivery_id = nd.id
    WHERE nd.delivery_status IN ('queued', 'sending')
      AND nd.payload->>'template_type' IS DISTINCT FROM 'match_reminder'
    GROUP BY coalesce(e.notification_type, nd.payload->>'template_type', nd.payload->>'notification_type', 'unknown'), nd.channel
  ) grouped;

  RETURN jsonb_build_object(
    'dueReminderCandidates', coalesce(v_due_candidates, jsonb_build_object('total', 0, 'byChannel', '[]'::jsonb)),
    'queuedReminderDeliveries', coalesce(v_queued_reminders, jsonb_build_object('total', 0, 'byChannel', '[]'::jsonb)),
    'wouldProcess', coalesce(v_would_process, jsonb_build_object('total', 0, 'byNotificationType', '[]'::jsonb)),
    'skippedNonReminderQueuedDeliveries', coalesce(v_skipped_non_reminders, jsonb_build_object('total', 0, 'byNotificationType', '[]'::jsonb))
  );
END;
$$;

create or replace function public.rpc_get_queued_reminder_deliveries(
  p_limit integer DEFAULT 10
) RETURNS TABLE(
  id uuid,
  channel text,
  provider text,
  destination text,
  payload jsonb,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_deliveries d
  SET delivery_status = 'sending',
      attempt_count = d.attempt_count + 1,
      last_attempt_at = now()
  WHERE d.id IN (
    SELECT nd.id
    FROM public.notification_deliveries nd
    JOIN public.matches m ON m.id::text = nd.payload->>'match_id'
    JOIN public.match_participants mp ON mp.id::text = nd.payload->>'match_participant_id'
    LEFT JOIN public.venues v ON v.id = m.venue_id
    WHERE nd.delivery_status = 'queued'
      AND nd.payload->>'template_type' = 'match_reminder'
      AND m.status = 'active'
      AND m.formed_at IS NOT NULL
      AND m.player_reminder_minutes IS NOT NULL
      AND m.match_date = ((now() at time zone coalesce(v.timezone, 'America/Toronto'))::date + 1)
      AND public.notification_is_participant_confirmed(mp)
      AND coalesce(mp.user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> m.organizer_id
    ORDER BY nd.created_at ASC
    LIMIT greatest(1, p_limit)
    FOR UPDATE OF nd SKIP LOCKED
  )
  RETURNING d.id, d.channel, d.provider, d.destination, d.payload, d.attempt_count;
END;
$$;

grant execute on function public.notification_should_send_match_reminder(uuid, uuid) to authenticated, service_role;
grant execute on function public.notification_enqueue_match_reminder_if_needed(uuid) to authenticated, service_role;
grant execute on function public.notification_enqueue_due_match_reminders(integer) to authenticated, service_role;
grant execute on function public.notification_reminder_drain_preview(integer) to anon, authenticated, service_role;
grant execute on function public.rpc_get_queued_reminder_deliveries(integer) to anon, authenticated, service_role;
