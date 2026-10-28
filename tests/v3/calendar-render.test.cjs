const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../v3/scripts/calendar.js'), 'utf8');
const start = source.indexOf('function renderAgendaListHtml(');
const end = source.indexOf('\nasync function loadAgendaList()', start);
assert.ok(start >= 0 && end > start, 'Função isolada deve existir antes do carregamento da lista');

const sandbox = {
  Map,
  Intl,
  Date,
  agendaLocalDateKey: iso => iso.slice(0, 10),
  esc: value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  apRange: () => '09:00–10:30',
  statusLabel: () => 'Agendado'
};
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);
const render = sandbox.renderAgendaListHtml;

test('lista vazia produz HTML vazio', () => {
  assert.equal(render([], new Map(), new Map(), new Map(), new Map(), new Map()), '');
});

test('agrupa por data e preserva seleção de agendamento', () => {
  const rows = [
    {id:'a1', starts_at:'2026-10-27T09:00:00', client_id:'c1', vehicle_id:'v1', service_id:'s1', status:'pending'},
    {id:'a2', starts_at:'2026-10-27T11:00:00', client_id:'c1', vehicle_id:'v1', service_id:'s1', status:'pending'},
    {id:'a3', starts_at:'2026-10-28T09:00:00', client_id:'c1', vehicle_id:'v1', service_id:'s1', status:'pending'}
  ];
  const html = render(rows, new Map([['c1',{name:'Cliente'}]]), new Map([['v1',{brand:'VW',model:'Polo',plate:'ABC1234'}]]), new Map([['s1',{name:'Lavagem'}]]), new Map(), new Map());
  assert.equal((html.match(/class="list-caption"/g) || []).length, 2);
  for (const id of ['a1','a2','a3']) assert.ok(html.includes('data-agenda-list-id="'+id+'"'));
  assert.ok(html.includes('data-agenda-list-day="2026-10-27"'));
  assert.ok(html.includes('ABC1234'));
});

test('escapa dados de cliente e identificador antes do HTML', () => {
  const rows = [{id:'a"<script>', starts_at:'2026-10-27T09:00:00', client_id:'c1', status:'pending'}];
  const html = render(rows, new Map([['c1',{name:'<img src=x onerror=alert(1)>'}]]), new Map(), new Map(), new Map(), new Map());
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('a&quot;&lt;script&gt;'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('id="a"<script>'));
});
