-- Vaporize Next: inspection only. Run exclusively on Supabase homologation
-- project cfpvexgkjsqpwhebsoos. No data or permission changes.
-- The Supabase Security Advisor warns about SECURITY DEFINER functions.
-- This query distinguishes PUBLIC, anon and authenticated EXECUTE privileges.
SELECT
  n.nspname AS function_schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS signature,
  p.prosecdef AS security_definer,
  has_function_privilege('PUBLIC', p.oid, 'EXECUTE') AS public_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  p.proconfig AS function_settings
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE p.prosecdef
  AND (n.nspname = 'vaporize_next'
       OR (n.nspname = 'public' AND p.proname LIKE 'vaporize_next_%'))
ORDER BY n.nspname, p.proname, signature;
-- Findings require source review: do not revoke EXECUTE from RLS helpers
-- without checking policy dependencies, or switch to SECURITY INVOKER blindly.
