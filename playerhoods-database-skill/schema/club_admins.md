# `club_admins`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.club_admins (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    club_id uuid NOT NULL,
    granted_by uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);
```

## Assistant notes
- Update this file when schema changes.
