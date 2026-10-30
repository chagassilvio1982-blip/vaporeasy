import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/data/clients.js';

const membership = { organization_id: 'org-a', organization_name: 'Empresa A', membership_role: 'owner' };
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
            assert.equal(columns, 'id,organization_id,name,phone,created_at');
            return { async single() {
              return { data: { id: 'client-a', organization_id: payload.organization_id, name: payload.name, phone: payload.phone }, error };
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

test('collaborator cannot create clients', async () => {
  const x = fixture();
  x.state.organizations = [{ ...membership, membership_role: 'collaborator' }];
  await assert.rejects(createClient(x.supabase, x.controller, { name: 'Cliente A' }), /owner or manager/);
  assert.equal(x.calls.length, 0);
});

test('manager can create clients', async () => {
  const x = fixture();
  x.state.organizations = [{ ...membership, membership_role: 'manager' }];
  await createClient(x.supabase, x.controller, { name: 'Cliente A' });
  assert.equal(x.calls.length, 1);
});

test('role revocation during insert discards returned client', async () => {
  const x = fixture({ onInsert: state => {
    state.organizations = [{ ...membership, membership_role: 'collaborator' }];
  } });
  await assert.rejects(createClient(x.supabase, x.controller, { name: 'Cliente A' }), /Access changed/);
});

test('ignores organization_id supplied by form and writes only verified tenant', async () => {
  const x = fixture();
  await createClient(x.supabase, x.controller, {
    name: 'Cliente A', organization_id: 'org-b', role: 'owner'
  });
  assert.equal(x.calls.length, 1);
  assert.equal(x.calls[0].organization_id, 'org-a');
  assert.equal(Object.hasOwn(x.calls[0], 'role'), false);
});

test('multiple active organizations cannot be silently selected for writes', async () => {
  const x = fixture();
  x.state.organizations = [membership, { ...membership, organization_id: 'org-b' }];
  await assert.rejects(createClient(x.supabase, x.controller, { name: 'Cliente A' }), /single active organization/);
  assert.equal(x.calls.length, 0);
});

test('revoked organization before insert cannot write', async () => {
  const x = fixture();
  let checks = 0;
  x.controller.state = () => {
    checks++;
    if (checks === 2) x.state.organizations = [{ ...membership, organization_id: 'org-b' }];
    return x.state;
  };
  await assert.rejects(createClient(x.supabase, x.controller, { name: 'Cliente A' }), /Access changed before write/);
  assert.equal(x.calls.length, 0);
});

test('client creation rejects response from another organization', async () => {
  const x=fixture();
  const original=x.supabase.schema;
  x.supabase.schema=(name)=>{
    const schema=original(name);
    const from=schema.from;
    schema.from=(table)=>{
      const base=from(table);
      const insert=base.insert;
      base.insert=(payload)=>{
        const chain=insert(payload);
        const select=chain.select;
        chain.select=(columns)=>{
          const result=select(columns);
          result.single=async()=>({data:{id:'client-b',organization_id:'org-b',name:payload.name},error:null});
          return result;
        };
        return chain;
      };
      return base;
    };
    return schema;
  };
  await assert.rejects(createClient(x.supabase,x.controller,{name:'Cliente A'}),/Unexpected client creation response/);
});
