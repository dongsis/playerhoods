drop function if exists public.rpc_contact_claim_suggestions_for_user();

create or replace function public.rpc_contact_claim_suggestions_for_user()
returns table(
  suggestion_id uuid,
  suggested_user_id uuid,
  display_name text,
  avatar_url text,
  source_saved_contact boolean,
  source_shared_match boolean,
  venue_context text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    s.id as suggestion_id,
    s.suggested_user_id,
    pd.display_name,
    pd.avatar_url,
    s.source_saved_contact,
    s.source_shared_match,
    coalesce(shared_venue.name, suggested_club.name, suggested_venue.name) as venue_context
  from public.contact_claim_suggestions s
  join public.profile_display pd on pd.id = s.suggested_user_id
  left join lateral (
    select coalesce(nullif(btrim(v.abbreviation), ''), v.name) as name
    from public.venue_user_relationships mine
    join public.venue_user_relationships theirs
      on theirs.venue_id = mine.venue_id
    join public.venues v
      on v.id = mine.venue_id
    where mine.user_id = auth.uid()
      and theirs.user_id = s.suggested_user_id
      and mine.relationship_type in ('member', 'guest', 'starred')
      and theirs.relationship_type in ('member', 'guest', 'starred')
    order by
      (v.venue_kind = 'club') desc,
      (mine.relationship_type = 'member' and theirs.relationship_type = 'member') desc,
      (theirs.relationship_type = 'member') desc,
      v.name asc
    limit 1
  ) shared_venue on true
  left join lateral (
    select coalesce(nullif(btrim(v.abbreviation), ''), v.name) as name
    from public.venue_user_relationships rel
    join public.venues v
      on v.id = rel.venue_id
    where rel.user_id = s.suggested_user_id
      and rel.relationship_type in ('member', 'guest', 'starred')
      and v.venue_kind = 'club'
    order by
      (rel.relationship_type = 'member') desc,
      v.name asc
    limit 1
  ) suggested_club on true
  left join lateral (
    select coalesce(nullif(btrim(v.abbreviation), ''), v.name) as name
    from public.venue_user_relationships rel
    join public.venues v
      on v.id = rel.venue_id
    where rel.user_id = s.suggested_user_id
      and rel.relationship_type in ('member', 'guest', 'starred')
    order by
      (rel.relationship_type = 'member') desc,
      (v.venue_kind = 'club') desc,
      v.name asc
    limit 1
  ) suggested_venue on true
  where s.user_id = auth.uid()
    and s.dismissed_at is null
    and s.saved_at is null
    and not exists (
      select 1
      from public.user_invite_circle uic
      where uic.owner_user_id = auth.uid()
        and uic.target_user_id = s.suggested_user_id
    )
  order by
    (s.source_saved_contact and s.source_shared_match) desc,
    s.last_shared_match_at desc nulls last,
    s.saved_contact_at desc nulls last,
    s.created_at desc;
$$;

comment on function public.rpc_contact_claim_suggestions_for_user() is
  'Returns private People you may know cards for the current user after a contact claim. venue_context shows a shared venue first, then the suggested user''s club or other venue.';

grant all on function public.rpc_contact_claim_suggestions_for_user() to authenticated;
grant all on function public.rpc_contact_claim_suggestions_for_user() to service_role;
