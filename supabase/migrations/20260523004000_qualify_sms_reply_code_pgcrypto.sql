create or replace function public.notification_create_or_get_sms_reply_code(
  p_participant_id uuid,
  p_purpose text default 'invite'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mp public.match_participants%rowtype;
  v_rec record;
  v_existing text;
  v_code text;
  v_attempt int := 0;
begin
  select * into v_mp
  from public.match_participants
  where id = p_participant_id;

  if not found then
    raise exception 'participant_not_found';
  end if;

  select * into v_rec
  from public.notification_recipient_for_participant(p_participant_id, 'sms')
  limit 1;

  if v_rec.phone_e164 is null then
    return null;
  end if;

  select code into v_existing
  from public.match_participant_sms_reply_codes
  where participant_id = p_participant_id
    and purpose = coalesce(nullif(p_purpose, ''), 'invite')
    and consumed_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := upper(substr(translate(encode(extensions.gen_random_bytes(5), 'base64'), '+/=', '234'), 1, 5));

    begin
      insert into public.match_participant_sms_reply_codes (
        match_id,
        participant_id,
        phone_e164,
        code,
        purpose,
        expires_at
      ) values (
        v_mp.match_id,
        p_participant_id,
        v_rec.phone_e164,
        v_code,
        coalesce(nullif(p_purpose, ''), 'invite'),
        now() + interval '30 days'
      );
      return v_code;
    exception when unique_violation then
      if v_attempt >= 8 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

comment on function public.notification_create_or_get_sms_reply_code(uuid, text)
is 'Creates or reuses SMS reply codes. Qualifies pgcrypto through extensions schema because the SECURITY DEFINER function uses search_path=public.';
