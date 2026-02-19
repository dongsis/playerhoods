# `club_identities`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.club_identities (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    user_id uuid NOT NULL,
    club_handle text NOT NULL,
    club_handle_norm text GENERATED ALWAYS AS (lower(TRIM(BOTH FROM club_handle))) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_club_handle_length CHECK (((length(club_handle) >= 2) AND (length(club_handle) <= 30))),
    CONSTRAINT chk_club_handle_no_at CHECK ((club_handle !~~ '%@%'::text)),
    CONSTRAINT chk_club_handle_trimmed CHECK ((club_handle = TRIM(BOTH FROM club_handle)))
);
```

## Assistant notes
- Update this file when schema changes.
