import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const script = new URL('../scripts/check-rest-schema.mjs', import.meta.url).pathname;
const project = 'https://cfpvexgkjsqpwhebsoos.supabase.co/';
const key = 'sb_publishable_FAKE_TEST_ONLY';
const preload = (status, code = null) => {
  const source = `globalThis.fetch = async (url, options) => {
    if (new URL(url).hostname !== 'cfpvexgkjsqpwhebsoos.supabase.co') throw Error('Wrong host');
    if (options.method !== 'GET') throw Error('Not read-only');
    if (options.headers['Accept-Profile'] !== 'vaporize_next') throw Error('Wrong schema');
    return {status:${status}, text: async () => JSON.stringify({code:${JSON.stringify(code)}})};
  };`;
  return 'data:text/javascript,' + encodeURIComponent(source);
};
function run(env, status = 200, code = null) {
  return spawnSync(process.execPath, ['--import', preload(status, code), script], {
    encoding: 'utf8',
    env: {PATH: process.env.PATH, SUPABASE_URL: project, SUPABASE_PUBLISHABLE_KEY: key, ...env}
  });
}
test('publishable-only GET does not claim JWT validation', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.requestSucceeded, true);
  assert.equal(output.jwtValidated, false);
  assert.equal(output.mode, 'publishable_key_only');
});
test('synthetic JWT mode distinguishes authenticated GET', () => {
  const result = run({SUPABASE_TEST_JWT: 'FAKE_JWT_FOR_MOCK_TEST'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).jwtValidated, true);
  assert.doesNotMatch(result.stdout + result.stderr, /FAKE_JWT_FOR_MOCK_TEST/);
});
test('REST schema rejection is not reported as success', () => {
  const result = run({}, 406, 'PGRST106');
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).errorCode, 'PGRST106');
});
test('other project hostname is rejected without network call', () => {
  const result = run({SUPABASE_URL: 'https://another-project.supabase.co/'});
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /sb_publishable_FAKE_TEST_ONLY/);
});
test('service role key is refused', () => {
  const result = run({SUPABASE_PUBLISHABLE_KEY: 'service_role_fake'});
  assert.equal(result.status, 1);
});
