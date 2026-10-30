import test from 'node:test';
import assert from 'node:assert/strict';
import { listClients } from '../src/data/clients.js';

const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const active=()=>({recovering:false,internalAccess:true,organizations:[{organization_id:org}]});
function setup(rows=[]) {
  let state=active(),queries=0,filter=null,limit=null;
  const controller={requireInternalAccess:async()=>true,state:()=>state};
  const supabase={schema(name){
    assert.equal(name,'vaporize_next');
    return {from(table){
      assert.equal(table,'clients');
      return {select(columns){
        assert.equal(columns,'id,name,phone,created_at');
        return {eq(field,value){
          filter=[field,value];
          return {order(field,opts){
            assert.equal(field,'created_at');
            assert.equal(opts.ascending,false);
            return {limit(n){
              limit=n;queries++;
              return Promise.resolve({data:rows,error:null});
            }};
          }};
        }};
      }};
    }};
  }};
  return {controller,supabase,setState:s=>{state=s;},get calls(){return {queries,filter,limit};}};
}
test('read is filtered by authenticated organization',async()=>{
  const f=setup([{id:'id-1',name:'Cliente'}]);
  assert.equal((await listClients(f.supabase,f.controller)).length,1);
  assert.deepEqual(f.calls,{queries:1,filter:['organization_id',org],limit:50});
});
test('invalid page sizes fail before query',async()=>{
  const f=setup();
  for(const n of [0,-1,101,1.5,NaN,'50']) await assert.rejects(listClients(f.supabase,f.controller,n),RangeError);
  assert.equal(f.calls.queries,0);
});
test('recovery state blocks client read',async()=>{
  const f=setup();
  f.setState({...active(),recovering:true});
  await assert.rejects(listClients(f.supabase,f.controller),/single active organization/);
  assert.equal(f.calls.queries,0);
});
test('multiple organizations fail closed',async()=>{
  const f=setup();
  f.setState({...active(),organizations:[{organization_id:org},{organization_id:'other'}]});
  await assert.rejects(listClients(f.supabase,f.controller),/single active organization/);
  assert.equal(f.calls.queries,0);
});
test('unexpected server response is rejected',async()=>{
  const f=setup([{id:123,name:'Cliente'}]);
  await assert.rejects(listClients(f.supabase,f.controller),/Unexpected clients response/);
});
