# `match_participants`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.match_participants (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    status public.match_participant_status DEFAULT 'pending'::public.match_participant_status NOT NULL,
    join_method public.match_join_method NOT NULL,
    user_id uuid,
    guest_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    removed_at timestamp with time zone,
    user_accepted_at timestamp with time zone,   -- legacy pre-v1.5; preserved for backward compat
    org_approved_at timestamp with time zone,
    org_approved_by uuid,
    nominated_by uuid,
    removed_by uuid,
    removal_note text,
    -- v1.5 dual-confirmation fields (added by migration 20260222100000)
    participant_accepted_at timestamp with time zone,
    participant_accepted_via text,               -- 'in_app' | 'manual'
    manual_confirmed_by uuid,                    -- nullable; references auth.users ON DELETE SET NULL
    CONSTRAINT match_participants_exactly_one_identity CHECK ((((user_id IS NOT NULL) AND (guest_id IS NULL)) OR ((user_id IS NULL) AND (guest_id IS NOT NULL))))
);
```

## Confirmation logic (v1.5)
- `confirmed_at` is derived by reconcile only (never written directly by RPCs)
- A participant is confirmed when: `removed_at IS NULL AND participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL`
- `participant_accepted_via = 'in_app'`: user accepted via `rpc_match_accept_invite`
- `participant_accepted_via = 'manual'`: organizer manually confirmed via `rpc_match_manual_confirm`
- Reconfirm trigger: when `match_date`, `start_time`, or `duration_minutes` change → clears `participant_accepted_at`, `participant_accepted_via`, `manual_confirmed_by`, `confirmed_at`; preserves `org_approved_at`

## Assistant notes
- Update this file when schema changes.
