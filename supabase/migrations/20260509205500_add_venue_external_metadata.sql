alter table public.venues
  add column if not exists google_rating numeric,
  add column if not exists working_hours jsonb,
  add column if not exists google_maps_url text,
  add column if not exists google_place_id text,
  add column if not exists season text,
  add column if not exists has_lights boolean,
  add column if not exists has_washroom boolean,
  add column if not exists has_parking boolean,
  add column if not exists accessibility text;

comment on column public.venues.google_rating is
  'External Google rating for the venue when imported or known.';

comment on column public.venues.working_hours is
  'Structured venue opening hours, typically imported from external source data.';

comment on column public.venues.google_maps_url is
  'Google Maps URL for the venue.';

comment on column public.venues.google_place_id is
  'Google place identifier for deduplication and external matching.';

comment on column public.venues.season is
  'Seasonal availability classification, such as summer_only or year_round.';

comment on column public.venues.has_lights is
  'Whether the venue has lights, when known.';

comment on column public.venues.has_washroom is
  'Whether the venue has washrooms, when known.';

comment on column public.venues.has_parking is
  'Whether the venue has parking, when known.';

comment on column public.venues.accessibility is
  'Accessibility information imported or entered for the venue.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'venues_google_rating_range_check'
      and conrelid = 'public.venues'::regclass
  ) then
    alter table public.venues
      add constraint venues_google_rating_range_check
      check (google_rating is null or (google_rating >= 0 and google_rating <= 5));
  end if;
end
$$;

create unique index if not exists venues_google_place_id_unique_idx
  on public.venues (google_place_id)
  where google_place_id is not null;
