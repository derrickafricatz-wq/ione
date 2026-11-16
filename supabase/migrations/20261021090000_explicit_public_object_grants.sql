-- I|ONE: secure defaults for future public objects created by postgres.
-- Production verification on 2026-10-21 confirmed these defaults are applied.
-- Existing objects, grants, RLS policies, rows, and application data are unchanged.
-- Keep server-side service_role access explicit for future tables, sequences,
-- and functions. Feature migrations must add only the client grants they need.
-- The current database role cannot alter supabase_admin-owned default ACLs;
-- do not claim those defaults are fixed until an authorized role applies that change.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
-- PUBLIC's default function EXECUTE is global, so this revoke must be global too.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO service_role;
