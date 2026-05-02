# Schema `system_automation` (Automation workspace)

This folder is a local reference copy for the Automation schema. Runtime code should use the files inside this workspace:

- `apps/backend/src/config/dbSchema/schemas/automation.js`
- `apps/backend/src/config/dbSchema/env.js`
- `apps/backend/migrations/*.js` and `apps/backend/seeds/*.js` where applicable

## Structure

| Path | Content |
| --- | --- |
| `js/schemas/automation.js` | Reference table/column definitions for `accounts_admin` and `list_user` |
| `js/helpers.js` | `tableName`, `getDefinition`, and schema helpers |
| `js/env.defaults.js` | Default PostgreSQL schema name |
| `js/index.js` | Reference exports only |
| `sql/fragment_000_full_schema_system_automation.sql` | Core Renew DDL fragment with only `accounts_admin` and `list_user` |
