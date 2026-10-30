import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicle,updateVehicle,updateClient } from '../src/data/records-write.js';
const org='4eed149d-2907-4604-8d92-ecf212762664';
const client='ca21e0de-05e3-49f0-b0d5-8f3cb0010101';
const vehicle='cb21e0de-05e3-49f0-b0d5-8f3cb0010102';
function setup(role='owner') {
  const state={recovering:false,internalAccess:true,organizations:[{organization_id:org,membership_role:role}]};
  const controller={requireInternalAccess:async()=>true,state:()=>state};
  const calls=[];
  const query={
    eq(k,v){calls.push(['eq',k,v]);return this;},
    select(){return this;},
    async single(){return {data:{id:calls[0][0]==='insert'?vehicle:vehicle,organization_id:org,client_id:client},error:null}}
  };
  const supabase={schema(name){assert.equal(name,'vaporize_next');return {from(table){calls.push(['table',table]);return {
    insert(payload){calls.push(['insert',payload]);return query;},
    update(payload){calls.push(['update',payload]);return query;}
  };}}}};
  return {controller,supabase,calls,state};
}
test('vehicle create uses verified organization, ignoring forged tenant',async()=>{
  const x=setup();
  const result=await createVehicle(x.supabase,x.controller,{organization_id:'other',client_id:client,brand:' VW ',model:' Polo ',plate:''});
  assert.equal(result.organization_id,org);
  assert.deepEqual(x.calls[1][1],{organization_id:org,client_id:client,brand:'VW',model:'Polo',plate:null});
});
test('collaborator cannot write vehicle',async()=>{
  const x=setup('collaborator');
  await assert.rejects(createVehicle(x.supabase,x.controller,{client_id:client,brand:'VW',model:'Polo'}),/Owner or manager/);
  assert.equal(x.calls.length,0);
});
test('vehicle update rejects identity changes',async()=>{
  const x=setup();
  await assert.rejects(updateVehicle(x.supabase,x.controller,vehicle,{client_id:client}),/No editable fields/);
});
test('client update rejects empty name',async()=>{
  const x=setup();
  await assert.rejects(updateClient(x.supabase,x.controller,client,{name:' '}),/Invalid name/);
});
test('vehicle creation rejects malformed client id before write',async()=>{
  const x=setup();
  await assert.rejects(createVehicle(x.supabase,x.controller,{client_id:'wrong',brand:'VW',model:'Polo'}),/Invalid client ID/);
  assert.equal(x.calls.length,0);
});
