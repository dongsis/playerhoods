select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema='public'
  and table_name in ('profile_display','match_counts','match_formed','v_group_member_display')
order by table_name, grantee, privilege_type;