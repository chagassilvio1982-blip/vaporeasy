/**
 * Read-only SQL fixture inspection helper for isolated Vaporize Next.
 * Prints a SQL SELECT for use in the Supabase SQL Editor. Never logs credentials,
 * creates Auth users, writes clients, or attempts cleanup.
 * Run: node vaporize-next/scripts/check-insert-fixtures-readonly.mjs
 */
const projectId = 'cfpvexgkjsqpwhebsoos';
if (process.env.SUPABASE_PROJECT_ID && process.env.SUPABASE_PROJECT_ID !== projectId) {
  console.error('Refusing a different Supabase project');
  process.exit(2);
}
const sql = `
SELECT
  (SELECT count(*) FROM vaporize_next.organizations) AS organizations,
  (SELECT count(*) FROM vaporize_next.memberships) AS memberships,
  (SELECT count(*) FROM vaporize_next.clients) AS clients,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='vaporize_next' AND tablename='clients'
       AND cmd='DELETE') AS delete_policies,
  (SELECT count(*) FROM vaporize_next.memberships m
     WHERE m.status='active' AND m.role='owner') AS active_owners,
  (SELECT count(*) FROM vaporize_next.memberships m
     WHERE m.status='active' AND m.role='manager') AS active_managers,
  (SELECT count(*) FROM vaporize_next.memberships m
     WHERE m.status='active' AND m.role='collaborator') AS active_collaborators;
`.trim();
console.log('Read-only fixture inspection for project:', projectId);
console.log(sql);
console.log('HTTP INSERT remains blocked until real Auth fixtures and verified admin cleanup exist.');
