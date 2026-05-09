drop function if exists public.rpc_profile_update(text, text, text, text, text, boolean, boolean);

comment on function public.rpc_profile_update(
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  text,
  text[],
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean
) is 'Canonical profile update RPC. Legacy shorter overloads are removed to avoid PostgREST function overload ambiguity.';