import test from 'node:test';
import assert from 'node:assert/strict';
import { listClients } from '../src/data/clients.js';

const membership = { organization_id: 'org-a', organization_name: 'Empresa A' };
function mock({ allow = true, rows = [], error = null, onRead = () => {} } = {}) {
  const state = { recovering: false, internalAccess: allow, organizations: allow ? [membership] : [] };
  const controller = {
    state: () => state,
    requireInternalAccess: async () => allow
  };
  let queryCount = 0;
  const supabase = {
    schema(name) {
      assert.equal(name, 'vaporize_next');
      return { from(table) {
        assert.equal(table, 'clients');
        return { select(cols) {
          assert.equal(cols, 'id,name,phone,created_at');
          return { eq(key, value) {
            assert.equal(key, 'organization_id');
            assert.equal(value, 'org-a');
            return { order(column, options) {
              assert.equal(column, 'created_at');
              assert.equal(options.ascending, false);
              return { async limit(n) {
                assert.equal(n, 50);
                queryCount++;
                onRead(state);
                return { data: rows, error };
              } };
            } };
          } };
        } };
      } };
    }
  };
  return { supabase, controller, state, reads: () => queryCount };
}
test('read-only clients query is scoped to verified organization', async () => {
  const x = mock({ rows: [{ id: 'client-a', name: 'Cliente A' }] });
  assert.deepEqual(await listClients(x.supabase, x.controller), [{ id: 'client-a', name: 'Cliente A' }]);
  assert.equal(x.reads(), 1);
});
test('no verified membership never queries clients', async () => {
  const x = mock({ allow: false });
  await assert.rejects(listClients(x.supabase, x.controller), /Membership required/);
  assert.equal(x.reads(), 0);
});
test('revocation during request discards returned client records', async () => {
  const x = mock({ rows: [{ id: 'client-a', name: 'Cliente A' }], onRead: s => {
    s.internalAccess = false;
    s.organizations = [];
  } });
  await assert.rejects(listClients(x.supabase, x.controller), /Access changed/);
});
test('backend error and malformed responses fail closed', async () => {
  const x = mock({ error: new Error('RLS denied') });
  await assert.rejects(listClients(x.supabase, x.controller), /RLS denied/);
  const y = mock({ rows: [{ id: 1, name: 'bad' }] });
  await assert.rejects(listClients(y.supabase, y.controller), /Unexpected clients response/);
});
test('invalid page size is rejected before access', async () => {
  const x = mock();
  await assert.rejects(listClients(x.supabase, x.controller, 101), /Invalid page size/);
});
