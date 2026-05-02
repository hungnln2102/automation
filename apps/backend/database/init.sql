-- init.sql - Bootstrap schema for a brand-new Docker PostgreSQL volume.
-- PostgreSQL runs this file only when postgres_data is empty.
-- Current bootstrap uses the clean initial schema for this new project.

\i /docker-entrypoint-initdb.d/migrations/000_initial_schema.sql
