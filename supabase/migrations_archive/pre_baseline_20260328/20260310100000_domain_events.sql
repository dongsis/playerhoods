-- Invitation notification architecture: domain_events table
-- Immutable business events for event-driven processing

CREATE TABLE IF NOT EXISTS public.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate
  ON public.domain_events (aggregate_type, aggregate_id);

CREATE INDEX IF NOT EXISTS idx_domain_events_type_created
  ON public.domain_events (event_type, created_at DESC);

ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

-- Internal use only: no direct client access
CREATE POLICY domain_events_no_select ON public.domain_events
  FOR SELECT TO authenticated USING (false);

CREATE POLICY domain_events_service_insert ON public.domain_events
  FOR INSERT TO authenticated WITH CHECK (true);

COMMENT ON TABLE public.domain_events IS 'Immutable domain events for invitation/notification architecture. Processed by event processor.';
