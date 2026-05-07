create or replace function public.is_caller_confirmed_in_match(p_match_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.status = 'confirmed'
      and (
        mp.user_id = auth.uid()
        or (
          mp.guest_id is not null
          and exists (
            select 1
            from public.identity_links il
            where il.user_id = auth.uid()
              and il.linked_type = 'guest_participant'
              and il.linked_id = mp.id
          )
        )
      )
  );
end;
$$;

comment on function public.is_caller_confirmed_in_match(uuid)
is 'Returns true if caller has a confirmed direct or identity-linked guest participant row in this match. Used for RLS.';

create or replace function public.is_user_match_associated(p_match_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and (
        mp.user_id = p_user_id
        or exists (
          select 1
          from public.identity_links il
          where il.user_id = p_user_id
            and il.linked_type = 'guest_participant'
            and il.linked_id = mp.id
        )
      )
      and (
        mp.removed_at is null
        or (mp.removed_at is not null and mp.removed_by = p_user_id)
      )
  );
$$;

comment on function public.is_user_match_associated(uuid, uuid)
is 'Returns true if the user has an active or self-withdrawn direct participant row, or an identity-linked guest participant row, in this match.';
