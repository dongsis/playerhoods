# `group_members`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.group_members (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status public.group_member_status DEFAULT 'pending'::public.group_member_status NOT NULL,
    join_method text DEFAULT 'invited'::text NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    removed_at timestamp with time zone,
    removed_by uuid
);
```

## Assistant notes
- Update this file when schema changes.
