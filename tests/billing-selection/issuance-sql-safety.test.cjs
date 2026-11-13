"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const sql=fs.readFileSync("migrations/20261106_selected_monthly_receipt_DRAFT.sql","utf8");
test("server validates actor and serializes client/month issuance",()=>{
 assert.match(sql,/private\.current_app_role\(\) not in \('owner','admin'\)/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/Monthly receipt already issued/);
});
test("server recalculates amounts and records only verified line fields",()=>{
 assert.match(sql,/v_amount := v_charge\.amount/);
 assert.match(sql,/coalesce\(v_correction\.corrected_final_value,v_appointment\.final_value\)/);
 assert.match(sql,/v_verified_lines := v_verified_lines/);
 assert.match(sql,/'lines',v_verified_lines/);
 assert.doesNotMatch(sql,/'lines',p_lines/);
});
test("server rejects paid items and plan-linked appointments",()=>{
 assert.match(sql,/v_charge\.status is distinct from 'pending'/);
 assert.match(sql,/status='paid'/);
 assert.match(sql,/public\.package_subscriptions/);
 assert.match(sql,/replacement\.replaces_subscription_id=s\.id/);
 assert.match(sql,/replacement\.scheduled_effective_on <=/);
 assert.match(sql,/v_correction\.classification is distinct from 'avulso'/);
});
test("server stores immutable client, vehicle and service labels",()=>{
 assert.match(sql,/\'schema_version\',3/);
 assert.match(sql,/\'client_name\',v_client_name/);
 assert.match(sql,/\'vehicle_label\',v_vehicle_label/);
 assert.match(sql,/\'service_label\',v_service_label/);
 assert.match(sql,/Package charge subscription does not match client, vehicle and service/);
 assert.match(sql,/v_correction\.client_id is distinct from v_appointment\.client_id/);
 assert.match(sql,/public\.vehicles where id=v_vehicle_id and client_id=p_client_id/);
});
test("server uses São Paulo month boundaries and no payment writes",()=>{
 assert.match(sql,/America\/Sao_Paulo/);
 assert.doesNotMatch(sql,/update\s+public\.appointment_payments/i);
 assert.doesNotMatch(sql,/update\s+public\.package_charges/i);
});
