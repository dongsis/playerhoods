# `clubs`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.clubs (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    location_text text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    timezone text DEFAULT 'America/Toronto'::text NOT NULL
);
```

## Assistant notes
- Update this file when schema changes.
