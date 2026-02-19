# `groups`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.groups (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    boundary_keeper_id uuid NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
```

## Assistant notes
- Update this file when schema changes.
