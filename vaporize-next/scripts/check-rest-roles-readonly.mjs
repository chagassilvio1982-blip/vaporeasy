/** Read-only HTTP/JWT role verification. No database writes or credential logging. */
const expectedHost = 'cfpvexgkjsqpwhebsoos.supabase.co';
const required = ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','TEST_OWNER_JWT','TEST_MANAGER_JWT','TEST_COLLABORATOR_JWT','TEST_ORG_A_ID','TEST_ORG_B_ID','TEST_OWNER_USER_ID','TEST_MANAGER_USER_ID','TEST_COLLABORATOR_USER_ID'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) { console.error('Missing configuration:', missing.join(', ')); process.exit(2); }
const base = new URL(process.env.SUPABASE_URL);
if (base.protocol !== 'https:' || base.hostname !== expectedHost || base.pathname !== '/' ||
    base.search || base.hash || base.username || base.password) {
  console.error('Refusing non-isolated Supabase URL'); process.exit(2);
}
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!key.startsWith('sb_publishable_')) { console.error('Invalid publishable key'); process.exit(2); }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const org = process.env.TEST_ORG_A_ID;
const otherOrg = process.env.TEST_ORG_B_ID;
if (!uuid.test(org) || !uuid.test(otherOrg) || otherOrg === org) {
  console.error('Invalid organization fixture IDs'); process.exit(2);
}
const tokens = {owner:process.env.TEST_OWNER_JWT,manager:process.env.TEST_MANAGER_JWT,collaborator:process.env.TEST_COLLABORATOR_JWT};
const expectedIds = {owner:process.env.TEST_OWNER_USER_ID,manager:process.env.TEST_MANAGER_USER_ID,collaborator:process.env.TEST_COLLABORATOR_USER_ID};
if (Object.values(expectedIds).some(id=>!uuid.test(id)) || new Set(Object.values(expectedIds)).size !== 3) {
  console.error('Invalid or duplicated expected user IDs'); process.exit(2);
}
const ids = new Set();
let failures = 0;
for (const [role,jwt] of Object.entries(tokens)) {
  try {
    const headers = {apikey:key,Authorization:'Bearer '+jwt};
    const auth = await fetch(new URL('/auth/v1/user',base),{headers,redirect:'error',signal:AbortSignal.timeout(12000)});
    if (auth.status !== 200) throw Error('Auth HTTP '+auth.status);
    const user = await auth.json();
    if (!uuid.test(user.id) || ids.has(user.id) || user.id !== expectedIds[role]) throw Error('Unexpected or duplicate authenticated identity');
    ids.add(user.id);
    const membershipUrl = new URL('/rest/v1/memberships',base);
    membershipUrl.searchParams.set('select','user_id,role,status,organization_id');
    membershipUrl.searchParams.set('user_id','eq.'+user.id);
    membershipUrl.searchParams.set('organization_id','eq.'+org);
    const membership = await fetch(membershipUrl,{headers:{...headers,'Accept-Profile':'vaporize_next'},redirect:'error',signal:AbortSignal.timeout(12000)});
    if (membership.status !== 200) throw Error('Membership HTTP '+membership.status);
    const rows = await membership.json();
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].user_id !== user.id || rows[0].organization_id !== org || rows[0].role !== role || rows[0].status !== 'active') throw Error('Membership mismatch');
    // Verify access to the real tenant-scoped clients query, without writes.
    const clientsUrl = new URL('/rest/v1/clients',base);
    clientsUrl.searchParams.set('select','id,organization_id');
    clientsUrl.searchParams.set('organization_id','eq.'+org);
    clientsUrl.searchParams.set('limit','1');
    const clients = await fetch(clientsUrl,{headers:{...headers,'Accept-Profile':'vaporize_next'},redirect:'error',signal:AbortSignal.timeout(12000)});
    if (clients.status !== 200) throw Error('Clients GET HTTP '+clients.status);
    // HTTP 200 alone does not prove row-level isolation; assert tenant on returned rows.
    const clientRows = await clients.json();
    if (!Array.isArray(clientRows) || clientRows.length !== 1 || clientRows[0].organization_id !== org) throw Error('Unexpected clients response');
    // If a separate tenant fixture is provided, verify the current identity
    // cannot see membership rows from that organization.
    let crossTenantMembership = 'not-tested';
    if (otherOrg) {
      const otherUrl = new URL('/rest/v1/memberships',base);
      otherUrl.searchParams.set('select','organization_id');
      otherUrl.searchParams.set('organization_id','eq.'+otherOrg);
      const other = await fetch(otherUrl,{headers:{...headers,'Accept-Profile':'vaporize_next'},redirect:'error',signal:AbortSignal.timeout(12000)});
      if (other.status !== 200) throw Error('Cross-tenant membership HTTP '+other.status);
      const otherRows = await other.json();
      if (!Array.isArray(otherRows) || otherRows.length !== 0) throw Error('Cross-tenant membership visibility');
      crossTenantMembership = 'no-visible-rows-unverified-fixture';
      const otherClientsUrl = new URL('/rest/v1/clients',base);
      otherClientsUrl.searchParams.set('select','id,organization_id');
      otherClientsUrl.searchParams.set('organization_id','eq.'+otherOrg);
      otherClientsUrl.searchParams.set('limit','1');
      const otherClients = await fetch(otherClientsUrl,{headers:{...headers,'Accept-Profile':'vaporize_next'},redirect:'error',signal:AbortSignal.timeout(12000)});
      if (otherClients.status !== 200) throw Error('Cross-tenant clients HTTP '+otherClients.status);
      const otherClientRows = await otherClients.json();
      if (!Array.isArray(otherClientRows) || otherClientRows.length !== 0) throw Error('Cross-tenant clients visibility');
    }
    console.log(JSON.stringify({role,auth:200,membership:200,clients:200,crossTenantMembership,crossTenantClients:'no-visible-rows',pass:true}));
  } catch (error) {
    failures++;
    console.error(JSON.stringify({role,pass:false,error:error.message}));
  }
}
if (failures) process.exitCode=1;
