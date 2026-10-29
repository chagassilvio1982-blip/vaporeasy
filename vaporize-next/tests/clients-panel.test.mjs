import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
test('clients panel is nested in hidden workspace', () => {
  const html = read('../index.html');
  const workspace = html.indexOf('id="workspace" hidden');
  const button = html.indexOf('id="load-clients"');
  const end = html.indexOf('</section>', workspace);
  assert.ok(workspace >= 0 && button > workspace && button < end);
});
test('clients panel uses textContent and membership-gated service', () => {
  const panel = read('../src/ui/clients-panel.js');
  const main = read('../src/ui/main.js');
  assert.match(panel, /listClients\(supabase, controller\)/);
  assert.match(panel, /item\.textContent = client\.name/);
  assert.doesNotMatch(panel, /innerHTML/);
  assert.match(main, /attachClientsPanel\(supabase, controller, document\)/);
});
