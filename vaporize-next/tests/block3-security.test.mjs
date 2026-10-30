import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url),'utf8');
test('block 3 restricts authenticated UPDATE to business columns',()=>{
 const sql=read('../supabase/migrations/0006_block3_column_grants.sql');
 assert.match(sql,/revoke update on vaporize_next\.vehicles from authenticated/i);
 assert.match(sql,/revoke update on vaporize_next\.clients from authenticated/i);
 assert.match(sql,/grant update \(brand, model, plate\) on vaporize_next\.vehicles to authenticated/i);
 assert.match(sql,/grant update \(name, phone\) on vaporize_next\.clients to authenticated/i);
 assert.doesNotMatch(sql,/grant update \(organization_id|grant update \(client_id/i);
});
test('block 3 write RLS restricts writes to owner/manager policy',()=>{
 const sql=read('../supabase/migrations/0005_block3_writes.sql');
 assert.match(sql,/next_vehicles_insert_owner_manager/);
 assert.match(sql,/next_vehicles_update_owner_manager/);
 assert.match(sql,/next_clients_update_owner_manager/);
 assert.match(sql,/vaporize_next\.can_manage_clients\(organization_id\)/);
});
test('client and vehicle forms stay inside authenticated workspace',()=>{
 const html=read('../index.html');
 const start=html.indexOf('id="workspace" hidden');
 const end=html.indexOf('</section>',start);
 assert.ok(start>=0 && end>start);
 for(const id of ['client-create-form','client-edit-form','vehicle-create-form','vehicle-edit-form']){
   const position=html.indexOf('id="'+id+'" hidden');
   assert.ok(position>start && position<end,id);
 }
});
