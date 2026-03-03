SELECT
  u.id,
  u.email,
  p.display_name
FROM public.profiles p
LEFT JOIN auth.users u
  ON u.id = p.id;