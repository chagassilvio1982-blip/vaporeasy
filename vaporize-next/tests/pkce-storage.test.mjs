import test from 'node:test';
import assert from 'node:assert/strict';
import { createEphemeralPkceStorage } from '../src/auth/storage.js';

function tabStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    keys: () => [...values.keys()]
  };
}

test('PKCE verifier survives a new page instance in the same tab', () => {
  const tab = tabStorage();
  const first = createEphemeralPkceStorage(tab);
  first.setItem('sb-next-auth-token-code-verifier', 'temporary-verifier');
  const second = createEphemeralPkceStorage(tab);
  assert.equal(second.getItem('sb-next-auth-token-code-verifier'), 'temporary-verifier');
  second.removeItem('sb-next-auth-token-code-verifier');
  assert.equal(tab.getItem('sb-next-auth-token-code-verifier'), null);
});

test('login and refresh tokens do not survive a new page instance', () => {
  const tab = tabStorage();
  const first = createEphemeralPkceStorage(tab);
  first.setItem('sb-next-auth-token', '{"access_token":"secret","refresh_token":"secret"}');
  assert.match(first.getItem('sb-next-auth-token'), /access_token/);
  assert.equal(createEphemeralPkceStorage(tab).getItem('sb-next-auth-token'), null);
  assert.deepEqual(tab.keys(), []);
});

test('unrelated keys are never persisted in tab storage', () => {
  const tab = tabStorage();
  const storage = createEphemeralPkceStorage(tab);
  storage.setItem('other-key', 'not-persisted');
  assert.deepEqual(tab.keys(), []);
  storage.removeItem('other-key');
  assert.equal(storage.getItem('other-key'), null);
});
