import test from 'node:test';
import assert from 'node:assert/strict';
import { createEphemeralPkceStorage } from '../src/auth/storage.js';

function tabStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    keys: () => [...values.keys()]
  };
}

test('PKCE verifier survives a new page instance in the same tab', () => {
  const tab = tabStorage();
  const first = createEphemeralPkceStorage(tab);
  first.setItem('sb-next-auth-token-code-verifier', 'temporary-verifier');
  assert.equal(createEphemeralPkceStorage(tab).getItem('sb-next-auth-token-code-verifier'), 'temporary-verifier');
  first.removeItem('sb-next-auth-token-code-verifier');
  assert.equal(createEphemeralPkceStorage(tab).getItem('sb-next-auth-token-code-verifier'), null);
});

test('login and refresh tokens survive reload in the same tab and are removed on logout', () => {
  const tab = tabStorage();
  const first = createEphemeralPkceStorage(tab);
  first.setItem('sb-next-auth-token', '{"access_token":"secret","refresh_token":"secret"}');
  const reloaded = createEphemeralPkceStorage(tab);
  assert.match(reloaded.getItem('sb-next-auth-token'), /access_token/);
  assert.equal(tab.keys().length, 1);
  reloaded.removeItem('sb-next-auth-token');
  assert.equal(first.getItem('sb-next-auth-token'), null);
  assert.deepEqual(tab.keys(), []);
});

test('Vaporize Next storage keys are isolated and do not overwrite other apps', () => {
  const tab = tabStorage();
  tab.setItem('sb-next-auth-token', 'unrelated');
  const storage = createEphemeralPkceStorage(tab);
  storage.setItem('sb-next-auth-token', 'next-session');
  assert.equal(tab.getItem('sb-next-auth-token'), 'unrelated');
  assert.equal(storage.getItem('sb-next-auth-token'), 'next-session');
  storage.removeItem('sb-next-auth-token');
  assert.equal(tab.getItem('sb-next-auth-token'), 'unrelated');
});

test('legacy PKCE verifier is read and cleared after migration', () => {
  const tab = tabStorage();
  tab.setItem('sb-next-auth-token-code-verifier', 'old-verifier');
  const storage = createEphemeralPkceStorage(tab);
  assert.equal(storage.getItem('sb-next-auth-token-code-verifier'), 'old-verifier');
  storage.removeItem('sb-next-auth-token-code-verifier');
  assert.equal(tab.getItem('sb-next-auth-token-code-verifier'), null);
});
