/**
 * Isolated HTTP INSERT/RLS probe for Vaporize Next.
 * Only synthetic identities and disposable organizations. No privileged cleanup key.
 * Required: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
 * TEST_OWNER_JWT, TEST_MANAGER_JWT, TEST_COLLABORATOR_JWT,
 * TEST_ORG_A_ID, TEST_ORG_B_ID.
 *
 * Precondition: fixtures already provisioned in isolated homologation.
 * Owner/manager/collaborator belong to A; none belongs to B.
 * Cleanup requires DELETE RLS permission for owner on clients and is verified.
 */
import { randomUUID } from 'node:crypto';

// Fail closed: this project currently has no DELETE RLS policy on clients.
// HTTP test writes must not run until a separately approved, verified cleanup
// mechanism is available. Never enable by granting broad DELETE access.
if (process.env.VAPORIZE_NEXT_APPROVED_CLEANUP !== 'verified') {
  console.error('HTTP INSERT test blocked: verified isolated cleanup required (no clients DELETE RLS policy)');
  process.exit(2);
}
const expectedHost = 'cfpvexgkjsqpwhebsoos.supabase.co';
const vars = ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','TEST_OWNER_JWT','TEST_MANAGER_JWT','TEST_COLLABORATOR_JWT','TEST_ORG_A_ID','TEST_ORG_B_ID'];
const missing = vars.filter(k => !process.env[k]);
if (missing.length) {
  console.error('Missing isolated fixture configuration:', missing.join(', '));
  process.exit(2);
}
const url = new URL(process.env.SUPABASE_URL);
if (url.protocol !== 'https:' || url.hostname !== expectedHost || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
  console.error('Refusing non-isolated project URL');
  process.exit(2);
}
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const orgA = process.env.TEST_ORG_A_ID, orgB = process.env.TEST_ORG_B_ID;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!key.startsWith('sb_publishable_') || !uuid.test(orgA) || !uuid.test(orgB) || orgA === orgB) {
  console.error('Invalid isolated fixture configuration');
  process.exit(2);
}
const token = {
  owner: process.env.TEST_OWNER_JWT,
  manager: process.env.TEST_MANAGER_JWT,
  collaborator: process.env.TEST_COLLABORATOR_JWT
};
const testPrefix = 'vnext-http-rls-' + randomUUID();
const created = [];
const headers = (jwt, extra={}) => ({
  apikey: key, Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json',
  'Accept-Profile': 'vaporize_next', 'Content-Profile': 'vaporize_next', ...extra
});
const endpoint = new URL('/rest/v1/clients', url);
async function request(role, method, path, body, extra={}) {
  const response = await fetch(new URL(path, endpoint), {
    method, headers: headers(token[role], extra),
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(12000)
  });
  return response;
}
async function identity(role) {
  const r = await fetch(new URL('/auth/v1/user', url), {
    headers: { apikey:key, Authorization:'Bearer '+token[role] },
    redirect:'error', signal:AbortSignal.timeout(12000)
  });
  if (r.status !== 200) throw Error(role + ': JWT not verified (' + r.status + ')');
  const data = await r.json();
  if (!uuid.test(data.id)) throw Error(role + ': invalid auth identity');
  return data.id;
}
async function insert(role, organization_id, suffix, allowed) {
  const name = testPrefix + '-' + suffix;
  const r = await request(role, 'POST', '/rest/v1/clients', {
    organization_id, name, phone:null
  }, { Prefer:'return=representation' });
  if (allowed) {
    if (r.status !== 201) throw Error(role + ' INSERT expected 201, got ' + r.status);
    const data = await r.json();
    if (!Array.isArray(data) || data.length !== 1 || !uuid.test(data[0].id)) {
      throw Error(role + ': missing inserted ID');
    }
    created.push(data[0].id);
  } else {
    if (r.status < 400) {
      // Unexpected write: attempt cleanup using owner JWT in finally; do not mark pass.
      try {
        const rows = await r.json();
        if (Array.isArray(rows)) for (const row of rows) if (uuid.test(row.id)) created.push(row.id);
      } catch {}
      throw Error(role + ': unauthorized INSERT unexpectedly succeeded');
    }
  }
  console.log(JSON.stringify({case:suffix,role,status:r.status,pass:true}));
}
let passed = false, cleanupOk = false;
try {
  const ids = await Promise.all(['owner','manager','collaborator'].map(identity));
  if (new Set(ids).size !== 3) throw Error('Fixtures must use three distinct authenticated users');
  await insert('owner', orgA, 'owner', true);
  await insert('manager', orgA, 'manager', true);
  await insert('collaborator', orgA, 'collaborator-denied', false);
  await insert('owner', orgB, 'cross-tenant-denied', false);
  passed = true;
} catch (e) {
  console.error('HTTP INSERT validation failed:', e.message);
} finally {
  try {
    // Delete by unique prefix, including any unexpectedly successful insert.
    // Requires explicit owner DELETE policy scoped to organization A; do not grant for this test.
    const filter = '/rest/v1/clients?name=like.' + encodeURIComponent(testPrefix + '*');
    const deletion = await request('owner', 'DELETE', filter, undefined, {Prefer:'return=representation'});
    if (deletion.status !== 200) throw Error('cleanup DELETE HTTP ' + deletion.status);
    const deleted = await deletion.json();
    const deletedIds = new Set(Array.isArray(deleted) ? deleted.map(x=>x.id) : []);
    if (created.some(id=>!deletedIds.has(id))) throw Error('cleanup missing created rows');
    const check = await request('owner', 'GET', filter);
    if (check.status !== 200) throw Error('cleanup verification GET HTTP ' + check.status);
    const remaining = await check.json();
    if (!Array.isArray(remaining) || remaining.length) throw Error('cleanup verification found remaining rows');
    cleanupOk = true;
    console.log(JSON.stringify({cleanup:'verified',removed:deletedIds.size}));
  } catch(e) {
    console.error('CLEANUP NOT VERIFIED:',e.message,'; isolate and manually inspect test prefix:',testPrefix);
  }
}
if (!passed || !cleanupOk) process.exitCode = 1;
