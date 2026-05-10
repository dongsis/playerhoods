CREATE OR REPLACE FUNCTION public.test_runner_contact_claimed_flow()
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
  v_issue_count bigint;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _contact_claim_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;

  DELETE FROM _contact_claim_results;

  BEGIN
    SELECT issue_count
    INTO v_issue_count
    FROM public.rpc_validate_contact_claimed_flow()
    WHERE check_name = 'duplicate_contact_claim_suggestions';

    INSERT INTO _contact_claim_results(test_name, ok, details)
    VALUES (
      'ContactClaim suggestions are idempotent per user/suggested player',
      COALESCE(v_issue_count, 0) = 0,
      'duplicate_contact_claim_suggestions=' || COALESCE(v_issue_count, 0)::text
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _contact_claim_results(test_name, ok, details)
    VALUES ('ContactClaim suggestions are idempotent per user/suggested player', false, 'exception: ' || SQLERRM);
  END;

  BEGIN
    SELECT issue_count
    INTO v_issue_count
    FROM public.rpc_validate_contact_claimed_flow()
    WHERE check_name = 'duplicate_claim_notifications';

    INSERT INTO _contact_claim_results(test_name, ok, details)
    VALUES (
      'ContactClaim notifications are deduped by recipient/kind/source',
      COALESCE(v_issue_count, 0) = 0,
      'duplicate_claim_notifications=' || COALESCE(v_issue_count, 0)::text
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _contact_claim_results(test_name, ok, details)
    VALUES ('ContactClaim notifications are deduped by recipient/kind/source', false, 'exception: ' || SQLERRM);
  END;

  BEGIN
    SELECT issue_count
    INTO v_issue_count
    FROM public.rpc_validate_contact_claimed_flow()
    WHERE check_name = 'claimed_active_guests';

    INSERT INTO _contact_claim_results(test_name, ok, details)
    VALUES (
      'Claimed contact guests are soft archived inactive',
      COALESCE(v_issue_count, 0) = 0,
      'claimed_active_guests=' || COALESCE(v_issue_count, 0)::text
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _contact_claim_results(test_name, ok, details)
    VALUES ('Claimed contact guests are soft archived inactive', false, 'exception: ' || SQLERRM);
  END;

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _contact_claim_results r
  ORDER BY r.test_name;
END;
$$;
