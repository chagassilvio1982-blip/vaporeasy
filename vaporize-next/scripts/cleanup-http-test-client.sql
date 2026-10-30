-- Vaporize Next isolated homologation ONLY: cfpvexgkjsqpwhebsoos
-- Administrative cleanup template. Not executable until the operator replaces
-- every placeholder with verified IDs from the HTTP test manifest.
-- Run in isolated Supabase SQL Editor only. Never expose privileged credentials.
BEGIN;
DO $$
DECLARE
  v_org uuid := '00000000-0000-0000-0000-000000000000';
  v_client uuid := '00000000-0000-0000-0000-000000000000';
  v_name text := 'REPLACE_WITH_EXACT_vnext-http-rls-CLIENT_NAME';
  v_expected integer := 1;
  v_count integer;
BEGIN
  IF v_org = '00000000-0000-0000-0000-000000000000'::uuid
    OR v_client = '00000000-0000-0000-0000-000000000000'::uuid
    OR v_name NOT LIKE 'vnext-http-rls-%'
    OR v_name LIKE '%REPLACE%'
    OR v_expected <> 1
  THEN RAISE EXCEPTION 'STOP: verified test manifest is required'; END IF;

  SELECT count(*) INTO v_count FROM vaporize_next.clients
   WHERE id=v_client AND organization_id=v_org AND name=v_name;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION 'STOP: target mismatch: expected %, found %', v_expected,v_count;
  END IF;

  DELETE FROM vaporize_next.clients
   WHERE id=v_client AND organization_id=v_org AND name=v_name;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION 'STOP: delete count mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM vaporize_next.clients WHERE id=v_client) THEN
    RAISE EXCEPTION 'STOP: client remains';
  END IF;
END $$;
-- SAFETY DEFAULT: inspect and verify before explicitly changing to COMMIT.
ROLLBACK;
