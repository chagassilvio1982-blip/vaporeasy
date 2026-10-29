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
        assert.equal(fields, 'id,client_id,brand,model,plate,created_at');
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
  const rows = [{ id: 'vehicle-1', client_id: 'client-1', brand: 'VW', model: 'Polo' }];
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
  const y = mock({ rows: [{ id: 'vehicle-1', client_id: 'client-1', brand: null, model: 'Polo' }] });
  await assert.rejects(listVehicles(y.supabase, y.controller), /Unexpected vehicles response/);
});
test('vehicle listing rejects oversized requests', async () => {
  const x = mock();
  await assert.rejects(listVehicles(x.supabase, x.controller, 101), /Invalid page size/);
});
