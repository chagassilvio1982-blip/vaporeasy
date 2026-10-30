import test from 'node:test';
import assert from 'node:assert/strict';
import { attachClientsPanel } from '../src/ui/clients-panel.js';
import { attachVehiclesPanel } from '../src/ui/vehicles-panel.js';
import { attachAppointmentsPanel } from '../src/ui/appointments-panel.js';

const cases = [
  { name: 'clients', attach: attachClientsPanel, table: 'clients',
    row: { id: 'c1', organization_id:'org-1', name: '<img src=x onerror=alert(1)>' } },
  { name: 'vehicles', attach: attachVehiclesPanel, table: 'vehicles',
    row: { id: 'v1', organization_id:'org-1', client_id: 'c1', brand: 'VW', model: 'Polo', plate: 'ABC1D23' } },
  { name: 'appointments', attach: attachAppointmentsPanel, table: 'appointments',
    row: { id: 'a1', organization_id:'org-1', vehicle_id: 'v1', starts_at: '2026-10-30T10:00:00Z',
      ends_at: '2026-10-30T11:00:00Z', status: 'scheduled' } }
];

function fixture(name, table, row) {
  const elements = new Map();
  const element = id => ({
    id, hidden: false, disabled: false, textContent: '', children: [], value:'',
    reset(){this.value='';},
    querySelector(){return element('submit');},
    append(child){this.children.push(child);},
    replaceChildren(...children) { this.children = children; },
    addEventListener(type, handler) { if (type === 'click') this.click = handler; else this[type] = handler; }
  });
  for (const id of ['workspace', 'load-' + name, name + '-list', name + '-status']) {
    elements.set(id, element(id));
  }
  for (const id of ['client-create-form','client-edit-form','client-write-status','client-edit-cancel','client-name','client-phone','client-edit-name','client-edit-phone','vehicle-create-form','vehicle-edit-form','vehicle-edit-cancel','vehicle-owner','vehicle-write-status','vehicle-client-filter','vehicle-brand','vehicle-model','vehicle-plate','vehicle-edit-brand','vehicle-edit-model','vehicle-edit-plate']) elements.set(id,element(id));
  const document = { getElementById: id => elements.get(id),
    createElement: tag => element(tag) };
  const state = { recovering: false, internalAccess: true, organizations: [{ organization_id: 'org-1', membership_role:'collaborator' }] };
  const subscribers = [];
  const controller = {
    state: () => state,
    subscribe: callback => subscribers.push(callback),
    requireInternalAccess: async () => state.internalAccess
  };
  let resolveQuery;
  const queryPromise = new Promise(resolve => { resolveQuery = resolve; });
  const supabase = { schema(schema) {
    assert.equal(schema, 'vaporize_next');
    return { from(actual) {
      assert.ok(actual === table || (table === 'vehicles' && actual === 'clients'));
      if (actual === 'clients' && table === 'vehicles') return {select(){return {eq(){return {order(){return {limit:async()=>({data:[],error:null})}}}}}}};
      return { select() {
        return { eq(field, org) {
          assert.equal(field, 'organization_id');
          assert.equal(org, 'org-1');
          return { order() {
            return { limit: () => queryPromise };
          } };
        } };
      } };
    } };
  } };
  return { document, state, subscribers, controller, supabase, elements,
    resolveQuery: () => resolveQuery({ data: [row], error: null }) };
}

for (const { name, attach, table, row } of cases) {
  test(name + ' discards an in-flight response after revocation', async () => {
    const f = fixture(name, table, row);
    attach(f.supabase, f.controller, f.document);
    const pending = f.elements.get('load-' + name).click();
    // Let the membership check complete and the backend request begin.
    await new Promise(resolve => setImmediate(resolve));
    f.state.internalAccess = false;
    f.subscribers.forEach(callback => callback(f.state));
    f.resolveQuery();
    await pending;
    assert.equal(f.elements.get(name + '-list').children.length, 0);
    assert.equal(f.elements.get(name + '-status').textContent, '');
  });
  test(name + ' renders safe text only after successful membership verification', async () => {
    const f = fixture(name, table, row);
    attach(f.supabase, f.controller, f.document);
    const pending = f.elements.get('load-' + name).click();
    f.resolveQuery();
    await pending;
    assert.equal(f.elements.get(name + '-list').children.length, 1);
    assert.equal(typeof f.elements.get(name + '-list').children[0].textContent, 'string');
  });
}
