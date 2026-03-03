# Hard Constraints for Database Changes

## Rule: DB changes must be based on authoritative documentation.

### Before making any SQL/migration modification:
1. Always read and reference:
    - docs/specs/00_AUTHORITATIVE_INDEX.md
    - docs/specs/PlayerHoods_v1.6.3_Consolidated_Master_Spec.md

2. If schema facts (column names, function signatures, constraint names) are missing, verify them from `db_schema.sql` or the current migration files.

3. Migrations must be append-only; direct modifications to existing migrations are strictly prohibited.

### Output Requirements:
- Before executing any changes, produce the following:
  - Plan of action for intended changes
  - List of alterations in a clear, concise manner
  - Commands for validation of changes after migration is applied

This process ensures accuracy and preserves integrity in all operations involving the database.