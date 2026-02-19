# `match_participants`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.match_participants (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    status public.match_participant_status DEFAULT 'pending'::public.match_participant_status NOT NULL,
    join_method public.match_join_method NOT NULL,
    user_id uuid,
    guest_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    removed_at timestamp with time zone,
    user_accepted_at timestamp with time zone,
    org_approved_at timestamp with time zone,
    org_approved_by uuid,
    nominated_by uuid,
    removed_by uuid,
    removal_note text,
    CONSTRAINT match_participants_exactly_one_identity CHECK ((((user_id IS NOT NULL) AND (guest_id IS NULL)) OR ((user_id IS NULL) AND (guest_id IS NOT NULL))))
);
```

## Assistant notes
- Update this file when schema changes.
