import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthController} from '../src/auth/controller.js';
test('membership recheck does not publish transient revoked access',async()=>{
 const org={organization_id:'4eed149d-2907-4604-8d92-ecf212762664',organization_name:'Homologacao',membership_role:'owner'};
 const supabase={auth:{getUser:async()=>({data:{user:{id:'test-user'}},error:null})},rpc:async()=>({data:[org],error:null})};
 const controller=createAuthController(supabase);
 assert.equal(await controller.requireInternalAccess(),true);
 const states=[];
 controller.subscribe(state=>states.push(state.internalAccess));
 assert.equal(await controller.requireInternalAccess(),true);
 assert.deepEqual(states,[true,true]);
});
test('failed membership recheck revokes verified access',async()=>{
 const org={organization_id:'4eed149d-2907-4604-8d92-ecf212762664',organization_name:'Homologacao',membership_role:'owner'};
 let valid=true;
 const supabase={auth:{getUser:async()=>valid?({data:{user:{id:'test-user'}},error:null}):({data:{user:null},error:new Error('revoked')})},rpc:async()=>({data:[org],error:null})};
 const controller=createAuthController(supabase);
 assert.equal(await controller.requireInternalAccess(),true);
 valid=false;
 assert.equal(await controller.requireInternalAccess(),false);
 assert.equal(controller.state().internalAccess,false);
});
