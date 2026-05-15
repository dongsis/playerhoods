drop function if exists public.rpc_contact_communication_unsubscribe(uuid, text, text, text);

create or replace function public.rpc_contact_communication_unsubscribe(
  p_invitation_id uuid,
  p_channel text default null,
  p_scope text default 'contact_invites',
  p_reason text default null
)
returns table(out_channel text, out_destination text, out_scope text, out_unsubscribed_at timestamptz)
language plpgsql
security definer
set search_path to public
as $$
declare
  v_inv public.email_invitations%rowtype;
  v_scope text := coalesce(nullif(btrim(p_scope), ''), 'contact_invites');
  v_channel text := nullif(btrim(coalesce(p_channel, '')), '');
begin
  select *
  into v_inv
  from public.email_invitations
  where id = p_invitation_id;

  if not found then
    raise exception 'invitation_not_found';
  end if;

  if v_scope not in ('all', 'playerhoods', 'contact_invites', 'match_invites') then
    v_scope := 'contact_invites';
  end if;

  if v_channel is not null and v_channel not in ('email', 'sms') then
    raise exception 'invalid_channel';
  end if;

  if (v_channel is null or v_channel = 'email') and nullif(btrim(coalesce(v_inv.target_email, '')), '') is not null then
    insert into public.contact_communication_opt_outs (
      channel,
      destination,
      destination_normalized,
      scope,
      source_invitation_id,
      reason,
      unsubscribed_at,
      created_at
    )
    values (
      'email',
      btrim(v_inv.target_email),
      public.normalize_contact_destination('email', v_inv.target_email),
      v_scope,
      v_inv.id,
      nullif(btrim(p_reason), ''),
      now(),
      now()
    )
    on conflict (channel, destination_normalized, scope)
    do update set
      source_invitation_id = coalesce(public.contact_communication_opt_outs.source_invitation_id, excluded.source_invitation_id),
      reason = coalesce(excluded.reason, public.contact_communication_opt_outs.reason),
      unsubscribed_at = coalesce(public.contact_communication_opt_outs.unsubscribed_at, excluded.unsubscribed_at);
  end if;

  if (v_channel is null or v_channel = 'sms') and nullif(btrim(coalesce(v_inv.target_phone, '')), '') is not null then
    insert into public.contact_communication_opt_outs (
      channel,
      destination,
      destination_normalized,
      scope,
      source_invitation_id,
      reason,
      unsubscribed_at,
      created_at
    )
    values (
      'sms',
      btrim(v_inv.target_phone),
      public.normalize_contact_destination('sms', v_inv.target_phone),
      v_scope,
      v_inv.id,
      nullif(btrim(p_reason), ''),
      now(),
      now()
    )
    on conflict (channel, destination_normalized, scope)
    do update set
      source_invitation_id = coalesce(public.contact_communication_opt_outs.source_invitation_id, excluded.source_invitation_id),
      reason = coalesce(excluded.reason, public.contact_communication_opt_outs.reason),
      unsubscribed_at = coalesce(public.contact_communication_opt_outs.unsubscribed_at, excluded.unsubscribed_at);
  end if;

  update public.email_invitations
  set
    email_opted_out_at = case
      when (v_channel is null or v_channel = 'email') and nullif(btrim(coalesce(v_inv.target_email, '')), '') is not null then now()
      else email_opted_out_at
    end,
    sms_opted_out_at = case
      when (v_channel is null or v_channel = 'sms') and nullif(btrim(coalesce(v_inv.target_phone, '')), '') is not null then now()
      else sms_opted_out_at
    end,
    delivery_suppressed_reason = 'recipient_unsubscribed'
  where id = v_inv.id;

  return query
  select o.channel, o.destination, o.scope, o.unsubscribed_at
  from public.contact_communication_opt_outs o
  where o.source_invitation_id = v_inv.id
     or (
       o.scope = v_scope
       and (
         (o.channel = 'email' and o.destination_normalized = public.normalize_contact_destination('email', v_inv.target_email))
         or (o.channel = 'sms' and o.destination_normalized = public.normalize_contact_destination('sms', v_inv.target_phone))
       )
     )
  order by o.channel;
end;
$$;

grant execute on function public.rpc_contact_communication_unsubscribe(uuid, text, text, text) to anon, authenticated, service_role;
