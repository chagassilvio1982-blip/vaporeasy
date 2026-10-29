import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthController } from '../src/auth/controller.js';

function fakeAuth() {
 const calls = [];
 const user = { id: 'user-a' };
 const session = { user, access_token: 'a', refresh_token: 'r' };
 const auth = {
  calls,
  verifyOtp: async (params) => { calls.push(['verifyOtp', params]); return { data: { session }, error: null }; },
  exchangeCodeForSession: async (code) => { calls.push(['exchange', code]); return { data: { session }, error: null }; },
  setSession: async (tokens) => { calls.push(['setSession', tokens]); return { data: { session }, error: null }; },
  getUser: async () => ({ data: { user }, error: null }),
  updateUser: async (params) => { calls.push(['update', params]); return { error: null }; },
  signOut: async () => { calls.push(['signOut']); return { error: null }; }
 };
 return auth;
}

test('rejects password change without recovery session', async () => {
 const auth = fakeAuth();
 const ctrl = createAuthController({ auth });
 await assert.rejects(ctrl.changePassword('secure-password-123'), /Recovery session required/);
 assert.equal(auth.calls.length, 0);
});

test('token_hash recovery validates identity and signs out after password change', async () => {
 const auth = fakeAuth();
 const ctrl = createAuthController({ auth });
 const result = await ctrl.beginRecovery('https://example.test/next/?token_hash=abc&type=recovery');
 assert.equal(ctrl.state().internalAccess, false);
 assert.equal(result.userId, 'user-a');
 assert.equal(result.sanitizedUrl.includes('token_hash'), false);
 await ctrl.changePassword('secure-password-123');
 assert.equal(ctrl.state().recovering, false);
 assert.deepEqual(auth.calls.map(([action]) => action), ['verifyOtp','update','signOut']);
});

test('PKCE recovery code exchanges for a session', async () => {
 const auth = fakeAuth();
 const ctrl = createAuthController({ auth });
 await ctrl.beginRecovery('https://example.test/next/?code=abc&flow=recovery');
 assert.equal(ctrl.state().internalAccess, false);
 assert.equal(auth.calls[0][0], 'exchange');
});

test('rejects invalid token type and signs out', async () => {
 const auth = fakeAuth();
 const ctrl = createAuthController({ auth });
 await assert.rejects(ctrl.beginRecovery('https://example.test/next/?token_hash=abc&type=signup'), /Invalid recovery link type/);
 assert.equal(ctrl.state().recovering, false);
 assert.equal(auth.calls.some(([action]) => action === 'signOut'), true);
});

test('rejects weak password without calling updateUser', async () => {
 const auth = fakeAuth();
 const ctrl = createAuthController({ auth });
 await ctrl.beginRecovery('https://example.test/next/?token_hash=abc&type=recovery');
 await assert.rejects(ctrl.changePassword('short'), /at least 12/);
 assert.equal(auth.calls.some(([action]) => action === 'update'), false);
});

test('rejects PKCE without explicit recovery intent', async () => {
 const auth = fakeAuth();
 const ctrl = createAuthController({ auth });
 await assert.rejects(ctrl.beginRecovery('https://example.test/next/?code=abc'), /Recovery intent required/);
 assert.equal(auth.calls.some(([action]) => action === 'exchange'), false);
});

test('rejects password update when identity changes', async () => {
 const auth = fakeAuth();
 const ctrl = createAuthController({ auth });
 await ctrl.beginRecovery('https://example.test/next/?token_hash=abc&type=recovery');
 auth.getUser = async () => ({ data: { user: { id: 'user-b' } }, error: null });
 await assert.rejects(ctrl.changePassword('secure-password-123'), /expired/);
 assert.equal(auth.calls.some(([action]) => action === 'update'), false);
});
