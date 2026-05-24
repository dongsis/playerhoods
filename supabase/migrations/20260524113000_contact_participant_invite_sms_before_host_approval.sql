-- Contact Player invite SMS timing correction.
--
-- Drift correction:
-- The current notification policy requires org_approved_at before sending an invite
-- notification. That is too late for Contact Player / unregistered player-card
-- invitations because the first SMS should ask whether the contact can play as
-- soon as the host adds them to the match. The final Game On / formed lineup
-- notification remains gated by formed_at.

create or replace function public.notification_should_send_invite(
  p_participant_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_mp public.match_participants%rowtype;
  v_match public.matches%rowtype;
begin
  select * into v_mp from public.match_participants where id = p_participant_id;
  if not found then return false; end if;

  select * into v_match from public.matches where id = v_mp.match_id;
  if not found then return false; end if;

  return v_mp.invite_notification_sent_at is null
    and v_mp.removed_at is null
    and v_mp.participant_accepted_at is null
    and (
      -- Registered users still require host approval / trusted invite flow.
      v_mp.org_approved_at is not null
      -- Contact Players are unregistered player cards. Their initial SMS asks
      -- whether they can play and does not mean the final lineup is formed.
      or v_mp.user_id is null
    )
    and v_match.status = 'active'
    and coalesce(v_mp.user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_match.organizer_id
    and (
      v_mp.user_id is null
      or exists (
        select 1 from public.profiles p
        where p.id = v_mp.user_id
          and p.accepting_new_invites = true
          and not public.is_blocked_either_direction(v_match.organizer_id, v_mp.user_id)
      )
    );
end;
$$;

comment on function public.notification_should_send_invite(uuid) is
  'Returns whether an initial invite / availability notification should be queued. Registered users require host approval; Contact Players can receive the availability SMS as soon as they are added to a match participant row. Final Game On remains formed_at-gated.';
