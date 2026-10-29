-- Vaporize Next: read-only / rollback-only authorization checks.
-- Execute ONLY in Supabase project cfpvexgkjsqpwhebsoos.
-- Never use existing auth.users identities for synthetic tests.
-- This script intentionally does NOT create auth.users, organizations, or clients.
-- Requires separate synthetic Auth users before full A/B matrix can run.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT vaporize_next.can_manage_clients('00000000-0000-0000-0000-000000000001'::uuid)
  AS nonexistent_organization_allowed;
ROLLBACK;

-- Expected: false. This is a negative smoke test, NOT A/B certification.
-- Full matrix: owner A->A allow, manager A->A allow, collaborator A->A deny,
-- owner A->B deny, manager B->A deny, disabled membership deny,
-- suspended organization deny, anonymous insert deny.
-- Perform these only with isolated synthetic users and rollback all test rows.
