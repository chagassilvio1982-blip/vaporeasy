/**
 * Read-only REST/JWT probe — Vaporize Next isolated homologation ONLY.
 *
 * SUPABASE_URL=https://cfpvexgkjsqpwhebsoos.supabase.co
 * SUPABASE_PUBLISHABLE_KEY=(public project key)
 * SUPABASE_TEST_JWT=(optional JWT of a synthetic homologation account)
 * node scripts/check-rest-schema.mjs
 *
 * No writes, no credential output, no service_role. Never use a production JWT.
 */
const baseString = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const jwt = process.env.SUPABASE_TEST_JWT;
const expected = 'cfpvexgkjsqpwhebsoos.supabase.co';
if (!baseString || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY');
  process.exitCode = 2;
} else {
  try {
    const base = new URL(baseString);
    if (base.protocol !== 'https:' || base.hostname !== expected ||
        base.username || base.password || base.search || base.hash ||
        base.pathname !== '/') {
      throw new Error('Only isolated homologation base URL is permitted');
    }
    if (!key.startsWith('sb_publishable_')) {
      throw new Error('Require modern publishable key; no service_role or legacy key');
    }
    const endpoint = new URL('/rest/v1/clients?select=id&limit=0', base);
    const headers = {
      apikey: key,
      'Accept-Profile': 'vaporize_next',
      Accept: 'application/json'
    };
    if (jwt) headers.Authorization = `Bearer ${jwt}`;
    const response = await fetch(endpoint, {
      method: 'GET', headers, redirect: 'error',
      signal: AbortSignal.timeout(10000)
    });
    const body = await response.text();
    let parsed = {};
    try { parsed = JSON.parse(body); } catch { /* do not log response body */ }
    const result = {
      mode: jwt ? 'synthetic_jwt' : 'publishable_key_only',
      httpStatus: response.status,
      errorCode: typeof parsed.code === 'string' ? parsed.code : null,
      requestSucceeded: response.status === 200,
      // A 200 with publishable key only does NOT validate a real JWT.
      jwtValidated: Boolean(jwt) && response.status === 200,
      note: response.status === 200
        ? (jwt ? 'Authenticated read-only request succeeded' : 'Public-key request succeeded; JWT not tested')
        : 'REST readiness not confirmed'
    };
    console.log(JSON.stringify(result));
    if (response.status !== 200) process.exitCode = 1;
  } catch (error) {
    // Avoid echoing arbitrary URLs, headers, JWTs or response bodies.
    console.error('Probe failed:', error.name === 'TimeoutError' ? 'timeout' : 'network or configuration error');
    process.exitCode = 1;
  }
}
