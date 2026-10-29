import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthController } from '../src/auth/controller.js';

test('authenticated user remains blocked until tenant authorization is implemented', async () => {
  const auth = { getUser: async () => ({ data: { user: { id: 'test-user' } }, error: null }) };
  const controller = createAuthController({ auth });
  assert.equal(await controller.requireInternalAccess(), false);
  assert.equal(controller.state().internalAccess, false);
});
