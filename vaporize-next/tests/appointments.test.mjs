import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listAppointments } from '../src/data/appointments.js';
const sql = readFileSync(new URL('../supabase/migrations/0004_appointments.sql', import.meta.url), 'utf8');
test('appointments schema enforces tenant vehicle FK, interval and RLS', () => {
  assert.match(sql, /foreign key\s*\(vehicle_id,\s*organization_id\)/i);
  assert.match(sql, /ends_at > starts_at/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /vaporize_next\.is_member\(organization_id\)/i);
  assert.doesNotMatch(sql, /grant\s+(?:all|insert|update|delete)\s+on\s+vaporize_next\.appointments\s+to\s+authenticated/i);
});
test('appointments cannot be queried without membership', async () => {
  let queried = false;
  const controller = { requireInternalAccess: async () => false };
  const supabase = { schema: () => { queried = true; } };
  await assert.rejects(listAppointments(supabase, controller), /Membership required/);
  assert.equal(queried, false);
});
test('appointments query uses verified organization and rejects stale access', async () => {
  const state = { recovering: false, internalAccess: true, organizations: [{ organization_id: 'org-1' }] };
  const controller = { requireInternalAccess: async () => true, state: () => state };
  const supabase = { schema(name) {
    assert.equal(name, 'vaporize_next');
    return { from(table) {
      assert.equal(table, 'appointments');
      return { select(fields) {
        assert.equal(fields, 'id,vehicle_id,starts_at,ends_at,status');
        return { eq(field, value) {
          assert.equal(field, 'organization_id'); assert.equal(value, 'org-1');
          return { order(field, opts) {
            assert.equal(field, 'starts_at'); assert.equal(opts.ascending, true);
            return { async limit(n) { assert.equal(n, 50); state.internalAccess = false; return { data: [], error: null }; } };
          } };
        } };
      } };
    } };
  } };
  await assert.rejects(listAppointments(supabase, controller), /Access changed/);
});

test('appointments reject records belonging to another organization', async () => {
  const state={recovering:false,internalAccess:true,organizations:[{organization_id:'org-1'}]};
  const controller={requireInternalAccess:async()=>true,state:()=>state};
  const query={eq(){return this},order(){return this},async limit(){return {data:[{id:'a',organization_id:'org-2',vehicle_id:'v',starts_at:'2026-10-30T10:00:00Z',ends_at:'2026-10-30T11:00:00Z',status:'scheduled'}],error:null}}};
  const supabase={schema(){return {from(){return {select(){return query}}}}}};
  await assert.rejects(listAppointments(supabase,controller),/Unexpected appointments response/);
});
