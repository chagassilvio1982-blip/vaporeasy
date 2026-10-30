import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecurringAppointments } from '../src/data/appointments-write.js';
import { saoPauloRecurrence } from '../src/scheduling/rules.js';

const org='4eed149d-2907-4604-8d92-ecf212762664';
const vehicle='ca21e0de-05e3-49f0-b0d5-8f3cb0010101';
const occurrences=saoPauloRecurrence('2026-11-02T07:30',{count:3,intervalDays:7});
function harness(role='owner', databaseError=null) {
  const calls=[];
  const controller={
    requireInternalAccess:async()=>true,
    state:()=>({recovering:false,internalAccess:true,organizations:[{organization_id:org,membership_role:role}]})
  };
  const supabase={schema(schema) {
    assert.equal(schema,'vaporize_next');
    return {from(table) {
      assert.equal(table,'appointments');
      return {insert(rows) {
        calls.push(rows);
        return {select:async()=>databaseError
          ? {data:null,error:databaseError}
          : {data:rows.map((row,i)=>({...row,id:String(i)})),error:null}};
      }};
    }};
  }};
  return {supabase,controller,calls};
}
test('recurring appointments are sent in one atomic database insert',async()=>{
  const h=harness();
  const data=await createRecurringAppointments(h.supabase,h.controller,{vehicle_id:vehicle,occurrences});
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].length,3);
  assert.equal(data.length,3);
  assert.ok(h.calls[0].every(row=>row.organization_id===org && row.vehicle_id===vehicle && row.status==='scheduled'));
});
test('collaborator cannot insert recurring appointments',async()=>{
  const h=harness('collaborator');
  await assert.rejects(createRecurringAppointments(h.supabase,h.controller,{vehicle_id:vehicle,occurrences}),/Insufficient role/);
  assert.equal(h.calls.length,0);
});
test('database exclusion conflict is propagated',async()=>{
  const h=harness('owner',{code:'23P01',message:'conflicting key'});
  await assert.rejects(createRecurringAppointments(h.supabase,h.controller,{vehicle_id:vehicle,occurrences}),e=>e.code==='23P01');
  assert.equal(h.calls.length,1);
});
test('invalid recurrence cannot write',async()=>{
  const h=harness();
  await assert.rejects(createRecurringAppointments(h.supabase,h.controller,{vehicle_id:vehicle,occurrences:[]}),RangeError);
  assert.equal(h.calls.length,0);
});
