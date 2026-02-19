# `match_courts`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.match_courts (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    slot_index integer NOT NULL,
    court_label text NOT NULL,
    court_location text,
    court_notes text,
    start_at timestamp with time zone,
    end_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_slot_index CHECK (((slot_index >= 1) AND (slot_index <= 12)))
);
```

## Assistant notes
- Update this file when schema changes.
