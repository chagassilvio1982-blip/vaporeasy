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
  TEST_OWNER_USER_ID: 'f9e4d2eb-2ff6-44d5-95ab-9ea6ae2bdcaf',
  TEST_MANAGER_USER_ID: '0a513b95-8351-42b7-ab7d-cb39f7c1685e',
  TEST_COLLABORATOR_USER_ID: 'f1641725-bbc9-4c6e-b962-464851711adf',
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

test('duplicate expected user identities are rejected', () => {
  const result = probe({ TEST_MANAGER_USER_ID: valid.TEST_OWNER_USER_ID });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid or duplicated expected user IDs/);
});
test('malformed expected user identity is rejected', () => {
  const result = probe({ TEST_OWNER_USER_ID: 'invalid' });
  assert.equal(result.status, 2);
});
