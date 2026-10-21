-- I|ONE: opt in to explicit grants for future public-schema objects.
-- This changes default privileges for postgres-created objects only; it does
-- not alter existing objects, grants, RLS policies, rows, or application data.
-- Feature migrations must explicitly grant the minimum required privileges
-- to anon/authenticated/service_role for each object they create.
-- Keep this migration limited to postgres: Supabase's documented setup uses
-- the postgres creator role; do not assume permission to alter other roles.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;
-- PUBLIC's global function default must be revoked without an IN SCHEMA clause.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
