import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/data/clients.js';

const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(role='owner') {
  let current = { recovering:false, internalAccess:true, organizations:[{organization_id:org,membership_role:role}] };
  const calls = [];
  const controller = { requireInternalAccess:async()=>true, state:()=>current };
  const supabase = { schema(schema) {
    assert.equal(schema,'vaporize_next');
    return { from(table) {
      assert.equal(table,'clients');
      return { insert(payload) {
        calls.push(payload);
        return { select(columns) {
          assert.equal(columns,'id,name,phone,created_at');
          return { single:async()=>({data:{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:payload.name,phone:payload.phone},error:null}) };
        }};
      }};
    }};
  }};
  return {supabase,controller,calls,setState:next=>{current=next;}};
}

test('owner creates client scoped to server-backed organization',async()=>{
  const f=fixture();
  const result=await createClient(f.supabase,f.controller,{name:'  Cliente Teste  ',phone:'  11999999999  ',organization_id:'attacker'});
  assert.equal(result.name,'Cliente Teste');
  assert.deepEqual(f.calls,[{organization_id:org,name:'Cliente Teste',phone:'11999999999'}]);
});

test('manager can create client',async()=>{
  const f=fixture('manager');
  await createClient(f.supabase,f.controller,{name:'Cliente Teste'});
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].phone,null);
});

test('collaborator is denied without database write',async()=>{
  const f=fixture('collaborator');
  await assert.rejects(createClient(f.supabase,f.controller,{name:'Cliente Teste'}),/owner or manager/);
  assert.equal(f.calls.length,0);
});

test('invalid input never writes',async()=>{
  const f=fixture();
  for(const input of [null,[],{name:'A'},{name:' '.repeat(3)},{name:'Cliente',phone:123},{name:'Cliente',phone:'1'.repeat(41)}]) {
    await assert.rejects(createClient(f.supabase,f.controller,input));
  }
  assert.equal(f.calls.length,0);
});

test('recovery mode is denied',async()=>{
  const f=fixture();
  f.setState({recovering:true,internalAccess:true,organizations:[{organization_id:org,membership_role:'owner'}]});
  await assert.rejects(createClient(f.supabase,f.controller,{name:'Cliente Teste'}),/single active organization/);
  assert.equal(f.calls.length,0);
});

test('membership revocation before write is denied',async()=>{
  const f=fixture();
  let count=0;
  f.controller.state=()=>{
    count++;
    return count===1
      ? {recovering:false,internalAccess:true,organizations:[{organization_id:org,membership_role:'owner'}]}
      : {recovering:false,internalAccess:false,organizations:[]};
  };
  await assert.rejects(createClient(f.supabase,f.controller,{name:'Cliente Teste'}),/Access changed before write/);
  assert.equal(f.calls.length,0);
});

test('organization change after write rejects returned result',async()=>{
  const f=fixture();
  let count=0;
  f.controller.state=()=>{
    count++;
    return count<3
      ? {recovering:false,internalAccess:true,organizations:[{organization_id:org,membership_role:'owner'}]}
      : {recovering:false,internalAccess:true,organizations:[{organization_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',membership_role:'owner'}]};
  };
  await assert.rejects(createClient(f.supabase,f.controller,{name:'Cliente Teste'}),/Access changed during request/);
  assert.equal(f.calls.length,1);
});
