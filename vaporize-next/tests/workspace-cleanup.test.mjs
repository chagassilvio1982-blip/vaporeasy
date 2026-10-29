import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
test('workspace exit clears every tenant list and status', () => {
  assert.match(main, /if \(id !== 'workspace'\)/);
  assert.match(main, /\['clients','vehicles','appointments'\]/);
  assert.match(main, /\$\(module \+ '-list'\)\.replaceChildren\(\)/);
  assert.match(main, /\$\(module \+ '-status'\)\.textContent = ''/);
});
test('logout and access revocation both close workspace', () => {
  assert.match(main, /controller\.subscribe\([\s\S]*?show\('login-form'\)/);
  assert.match(main, /\$\('logout'\)\.addEventListener\('click',[\s\S]*?show\('login-form'\)/);
});
