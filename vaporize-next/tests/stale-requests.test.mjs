import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const name of ['clients','vehicles','appointments']) {
  test(`${name} invalidates pending reads when access changes`, () => {
    const source = readFileSync(new URL(`../src/ui/${name}-panel.js`, import.meta.url), 'utf8');
    assert.match(source, /controller\.subscribe\(\(\{ recovering, internalAccess \}\) =>/);
    assert.match(source, /generation\+\+/);
    assert.match(source, /requestGeneration !== generation/);
    assert.match(source, /list\.replaceChildren\(\)/);
    assert.match(source, /workspace\.hidden/);
  });
}
