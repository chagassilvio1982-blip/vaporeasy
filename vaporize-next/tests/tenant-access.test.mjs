import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthController } from '../src/auth/controller.js';

test('authenticated user without a verified membership is denied', async () => {
  const auth = { getUser: async () => ({ data: { user: { id: 'test-user' } }, error: null }) };
  const rpc = async () => ({ data: [], error: null });
  const controller = createAuthController({ auth, rpc });
  assert.equal(await controller.requireInternalAccess(), false);
  assert.equal(controller.state().internalAccess, false);
});
