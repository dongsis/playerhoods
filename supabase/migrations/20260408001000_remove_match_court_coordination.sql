BEGIN;

DROP FUNCTION IF EXISTS public.rpc_match_court_submit_offer(uuid, text, text);
DROP FUNCTION IF EXISTS public.rpc_match_court_select_offer(uuid, uuid);

DROP TABLE IF EXISTS public.match_court_offers;
DROP TABLE IF EXISTS public.match_court_volunteers;

DELETE FROM public.notifications
WHERE kind IN (
  'court_help_volunteered',
  'court_help_withdrawn',
  'court_offer_submitted',
  'court_offer_released',
  'court_selected',
  'court_release_reminder'
);

COMMIT;
