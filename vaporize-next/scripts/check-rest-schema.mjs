/**
 * Read-only verification of a synthetic test JWT AND REST schema.
 * Dedicated isolated Supabase project only; never logs keys, JWTs or bodies.
 * Required: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_TEST_JWT.
 */
const expected = 'cfpvexgkjsqpwhebsoos.supabase.co';
const baseString = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const jwt = process.env.SUPABASE_TEST_JWT;
if (!baseString || !key || !jwt) {
  console.error('Missing isolated URL, publishable key or synthetic JWT');
  process.exitCode = 2;
} else {
  try {
    const base = new URL(baseString);
    if (base.protocol !== 'https:' || base.hostname !== expected ||
        base.username || base.password || base.search || base.hash ||
        base.pathname !== '/') throw Error('invalid project URL');
    if (!key.startsWith('sb_publishable_') || jwt === key) throw Error('invalid key or JWT');
    const headers = { apikey: key, Authorization: `Bearer ${jwt}`, Accept: 'application/json' };
    const options = { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000) };
    // Auth service verifies the JWT; an arbitrary 200 from PostgREST is not enough.
    const auth = await fetch(new URL('/auth/v1/user', base), { ...options, headers });
    let authBody = {};
    try { authBody = await auth.json(); } catch { /* no body logging */ }
    const authenticated = auth.status === 200 && typeof authBody.id === 'string' && authBody.id.length > 0;
    if (!authenticated) {
      console.log(JSON.stringify({ authStatus: auth.status, jwtVerified: false, restChecked: false }));
      process.exitCode = 1;
    } else {
      const rest = await fetch(new URL('/rest/v1/clients?select=id&limit=0', base), {
        ...options,
        headers: { ...headers, 'Accept-Profile': 'vaporize_next' }
      });
      let restBody = {};
      try { restBody = await rest.json(); } catch { /* no body logging */ }
      console.log(JSON.stringify({
        authStatus: auth.status, jwtVerified: true,
        restStatus: rest.status,
        restErrorCode: typeof restBody.code === 'string' ? restBody.code : null,
        schemaAccessible: rest.status === 200
      }));
      if (rest.status !== 200) process.exitCode = 1;
    }
  } catch {
    console.error('Isolated REST/JWT probe failed: network or configuration error');
    process.exitCode = 1;
  }
}
