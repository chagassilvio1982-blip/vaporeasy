import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
test('appointments panel exists only inside hidden workspace', () => {
  const html = read('../index.html');
  const start = html.indexOf('id="workspace" hidden');
  const button = html.indexOf('id="load-appointments"');
  const end = html.indexOf('</section>', start);
  assert.ok(start >= 0 && button > start && button < end);
});
test('appointments panel invokes tenant service and renders as text', () => {
  const panel = read('../src/ui/appointments-panel.js');
  const main = read('../src/ui/main.js');
  assert.match(panel, /listAppointments\(supabase, controller\)/);
  assert.match(panel, /item\.textContent/);
  assert.doesNotMatch(panel, /innerHTML/);
  assert.match(main, /attachAppointmentsPanel\(supabase, controller, document\)/);
});
