create or replace function public.venue_slugify_segment(p_value text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(p_value, '')), '&', ' and ', 'g'),
            '[''’]',
            '',
            'g'
          ),
          '[^a-z0-9]+',
          '-',
          'g'
        ),
        '(^-+|-+$)',
        '',
        'g'
      ),
      ''
    ),
    'venue'
  );
$$;

create or replace function public.venue_slug_name(p_name text)
returns text
language sql
immutable
as $$
  select public.venue_slugify_segment(
    coalesce(
      nullif(
        btrim(
          regexp_replace(
            coalesce(p_name, ''),
            '\m(?:tennis|pickleball|racquet|sports?)\s+(?:club|court|courts|centre|center|facility|facilities)\M$',
            '',
            'i'
          )
        ),
        ''
      ),
      coalesce(p_name, '')
    )
  );
$$;

create or replace function public.venue_country_slug(p_country text)
returns text
language sql
immutable
as $$
  select public.venue_slugify_segment(
    case when p_country = 'Canada' then 'ca' else p_country end
  );
$$;

create or replace function public.venue_province_slug(p_province text)
returns text
language sql
immutable
as $$
  select public.venue_slugify_segment(
    case when p_province = 'Ontario' then 'on' else p_province end
  );
$$;

create or replace function public.venue_canonical_path(
  p_name text,
  p_city text,
  p_province text,
  p_country text
)
returns text
language sql
immutable
as $$
  select '/venue/'
    || public.venue_country_slug(p_country)
    || '/'
    || public.venue_province_slug(p_province)
    || '/'
    || public.venue_slugify_segment(p_city)
    || '/'
    || public.venue_slug_name(p_name);
$$;

create or replace function public.rpc_public_venue_by_canonical_path(
  p_country text,
  p_province text,
  p_city text,
  p_slug text
)
returns setof public.venues
language sql
stable
security definer
set search_path to public
as $$
  select v.*
  from public.venues v
  where public.venue_country_slug(v.country) = lower(coalesce(p_country, ''))
    and public.venue_province_slug(v.province) = lower(coalesce(p_province, ''))
    and public.venue_slugify_segment(v.city) = lower(coalesce(p_city, ''))
    and public.venue_slug_name(v.name) = lower(coalesce(p_slug, ''))
  order by v.name asc, v.created_at asc
  limit 1;
$$;

create or replace function public.rpc_public_venue_sitemap()
returns table(
  venue_id uuid,
  canonical_path text,
  name text,
  city text,
  province text,
  country text,
  supports_tennis boolean,
  supports_pickleball boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to public
as $$
  select
    v.id as venue_id,
    public.venue_canonical_path(v.name, v.city, v.province, v.country) as canonical_path,
    v.name,
    v.city,
    v.province,
    v.country,
    v.supports_tennis,
    v.supports_pickleball,
    v.created_at
  from public.venues v
  where coalesce(v.supports_tennis, false) = true
     or coalesce(v.supports_pickleball, false) = true
  order by v.country nulls last, v.province nulls last, v.city nulls last, v.name asc;
$$;

grant execute on function public.venue_slugify_segment(text) to anon, authenticated, service_role;
grant execute on function public.venue_slug_name(text) to anon, authenticated, service_role;
grant execute on function public.venue_country_slug(text) to anon, authenticated, service_role;
grant execute on function public.venue_province_slug(text) to anon, authenticated, service_role;
grant execute on function public.venue_canonical_path(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_public_venue_by_canonical_path(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_public_venue_sitemap() to anon, authenticated, service_role;
