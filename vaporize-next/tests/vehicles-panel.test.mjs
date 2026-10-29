import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
test('vehicles panel is inside the hidden authenticated workspace', () => {
  const html = read('../index.html');
  const start = html.indexOf('id="workspace" hidden');
  const button = html.indexOf('id="load-vehicles"');
  const end = html.indexOf('</section>', start);
  assert.ok(start >= 0 && button > start && button < end);
});
test('vehicles panel uses safe text rendering and verified data service', () => {
  const panel = read('../src/ui/vehicles-panel.js');
  const main = read('../src/ui/main.js');
  assert.match(panel, /listVehicles\(supabase, controller\)/);
  assert.match(panel, /item\.textContent/);
  assert.doesNotMatch(panel, /innerHTML/);
  assert.match(main, /attachVehiclesPanel\(supabase, controller, document\)/);
});
