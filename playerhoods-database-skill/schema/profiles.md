# `profiles`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.profiles (
id uuid NOT NULL,
    first_name text DEFAULT ''::text NOT NULL,
    middle_name text,
    last_name text DEFAULT ''::text NOT NULL,
    display_name text,
    avatar_url text,
    gender text DEFAULT 'unspecified'::text,
    level text,
    availability_note text,
    plays_singles boolean DEFAULT true NOT NULL,
    plays_doubles boolean DEFAULT true NOT NULL,
    primary_club_id uuid,
    secondary_club_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_super_admin boolean DEFAULT false NOT NULL
);
```

## Assistant notes
- Update this file when schema changes.
