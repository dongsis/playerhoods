# `guests`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.guests (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    display_name text NOT NULL,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
```

## Assistant notes
- Update this file when schema changes.
