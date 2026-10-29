import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const script = new URL('../scripts/check-rest-schema.mjs', import.meta.url).pathname;
const project = 'https://cfpvexgkjsqpwhebsoos.supabase.co/';
const key = 'sb_publishable_FAKE_TEST_ONLY';
const jwt = 'FAKE_SYNTHETIC_JWT';
const preload = (authStatus, restStatus, restCode = null) => {
  const source = `globalThis.fetch = async (url, options) => {
    const u = new URL(url);
    if (u.hostname !== 'cfpvexgkjsqpwhebsoos.supabase.co') throw Error('wrong host');
    if (options.method !== 'GET' || options.headers.Authorization !== 'Bearer FAKE_SYNTHETIC_JWT') throw Error('unsafe request');
    if (u.pathname === '/auth/v1/user') return {
      status: ${authStatus}, json: async () => ${authStatus} === 200 ? ({id:'synthetic-user'}) : ({})
    };
    if (u.pathname !== '/rest/v1/clients' || options.headers['Accept-Profile'] !== 'vaporize_next') throw Error('wrong REST path/schema');
    return {status:${restStatus}, json: async () => ({code:${JSON.stringify(restCode)}})};
  };`;
  return 'data:text/javascript,' + encodeURIComponent(source);
};
function run(env = {}, authStatus = 200, restStatus = 200, restCode = null) {
  return spawnSync(process.execPath, ['--import', preload(authStatus, restStatus, restCode), script], {
    encoding: 'utf8',
    env: {PATH: process.env.PATH, SUPABASE_URL: project,
      SUPABASE_PUBLISHABLE_KEY: key, SUPABASE_TEST_JWT: jwt, ...env}
  });
}
test('validated Auth JWT followed by REST read succeeds', () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {
    authStatus: 200, jwtVerified: true, restStatus: 200,
    restErrorCode: null, schemaAccessible: true
  });
  assert.doesNotMatch(r.stdout + r.stderr, /FAKE_SYNTHETIC_JWT/);
});
test('invalid JWT never reports success', () => {
  const r = run({}, 401);
  assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(r.stdout), {authStatus: 401, jwtVerified: false, restChecked: false});
});
test('schema rejection remains a failure after valid Auth', () => {
  const r = run({}, 200, 406, 'PGRST106');
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).restErrorCode, 'PGRST106');
});
test('other project hostname is rejected', () => {
  const r = run({SUPABASE_URL: 'https://another-project.supabase.co/'});
  assert.equal(r.status, 1);
});
test('service role key is refused', () => {
  const r = run({SUPABASE_PUBLISHABLE_KEY: 'service_role_fake'});
  assert.equal(r.status, 1);
});
test('missing JWT is refused', () => {
  const r = run({SUPABASE_TEST_JWT: ''});
  assert.equal(r.status, 2);
});
