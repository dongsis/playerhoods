\echo '== v1.6.1 smoke: connectivity + auth.uid() simulation =='

-- Print who we are at DB-role level
select current_user as db_role;

\echo '-- switch to ORG (OldChai)'
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'ORG_UID', 'role', 'authenticated')::text,
  true
);
select auth.uid() as auth_uid_should_be_org;

\echo '-- switch to P (U3)'
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'P_UID', 'role', 'authenticated')::text,
  true
);
select auth.uid() as auth_uid_should_be_p;

\echo '== smoke done =='