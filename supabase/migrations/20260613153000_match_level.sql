alter table public.matches
  add column if not exists level text;

comment on column public.matches.level is
  'Optional host-set match game level selected during match creation or editing.';
