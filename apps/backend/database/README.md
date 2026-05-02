Database
========

## Docker volume (Postgres 16 — compose hiện tại)

Image `postgres:16-alpine` dùng **PGDATA** mặc định `/var/lib/postgresql/data`. Compose gắn volume tại đúng path đó.

*(Nếu sau này nâng lên Postgres 18+, đọc changelog image: layout volume có thể khác; cần migrate dữ liệu, không chỉ đổi tag.)*

## Structure
- `init.sql`: bootstrap entrypoint for a brand-new PostgreSQL volume.
- `migrations/000_initial_schema.sql`: one-file DDL-only schema snapshot used for new servers.
- `legacy_sql_migrations/`: intentionally empty; historical migrations were cleared for the new project.
- `seeds/`: optional seed SQL files kept for reference only. Data should be imported from a database backup separately.
- `Dockerfile`: custom Postgres image that copies `init.sql` and `migrations/000_initial_schema.sql` into `/docker-entrypoint-initdb.d/`.

Usage
- Local psql for a fresh database: `cd database && psql "$DATABASE_URL" -f migrations/000_initial_schema.sql`.
- Import business/static data from your database backup after the schema has been created.
- Docker Compose: `postgres` service now builds from `./database`, so edits under `database/` get picked up on rebuild.
