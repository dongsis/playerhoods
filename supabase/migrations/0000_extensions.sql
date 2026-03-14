-- =============================================================================
-- Migration: 0002_extensions
-- Purpose: Ensure required extensions exist for schema/function/defaults parity.
-- Notes:
--   - Some extensions may require elevated privileges on vanilla Postgres.
--   - On Supabase, migrations typically run with sufficient privileges.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";

-- Some environments list plpgsql in pg_extension. Usually it's present by default.
-- Keep it guarded to avoid errors.
CREATE EXTENSION IF NOT EXISTS "plpgsql";

COMMIT;