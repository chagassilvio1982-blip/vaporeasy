/**
 * Read-only REST readiness probe for the dedicated Vaporize Next homologation.
 * Usage: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node scripts/check-rest-schema.mjs
 * Never provide a service_role key. Does not create users or data.
 */
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY');
  process.exitCode = 2;
} else {
  const expected = 'cfpvexgkjsqpwhebsoos.supabase.co';
  let endpoint;
  try {
    const base = new URL(url);
    if (base.protocol !== 'https:' || base.hostname !== expected) {
      throw new Error('Refusing any project other than isolated homologation');
    }
    endpoint = new URL('/rest/v1/clients?select=id&limit=0', base);
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: key,
        'Accept-Profile': 'vaporize_next',
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });
    const body = await response.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = {}; }
    console.log(JSON.stringify({
      status: response.status,
      code: parsed.code ?? null,
      schemaReady: response.status === 200,
      note: response.status === 200
        ? 'Read-only schema request succeeded'
        : 'Not confirmed; check PostgREST schema exposure and API access'
    }));
    if (response.status !== 200) process.exitCode = 1;
  } catch (error) {
    console.error('Read-only probe failed:', error.message);
    process.exitCode = 1;
  }
}
