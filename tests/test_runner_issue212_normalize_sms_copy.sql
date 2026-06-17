CREATE OR REPLACE FUNCTION public.test_runner_issue212_normalize_sms_copy()
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
  v_sms_reply_def text := pg_get_functiondef('public.rpc_sms_reply_handle(text,text)'::regprocedure);
  v_public_start_def text := pg_get_functiondef('public.rpc_public_match_signup_start_sms(uuid,text,text)'::regprocedure);
  v_public_reply_def text := pg_get_functiondef('public.rpc_public_match_signup_sms_reply_handle(text,text)'::regprocedure);
  v_payload_def text := pg_get_functiondef('public.notification_match_payload(uuid,text,jsonb)'::regprocedure);
  v_host_payload_def text := pg_get_functiondef('public.notification_host_offline_confirmation_payload(uuid,uuid)'::regprocedure);
  v_not_this_time_def text := pg_get_functiondef('public.notification_enqueue_public_join_not_this_time_if_needed(uuid,uuid)'::regprocedure);
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _issue212_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;
  DELETE FROM _issue212_results;

  INSERT INTO _issue212_results VALUES (
    'private invite inbound copy uses YES/NO code and public join keeps JOIN',
    position('Private invite: reply YES code or NO code. Public join: reply JOIN or NO.' in v_sms_reply_def) > 0
      AND position('Maybe is not supported yet. Reply YES code or NO code for a private invite, JOIN for a public join text' in v_sms_reply_def) > 0,
    'rpc_sms_reply_handle copy check'
  );

  INSERT INTO _issue212_results VALUES (
    'public join request sent copy keeps request semantics',
    position('Request sent. The host can now review your request. We''''ll let you know if you''''re confirmed.' in v_public_reply_def) > 0
      AND position('JOIN' in v_public_reply_def) = 0,
    'rpc_public_match_signup_sms_reply_handle copy check'
  );

  INSERT INTO _issue212_results VALUES (
    'public join SMS start returns level and short summary fields',
    position('level_label text' in v_public_start_def) > 0
      AND position('match_summary_sms text' in v_public_start_def) > 0
      AND position('v_match_summary_sms' in v_public_start_def) > 0,
    'rpc_public_match_signup_start_sms payload check'
  );

  INSERT INTO _issue212_results VALUES (
    'match notification payload includes level and short summary fields',
    position('''level_label'', v_level_label' in v_payload_def) > 0
      AND position('''match_summary_sms'', v_match_summary_sms' in v_payload_def) > 0,
    'notification_match_payload field check'
  );

  INSERT INTO _issue212_results VALUES (
    'host-confirmed payload includes sport level and short summary fields',
    position('''sport_name'', v_sport_name' in v_host_payload_def) > 0
      AND position('''level_label'', v_level_label' in v_host_payload_def) > 0
      AND position('''match_summary_sms'', v_match_summary_sms' in v_host_payload_def) > 0,
    'notification_host_offline_confirmation_payload field check'
  );

  INSERT INTO _issue212_results VALUES (
    'public join Not This Time payload includes name link level and summary',
    position('''recipient_name'', v_intent.display_name' in v_not_this_time_def) > 0
      AND position('''level_label'', v_level_label' in v_not_this_time_def) > 0
      AND position('''match_summary_sms'', v_match_summary_sms' in v_not_this_time_def) > 0
      AND position('''magic_link_path'', public.notification_magic_link_for_participant(v_mp.id)' in v_not_this_time_def) > 0,
    'notification_enqueue_public_join_not_this_time_if_needed field check'
  );

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details
  FROM _issue212_results r
  ORDER BY r.test_name;
END;
$$;

SELECT * FROM public.test_runner_issue212_normalize_sms_copy();
