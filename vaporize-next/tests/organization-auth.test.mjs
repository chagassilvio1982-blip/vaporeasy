import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthController } from '../src/auth/controller.js';

const makeClient = (memberships, rpcError = null) => ({
  auth: { getUser: async () => ({ data: { user: { id: 'test-user' } }, error: null }) },
  rpc: async (name) => {
    assert.equal(name, 'vaporize_next_my_organizations');
    return { data: memberships, error: rpcError };
  }
});

test('denies authenticated user without active organization', async () => {
  const controller = createAuthController(makeClient([]));
  assert.equal(await controller.requireInternalAccess(), false);
  assert.equal(controller.state().internalAccess, false);
});

test('permits user with active organization returned by server RPC', async () => {
  const controller = createAuthController(makeClient([
    { organization_id: 'org-a', organization_name: 'Empresa A', membership_role: 'owner' }
  ]));
  assert.equal(await controller.requireInternalAccess(), true);
  assert.equal(controller.state().organizations[0].organization_id, 'org-a');
});

test('denies on RPC failure and clears previous authorization', async () => {
  let fail = false;
  const client = makeClient([]);
  client.rpc = async () => fail
    ? { data: null, error: new Error('offline') }
    : { data: [{ organization_id: 'org-a', organization_name: 'Empresa A' }], error: null };
  const controller = createAuthController(client);
  assert.equal(await controller.requireInternalAccess(), true);
  fail = true;
  assert.equal(await controller.requireInternalAccess(), false);
  assert.equal(controller.state().internalAccess, false);
});

test('logout cleanup removes authorized organizations', async () => {
  const controller = createAuthController(makeClient([
    { organization_id: 'org-a', organization_name: 'Empresa A', membership_role: 'owner' }
  ]));
  assert.equal(await controller.requireInternalAccess(), true);
  controller.clearAccess();
  assert.equal(controller.state().internalAccess, false);
  assert.deepEqual(controller.state().organizations, []);
});

test('authorization subscribers receive immediate revocation on failed revalidation', async () => {
  let fail = false;
  const client = makeClient([]);
  client.rpc = async () => fail
    ? { data: null, error: new Error('connection lost') }
    : { data: [{ organization_id: 'org-a', organization_name: 'Empresa A' }], error: null };
  const controller = createAuthController(client);
  const seen = [];
  controller.subscribe((s) => seen.push(s.internalAccess));
  assert.equal(await controller.requireInternalAccess(), true);
  fail = true;
  assert.equal(await controller.requireInternalAccess(), false);
  assert.equal(seen.at(-1), false);
});

test('late authorization response cannot restore access after logout', async () => {
  let resolveRpc;
  const rpc = () => new Promise((resolve) => { resolveRpc = resolve; });
  const controller = createAuthController({
    auth: { getUser: async () => ({ data: { user: { id: 'test-user' } }, error: null }) },
    rpc
  });
  const pending = controller.requireInternalAccess();
  await Promise.resolve();
  await Promise.resolve();
  controller.clearAccess();
  resolveRpc({ data: [{ organization_id: 'org-a', organization_name: 'Empresa A' }], error: null });
  assert.equal(await pending, false);
  assert.equal(controller.state().internalAccess, false);
});
