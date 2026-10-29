-- Vaporize Next: deny anonymous client insert and disallowed notes column.
-- Only execute in Supabase isolated homologation cfpvexgkjsqpwhebsoos.
-- All changes are rolled back; no auth users created.

-- Probe A: anonymous role cannot access the isolated schema.
BEGIN;
CREATE TEMPORARY TABLE pg_temp.next_anon_probe(sqlstate text, message text) ON COMMIT DROP;
GRANT INSERT, SELECT ON pg_temp.next_anon_probe TO anon;
SET LOCAL ROLE anon;
DO $$
BEGIN
  INSERT INTO vaporize_next.clients(organization_id,name,phone)
  VALUES ('00000000-0000-0000-0000-000000000001','Synthetic anonymous probe',NULL);
  INSERT INTO pg_temp.next_anon_probe VALUES ('00000','UNEXPECTED: allowed');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO pg_temp.next_anon_probe VALUES (SQLSTATE,SQLERRM);
END $$;
SELECT * FROM pg_temp.next_anon_probe;
ROLLBACK;
-- Observed: 42501 permission denied for schema vaporize_next.

-- Probe B: authenticated role cannot insert the notes column.
BEGIN;
CREATE TEMPORARY TABLE pg_temp.next_column_probe(sqlstate text, message text) ON COMMIT DROP;
GRANT INSERT, SELECT ON pg_temp.next_column_probe TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO vaporize_next.clients(organization_id,name,phone,notes)
  VALUES ('00000000-0000-0000-0000-000000000001','Synthetic column probe',NULL,'disallowed');
  INSERT INTO pg_temp.next_column_probe VALUES ('00000','UNEXPECTED: allowed');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO pg_temp.next_column_probe VALUES (SQLSTATE,SQLERRM);
END $$;
SELECT * FROM pg_temp.next_column_probe;
ROLLBACK;
-- Observed: 42501 permission denied for table clients.
-- Neither test proves owner/manager A/B isolation; real synthetic JWT tests pending.
