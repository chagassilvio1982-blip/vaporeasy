-- Vaporize Next: real INSERT denial under authenticated PostgreSQL role.
-- Project: cfpvexgkjsqpwhebsoos ONLY. Never run in V2 or production.
-- Does not create auth users. Rolls back all changes.
BEGIN;
CREATE TEMPORARY TABLE pg_temp.next_probe_result (
  sqlstate text, message text
) ON COMMIT DROP;
GRANT INSERT, SELECT ON pg_temp.next_probe_result TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO vaporize_next.clients (organization_id, name, phone)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Synthetic blocked probe', NULL);
  INSERT INTO pg_temp.next_probe_result VALUES ('00000', 'UNEXPECTED: insert allowed');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO pg_temp.next_probe_result VALUES (SQLSTATE, SQLERRM);
END $$;
SELECT sqlstate, message FROM pg_temp.next_probe_result;
ROLLBACK;
-- Observed 2026-10-29: SQLSTATE 42501,
-- "new row violates row-level security policy for table \"clients\"".
-- This proves denial without membership, NOT full cross-tenant A/B isolation.
