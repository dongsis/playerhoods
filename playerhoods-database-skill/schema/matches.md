# `matches`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.matches (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    status public.match_status DEFAULT 'active'::public.match_status NOT NULL,
    admission_mode public.match_admission_mode DEFAULT 'invite'::public.match_admission_mode NOT NULL,
    club_id uuid,
    court_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    match_date date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date NOT NULL,
    start_time time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    duration_minutes integer DEFAULT 90 NOT NULL,
    game_type text DEFAULT 'doubles'::text NOT NULL,
    required_count integer DEFAULT 4 NOT NULL,
    invitation_scope_group_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    can_participants_invite_users boolean DEFAULT false NOT NULL,
    can_participants_add_guests boolean DEFAULT false NOT NULL,
    can_participants_manage_participants boolean DEFAULT false NOT NULL,
    formed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    start_at_utc timestamp with time zone
);
```

## Assistant notes
- Update this file when schema changes.
