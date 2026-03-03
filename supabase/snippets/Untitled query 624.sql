select
  relname,
  pg_get_viewdef(c.oid)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'v'
  and n.nspname = 'public'
  and relname in (
    'profile_display',
    'match_formed',
    'match_counts',
    'v_group_member_display'
  );