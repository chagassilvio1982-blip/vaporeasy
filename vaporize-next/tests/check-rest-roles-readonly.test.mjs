import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const script = resolve(dirname(fileURLToPath(import.meta.url)), '../scripts/check-rest-roles-readonly.mjs');
const orgA = '4eed149d-2907-4604-8d92-ecf212762664';
const orgB = 'c49f62ac-94b5-47bc-a292-3b53c563ae04';
const valid = {
  SUPABASE_URL: 'https://cfpvexgkjsqpwhebsoos.supabase.co/',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline-placeholder',
  TEST_OWNER_JWT: 'offline-owner',
  TEST_MANAGER_JWT: 'offline-manager',
  TEST_COLLABORATOR_JWT: 'offline-collaborator',
  TEST_ORG_A_ID: orgA,
  TEST_ORG_B_ID: orgB
};
function probe(overrides = {}) {
  const env = { PATH: process.env.PATH || '', ...valid, ...overrides };
  return spawnSync(process.execPath, [script], { env, encoding: 'utf8', timeout: 5000 });
}
test('missing JWT fails before network request', () => {
  const result = probe({ TEST_MANAGER_JWT: '' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Missing configuration/);
});
test('production or foreign host is rejected', () => {
  const result = probe({ SUPABASE_URL: 'https://another-project.supabase.co/' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Refusing non-isolated Supabase URL/);
});
test('non-HTTPS URL is rejected', () => {
  const result = probe({ SUPABASE_URL: 'http://cfpvexgkjsqpwhebsoos.supabase.co/' });
  assert.equal(result.status, 2);
});
test('invalid publishable key is rejected', () => {
  const result = probe({ SUPABASE_PUBLISHABLE_KEY: 'not-a-publishable-key' });
  assert.equal(result.status, 2);
});
test('identical tenant fixture IDs are rejected', () => {
  const result = probe({ TEST_ORG_B_ID: orgA });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid organization fixture IDs/);
});
test('malformed tenant fixture ID is rejected', () => {
  const result = probe({ TEST_ORG_A_ID: 'not-a-uuid' });
  assert.equal(result.status, 2);
});
