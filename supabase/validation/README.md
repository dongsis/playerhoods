# Validation SQL

These files are **not** migrations. Run them manually after applying migrations to verify schema and RPC behavior.

```bash
# Example: run validation for invite circle schema
psql $DATABASE_URL -f supabase/validation/20260312000000_play_network_core_invite_circle_schema_validation.sql
```

Or use Supabase SQL Editor / your preferred client.
