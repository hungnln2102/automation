## Backend refactor snapshot

What changed:
- Added a proper Knex client (`src/db/knexClient.js`) with a small helper layer (`withTransaction`) and shared normalizers/SQL utilities in `src/utils`.
- Split routes/controllers for: auth, dashboard, banks, package products, warehouse, scheduler, and payment receipts/payment supply confirmation.
- Introduced a Postgres migration to convert text columns to typed data: `migrations/001_normalize_types.sql` (see `docs/db-type-refactor.md` for usage).
- **Default API process** boots `src/server.js` via `npm start` / `npm run dev`. Root `index.js` is an optional one-line shim (`require("./src/server")`) for deploy scripts that still invoke `node index.js`.

Pending to finish the refactor:
- Migrate the remaining endpoints (orders, supplies, product pricing/descriptions, supply payments listing/creation, delete flows) into `src/controllers` + `src/routes`.

Notes:
- Allowlist/front-end origins, session, and webhook configs are centralized in `src/config/appConfig.js`.
- Knex uses the `SCHEMA_*` values to set the search path; ensure `DATABASE_URL` is set when running the API.
