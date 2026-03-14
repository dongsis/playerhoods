-- 1) 列出所有 public schema 的函数（含签名）
select
  n.nspname as schema,
  p.proname as name,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid) as returns,
  p.prosecdef as security_definer,
  l.lanname as lang
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
order by p.proname, args;