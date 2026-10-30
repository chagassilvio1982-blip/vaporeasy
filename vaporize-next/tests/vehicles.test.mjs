import test from 'node:test';
import assert from 'node:assert/strict';
import { listVehicles } from '../src/data/vehicles.js';

function mock({ allow = true, rows = [], error = null, revoke = false } = {}) {
  const state = { recovering: false, internalAccess: allow,
    organizations: allow ? [{ organization_id: 'org-1', organization_name: 'Org' }] : [] };
  let reads = 0;
  const controller = { state: () => state, requireInternalAccess: async () => allow };
  const supabase = { schema(name) {
    assert.equal(name, 'vaporize_next');
    return { from(table) {
      assert.equal(table, 'vehicles');
      return { select(fields) {
        assert.equal(fields, 'id,organization_id,client_id,brand,model,plate,created_at');
        return { eq(field, value) {
          assert.equal(field, 'organization_id');
          assert.equal(value, 'org-1');
          return { order(field, options) {
            assert.equal(field, 'created_at');
            assert.equal(options.ascending, false);
            return { async limit(value) {
              assert.equal(value, 50);
              reads++;
              if (revoke) { state.internalAccess = false; state.organizations = []; }
              return { data: rows, error };
            } };
          } };
        } };
      } };
    } };
  } };
  return { supabase, controller, reads: () => reads };
}
test('vehicle listing filters by verified tenant', async () => {
  const rows = [{ id: 'vehicle-1', organization_id:'org-1', client_id: 'client-1', brand: 'VW', model: 'Polo' }];
  const x = mock({ rows });
  assert.deepEqual(await listVehicles(x.supabase, x.controller), rows);
  assert.equal(x.reads(), 1);
});
test('vehicle listing refuses unauthenticated reads', async () => {
  const x = mock({ allow: false });
  await assert.rejects(listVehicles(x.supabase, x.controller), /Membership required/);
  assert.equal(x.reads(), 0);
});
test('vehicle listing discards response after access revocation', async () => {
  const x = mock({ revoke: true });
  await assert.rejects(listVehicles(x.supabase, x.controller), /Access changed/);
});
test('vehicle listing fails closed on RLS errors and malformed data', async () => {
  const x = mock({ error: new Error('RLS denied') });
  await assert.rejects(listVehicles(x.supabase, x.controller), /RLS denied/);
  const y = mock({ rows: [{ id: 'vehicle-1', organization_id:'org-1', client_id: 'client-1', brand: null, model: 'Polo' }] });
  await assert.rejects(listVehicles(y.supabase, y.controller), /Unexpected vehicles response/);
});
test('vehicle listing rejects oversized requests', async () => {
  const x = mock();
  await assert.rejects(listVehicles(x.supabase, x.controller, 101), /Invalid page size/);
});

test('vehicle listing filters by client within verified tenant', async () => {
  const clientId = 'ca21e0de-05e3-49f0-b0d5-8f3cb0010101';
  const rows = [{ id:'vehicle-1', organization_id:'org-1', client_id:clientId, brand:'VW', model:'Polo' }];
  const state = { recovering:false, internalAccess:true, organizations:[{ organization_id:'org-1' }] };
  const controller = { state:()=>state, requireInternalAccess:async()=>true };
  let filters = [];
  const query = {
    eq(field,value) { filters.push([field,value]); return this; },
    order() { return this; },
    async limit() { return { data:rows, error:null }; }
  };
  const supabase = { schema(name) {
    assert.equal(name,'vaporize_next');
    return { from(table) {
      assert.equal(table,'vehicles');
      return { select() { return query; } };
    } };
  } };
  assert.deepEqual(await listVehicles(supabase,controller,50,clientId),rows);
  assert.deepEqual(filters,[['organization_id','org-1'],['client_id',clientId]]);
});
test('vehicle listing rejects malformed client filter before network', async () => {
  const x=mock();
  await assert.rejects(listVehicles(x.supabase,x.controller,50,'invalid-client'),/Invalid client ID/);
  assert.equal(x.reads(),0);
});
test('vehicle listing rejects rows outside requested client', async () => {
  const clientId='ca21e0de-05e3-49f0-b0d5-8f3cb0010101';
  const state={recovering:false,internalAccess:true,organizations:[{organization_id:'org-1'}]};
  const controller={state:()=>state,requireInternalAccess:async()=>true};
  const query={eq(){return this},order(){return this},async limit(){return {data:[{id:'v',organization_id:'org-1',client_id:'cb21e0de-05e3-49f0-b0d5-8f3cb0010102',brand:'VW',model:'Polo'}],error:null}}};
  const supabase={schema(){return {from(){return {select(){return query}}}}}};
  await assert.rejects(listVehicles(supabase,controller,50,clientId),/Unexpected vehicles response/);
});

test('vehicle listing rejects a row from another organization even if server filter is bypassed', async () => {
  const state={recovering:false,internalAccess:true,organizations:[{organization_id:'org-1'}]};
  const controller={state:()=>state,requireInternalAccess:async()=>true};
  const query={eq(){return this},order(){return this},async limit(){return {data:[{id:'v',organization_id:'org-2',client_id:'c',brand:'VW',model:'Polo'}],error:null}}};
  const supabase={schema(){return {from(){return {select(){return query}}}}}};
  await assert.rejects(listVehicles(supabase,controller),/Unexpected vehicles response/);
});
