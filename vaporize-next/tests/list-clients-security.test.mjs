import test from 'node:test';
import assert from 'node:assert/strict';
import { listClients } from '../src/data/clients.js';

const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const membership = id => ({ organization_id:id, membership_role:'owner' });
function fixture(rows = []) {
  let current = { recovering:false, internalAccess:true, organizations:[membership(orgA)] };
  let calls = 0;
  const controller = { requireInternalAccess:async()=>true, state:()=>current };
  const supabase = { schema(schema) {
    assert.equal(schema,'vaporize_next');
    return { from(table) {
      assert.equal(table,'clients');
      return { select(columns) {
        assert.equal(columns,'id,organization_id,name,phone,created_at');
        return { eq(field,id) {
          calls++;
          assert.equal(field,'organization_id');
          assert.equal(id,orgA);
          return { order(field,opts) {
            assert.equal(field,'created_at');
            assert.deepEqual(opts,{ascending:false});
            return { limit:async size=>{assert.ok(size>=1&&size<=100);return {data:rows,error:null};} };
          }};
        }};
      }};
    }};
  }};
  return {controller,supabase,setState:s=>{current=s;},calls:()=>calls};
}

test('lists only rows from authenticated organization',async()=>{
  const f=fixture([{id:'1',organization_id:orgA,name:'Synthetic'}]);
  assert.equal((await listClients(f.supabase,f.controller)).length,1);
  assert.equal(f.calls(),1);
});

test('rejects cross-tenant response even if server returned it',async()=>{
  const f=fixture([{id:'1',organization_id:orgB,name:'Synthetic'}]);
  await assert.rejects(listClients(f.supabase,f.controller),/Unexpected clients response/);
});

test('rejects access in recovery mode before database request',async()=>{
  const f=fixture();
  f.setState({recovering:true,internalAccess:false,organizations:[]});
  await assert.rejects(listClients(f.supabase,f.controller),/single active organization/);
  assert.equal(f.calls(),0);
});

test('rejects access if membership is revoked during request',async()=>{
  const f=fixture([{id:'1',organization_id:orgA,name:'Synthetic'}]);
  let count=0;
  f.controller.state=()=> ++count===1
    ? {recovering:false,internalAccess:true,organizations:[membership(orgA)]}
    : {recovering:false,internalAccess:false,organizations:[]};
  await assert.rejects(listClients(f.supabase,f.controller),/Access changed during request/);
});

test('rejects invalid page sizes before accessing database',async()=>{
  const f=fixture();
  for(const size of [0,-1,1.5,101,NaN,'50']) {
    await assert.rejects(listClients(f.supabase,f.controller,size),RangeError);
  }
  assert.equal(f.calls(),0);
});
