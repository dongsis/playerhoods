CREATE OR REPLACE FUNCTION public.test_runner_issue84_venue_cleanup()
RETURNS TABLE (
  test_name text,
  ok boolean,
  details text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue84_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;

  DELETE FROM _issue84_results;

  WITH approved_club_fixes (google_place_id, expected_name) AS (
    VALUES
      ('0x882b61b74195d303:0xb424dc62389eb74b', 'Burlington Hall Sporting Club'),
      ('0x882b41569772e547:0x6cdd0f48617f999c', 'Deer Wood Tennis Courts (Deer Run Tennis Club)'),
      ('0x882b47ddfeafa115:0xf6ae35b14b9d1f72', 'The Westacres Tennis Club'),
      ('0x882b464e60bb8675:0xc15efc59871b4df5', 'One Health Clubs'),
      ('0x882b5d97519304cb:0xa994ef0d8549c7ac', 'Oakville club tennis court'),
      ('0x882b5c8b891c95eb:0x42f6c82d6414defd', 'The Oakville Club'),
      ('0x882b3d89fc72d3e3:0xd93b771974942fc1', 'TJ’s Sports Club - Badminton and Volleyball'),
      ('0x882b44607d5f4763:0xedb00fc61dfa595', 'The Walden Club'),
      ('0x882b12c84df59ceb:0xb1ae937f1459b3eb', 'Georgetown Racquet Club'),
      ('0x882b5c939cd78bc1:0x4f09dec620624cf0', 'Wallace Park Tennis Club')
  )
  SELECT count(*)::integer INTO v_count
  FROM public.venues v
  JOIN approved_club_fixes f
    ON f.google_place_id = v.google_place_id
   AND f.expected_name = v.name;

  INSERT INTO _issue84_results VALUES (
    'approved club source ids exist with expected names',
    v_count = 10,
    'matched=' || v_count || ', expected=10'
  );

  WITH approved_club_fixes (google_place_id, expected_name) AS (
    VALUES
      ('0x882b61b74195d303:0xb424dc62389eb74b', 'Burlington Hall Sporting Club'),
      ('0x882b41569772e547:0x6cdd0f48617f999c', 'Deer Wood Tennis Courts (Deer Run Tennis Club)'),
      ('0x882b47ddfeafa115:0xf6ae35b14b9d1f72', 'The Westacres Tennis Club'),
      ('0x882b464e60bb8675:0xc15efc59871b4df5', 'One Health Clubs'),
      ('0x882b5d97519304cb:0xa994ef0d8549c7ac', 'Oakville club tennis court'),
      ('0x882b5c8b891c95eb:0x42f6c82d6414defd', 'The Oakville Club'),
      ('0x882b3d89fc72d3e3:0xd93b771974942fc1', 'TJ’s Sports Club - Badminton and Volleyball'),
      ('0x882b44607d5f4763:0xedb00fc61dfa595', 'The Walden Club'),
      ('0x882b12c84df59ceb:0xb1ae937f1459b3eb', 'Georgetown Racquet Club'),
      ('0x882b5c939cd78bc1:0x4f09dec620624cf0', 'Wallace Park Tennis Club')
  )
  SELECT count(*)::integer INTO v_count
  FROM public.venues v
  JOIN approved_club_fixes f
    ON f.google_place_id = v.google_place_id
   AND f.expected_name = v.name
  WHERE v.venue_kind = 'club';

  INSERT INTO _issue84_results VALUES (
    'approved club rows have venue_kind club',
    v_count = 10,
    'club_rows=' || v_count || ', expected=10'
  );

  WITH approved_renames (google_place_id, expected_name) AS (
    VALUES
      ('0x882b411da0cae48b:0x9575b42f6a729932', 'Century City Park Tennis Court'),
      ('0x882b470019175c95:0xe5670d2cef867f39', 'Stonebrook Park Tennis Courts')
  )
  SELECT count(*)::integer INTO v_count
  FROM public.venues v
  JOIN approved_renames r
    ON r.google_place_id = v.google_place_id
   AND r.expected_name = v.name;

  INSERT INTO _issue84_results VALUES (
    'approved rename source ids have expected names',
    v_count = 2,
    'renamed_rows=' || v_count || ', expected=2'
  );

  WITH approved_renames (google_place_id, old_name) AS (
    VALUES
      ('0x882b411da0cae48b:0x9575b42f6a729932', 'Tennis Court'),
      ('0x882b470019175c95:0xe5670d2cef867f39', 'Tennis courts')
  )
  SELECT count(*)::integer INTO v_count
  FROM public.venues v
  JOIN approved_renames r
    ON r.google_place_id = v.google_place_id
   AND r.old_name = v.name;

  INSERT INTO _issue84_results VALUES (
    'approved rename rows no longer have generic names',
    v_count = 0,
    'remaining_generic_names=' || v_count || ', expected=0'
  );

  WITH approved_source_ids (google_place_id) AS (
    VALUES
      ('0x882b61b74195d303:0xb424dc62389eb74b'),
      ('0x882b41569772e547:0x6cdd0f48617f999c'),
      ('0x882b47ddfeafa115:0xf6ae35b14b9d1f72'),
      ('0x882b464e60bb8675:0xc15efc59871b4df5'),
      ('0x882b5d97519304cb:0xa994ef0d8549c7ac'),
      ('0x882b5c8b891c95eb:0x42f6c82d6414defd'),
      ('0x882b3d89fc72d3e3:0xd93b771974942fc1'),
      ('0x882b44607d5f4763:0xedb00fc61dfa595'),
      ('0x882b12c84df59ceb:0xb1ae937f1459b3eb'),
      ('0x882b5c939cd78bc1:0x4f09dec620624cf0'),
      ('0x882b411da0cae48b:0x9575b42f6a729932'),
      ('0x882b470019175c95:0xe5670d2cef867f39')
  )
  SELECT count(*)::integer INTO v_count
  FROM public.venues v
  JOIN approved_source_ids a ON a.google_place_id = v.google_place_id;

  INSERT INTO _issue84_results VALUES (
    'approved source id whitelist resolves exactly 12 rows',
    v_count = 12,
    'matched_whitelist_rows=' || v_count || ', expected=12'
  );

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _issue84_results r
  ORDER BY r.test_name;
END;
$$;
