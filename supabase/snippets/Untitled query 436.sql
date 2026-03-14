select
  n.nspname as schema,
  c.relname as view_name,
  pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'v'
  and n.nspname = 'public'
  and c.relname in ('profile_display','match_formed','match_counts','v_group_member_display');