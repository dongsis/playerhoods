CREATE OR REPLACE FUNCTION public.rpc_my_match_list_v2()
RETURNS SETOF public.matches
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH relevant_match_ids AS (
    SELECT m.id
    FROM public.matches m
    WHERE m.organizer_id = auth.uid()

    UNION

    SELECT mp.match_id
    FROM public.match_participants mp
    WHERE mp.user_id = auth.uid()

    UNION

    SELECT mp.match_id
    FROM public.match_participants mp
    JOIN public.identity_links il
      ON il.linked_type = 'guest_participant'
     AND il.linked_id = mp.id
     AND il.user_id = auth.uid()

    UNION

    SELECT n.match_id
    FROM public.notifications n
    WHERE n.recipient_user_id = auth.uid()
      AND n.match_id IS NOT NULL
  )
  SELECT m.*
  FROM public.matches m
  JOIN relevant_match_ids ids ON ids.id = m.id
  ORDER BY
    m.start_at_utc ASC NULLS LAST,
    m.match_date ASC NULLS LAST,
    m.start_time ASC NULLS LAST,
    m.created_at DESC;
$$;

ALTER FUNCTION public.rpc_my_match_list_v2() OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_my_match_list_v2()
IS 'Returns all matches relevant to auth.uid() for dashboard/main list use: organizer matches, participant matches, identity-linked guest participant matches, and any match referenced by the user''s notifications. SECURITY DEFINER so dashboard list stays stable even when RLS visibility is narrower than inbox notification visibility.';

GRANT ALL ON FUNCTION public.rpc_my_match_list_v2() TO authenticated;
GRANT ALL ON FUNCTION public.rpc_my_match_list_v2() TO service_role;
