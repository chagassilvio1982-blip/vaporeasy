import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/data/clients.js';

const membership = { organization_id: 'org-a', organization_name: 'Empresa A' };
function fixture({ allow = true, error = null, onInsert = () => {} } = {}) {
  const state = { recovering: false, internalAccess: allow, organizations: allow ? [membership] : [] };
  const calls = [];
  const controller = {
    state: () => state,
    requireInternalAccess: async () => allow
  };
  const supabase = {
    schema(schema) {
      assert.equal(schema, 'vaporize_next');
      return { from(table) {
        assert.equal(table, 'clients');
        return { insert(payload) {
          calls.push(payload);
          onInsert(state);
          return { select(columns) {
            assert.equal(columns, 'id,name,phone,created_at');
            return { async single() {
              return { data: { id: 'client-a', name: payload.name, phone: payload.phone }, error };
            } };
          } };
        } };
      } };
    }
  };
  return { supabase, controller, state, calls };
}

test('creates a client only in verified tenant with normalized fields', async () => {
  const x = fixture();
  const created = await createClient(x.supabase, x.controller, { name: '  Cliente A  ', phone: ' 11999999999 ' });
  assert.equal(created.id, 'client-a');
  assert.deepEqual(x.calls, [{ organization_id: 'org-a', name: 'Cliente A', phone: '11999999999' }]);
});

test('rejects invalid name and phone before attempting database write', async () => {
  const x = fixture();
  await assert.rejects(createClient(x.supabase, x.controller, { name: ' ' }), /Invalid client name/);
  await assert.rejects(createClient(x.supabase, x.controller, { name: 'Cliente A', phone: 123 }), /Invalid client phone/);
  assert.equal(x.calls.length, 0);
});

test('denies creation without verified membership', async () => {
  const x = fixture({ allow: false });
  await assert.rejects(createClient(x.supabase, x.controller, { name: 'Cliente A' }), /Membership required/);
  assert.equal(x.calls.length, 0);
});

test('denies creation during password recovery', async () => {
  const x = fixture();
  x.state.recovering = true;
  await assert.rejects(createClient(x.supabase, x.controller, { name: 'Cliente A' }), /single active organization/);
  assert.equal(x.calls.length, 0);
});

test('rejects changed authorization after request', async () => {
  const x = fixture({ onInsert: state => { state.internalAccess = false; state.organizations = []; } });
  await assert.rejects(createClient(x.supabase, x.controller, { name: 'Cliente A' }), /Access changed/);
});

test('surfaces database policy errors without claiming success', async () => {
  const x = fixture({ error: new Error('RLS denied') });
  await assert.rejects(createClient(x.supabase, x.controller, { name: 'Cliente A' }), /RLS denied/);
});
