import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthController } from '../src/auth/controller.js';
import { readFileSync } from 'node:fs';

test('onboarding allowed only when identity valid and membership list is empty', async () => {
  const auth = { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) };
  const rpc = async (name) => name === 'vaporize_next_my_organizations' ? { data: [], error: null } : { error: new Error('unexpected') };
  assert.equal(await createAuthController({ auth, rpc }).canOnboard(), true);
  assert.equal(await createAuthController({ auth, rpc: async () => ({ data: null, error: new Error('offline') }) }).canOnboard(), false);
  assert.equal(await createAuthController({ auth: { getUser: async () => ({ data: { user: null } }) }, rpc }).canOnboard(), false);
});

test('organization creation rechecks membership before granting access', async () => {
  let created = false;
  const auth = { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) };
  const rpc = async (name, args) => {
    if (name === 'vaporize_next_create_organization') {
      assert.deepEqual(args, { p_name: 'Empresa Teste', p_slug: 'empresa-teste' });
      created = true;
      return { data: [{ organization_id: 'org-a' }], error: null };
    }
    return { data: created ? [{ organization_id: 'org-a', organization_name: 'Empresa Teste' }] : [], error: null };
  };
  const controller = createAuthController({ auth, rpc });
  assert.equal(await controller.createFirstOrganization('Empresa Teste', 'empresa-teste'), true);
  assert.equal(controller.state().internalAccess, true);
});

test('onboarding never authorizes workspace when RPC fails', async () => {
  const auth = { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) };
  const controller = createAuthController({ auth, rpc: async () => ({ error: new Error('denied') }) });
  await assert.rejects(controller.createFirstOrganization('Empresa', 'empresa'), /denied/);
  assert.equal(controller.state().internalAccess, false);
});

test('onboarding form exists and is hidden by default', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(html, /id="onboarding-form" hidden/);
  assert.match(main, /controller\.createFirstOrganization\(/);
  assert.match(main, /await controller\.canOnboard\(\)/);
});
