# `match_participant_actions`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.match_participant_actions (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    match_participant_id uuid NOT NULL,
    action_type text NOT NULL,
    note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_action_type CHECK ((action_type = ANY (ARRAY['request_join'::text, 'invite'::text, 'nominate'::text, 'accept'::text, 'decline'::text, 'approve'::text, 'withdraw'::text, 'remove'::text, 'add_guest_org'::text, 'add_guest_participant'::text])))
);
```

## Assistant notes
- Update this file when schema changes.
