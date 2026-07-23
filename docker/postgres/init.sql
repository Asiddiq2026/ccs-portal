-- Bootstrap for local dev. Runs once, as the postgres superuser, on first
-- cluster initialisation (docker-entrypoint-initdb.d).
--
-- Why a dedicated role: the app connects as `ccs_app`, which is a plain,
-- non-superuser role WITHOUT the BYPASSRLS attribute. Combined with
-- FORCE ROW LEVEL SECURITY in prisma/rls.sql, this guarantees the row-level
-- security policies actually apply to the application — a superuser (or any
-- BYPASSRLS role) would silently ignore every policy, so we must never run the
-- app as one. Prisma migrations also connect as ccs_app, so it owns the tables;
-- FORCE RLS is what makes policies bind even to the owning role.

CREATE ROLE ccs_app WITH LOGIN PASSWORD 'ccs_app' NOSUPERUSER NOCREATEROLE NOBYPASSRLS;
ALTER ROLE ccs_app CREATEDB; -- needed for Prisma's shadow database in `migrate dev`

CREATE DATABASE ccs OWNER ccs_app;
