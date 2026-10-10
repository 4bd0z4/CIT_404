-- DCR data database: read-only role + safe views for participants.
-- Run ONCE in the DCR DATA database, as its owner role.
-- Do NOT run this in the game database (teams / ledger / dcr_* tables).
--
-- Replace CHANGE_ME with a strong password before running. Do not commit
-- the real password; store it only in the DCR_DATABASE_URL secret.

BEGIN;

-- 1. Safe schema: participants only ever read from views in dcr_view.
CREATE SCHEMA IF NOT EXISTS dcr_view;

-- Columns hidden from participants. Inspect the real columns with:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
-- and add any personal column (real student id, phone, ...) to this list.
DO $$
DECLARE
  hidden_users text[] := ARRAY['email', 'cit_balance', 'ce_total'];
  t    text;
  cols text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'nodes', 'connections', 'events', 'fragments'] LOOP
    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
      INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t
       AND NOT (t = 'users' AND column_name = ANY (hidden_users));
    EXECUTE format('CREATE OR REPLACE VIEW dcr_view.%I AS SELECT %s FROM public.%I', t, cols, t);
  END LOOP;
END $$;

-- 2. Read-only login role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dcr_reader') THEN
    CREATE ROLE dcr_reader LOGIN PASSWORD 'CHANGE_ME';
  END IF;
END $$;

REVOKE ALL ON SCHEMA public FROM dcr_reader;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dcr_reader;
GRANT USAGE ON SCHEMA dcr_view TO dcr_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA dcr_view TO dcr_reader;

-- A participant writing "FROM users" resolves to dcr_view.users.
ALTER ROLE dcr_reader SET search_path = dcr_view;
ALTER ROLE dcr_reader SET statement_timeout = '5s';
ALTER ROLE dcr_reader SET default_transaction_read_only = on;
ALTER ROLE dcr_reader CONNECTION LIMIT 20;

COMMIT;

-- Verify (connect AS dcr_reader):
--   SELECT * FROM users LIMIT 1;    -- must NOT expose email / cit_balance / ce_total
--   SELECT * FROM public.users;     -- must FAIL: permission denied
