# `courts`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.courts (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    court_code text NOT NULL,
    surface text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
```

## Assistant notes
- Update this file when schema changes.
