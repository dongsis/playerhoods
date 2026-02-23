# `match_participant_actions`

## Raw table definition (excerpt)

```sql
CREATE TABLE public.match_participant_actions (
id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    match_participant_id uuid NOT NULL,
    action_type text NOT NULL,
    note text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT match_participant_actions_action_type_chk CHECK (action_type IN (
      -- v1.3 verb-form values (written by RPCs)
      'invite', 'nominate', 'request_join', 'accept', 'approve',
      'withdraw', 'decline', 'remove', 'add_guest_org', 'add_guest_participant',
      -- v1.3 past-tense aliases (legacy rows)
      'invited', 'nominated', 'requested', 'accepted', 'approved',
      'withdrawn', 'removed', 'guest_added', 'declined',
      -- v1.5 new values
      'reenter', 'manual_confirm'
    ))
);
```

## Permissions (v1.5 hardened)
- `REVOKE ALL` from `anon` and `authenticated`
- `GRANT SELECT` to `authenticated` (organizer reads via policy `match_participant_actions_select_organizer`)
- All writes are via SECURITY DEFINER RPCs only — no direct DML by clients

## Indexes
- `mpa_match_id_created_at_idx` ON `(match_id, created_at DESC)`
- `mpa_mp_id_created_at_idx` ON `(match_participant_id, created_at DESC)`

## Assistant notes
- `created_by` is nullable (actor may have been deleted from auth.users)
- `action_type` constraint expanded by migration `20260222100010_v1.5_3b`
- Update this file when schema changes.
