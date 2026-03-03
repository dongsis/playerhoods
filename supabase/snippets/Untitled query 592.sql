select
  relname,
  relkind,
  relsecurity
from pg_class
where relname in (
  'profile_display',
  'match_formed',
  'match_counts',
  'v_group_member_display'
);