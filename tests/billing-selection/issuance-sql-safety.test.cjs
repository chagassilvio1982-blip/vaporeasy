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
 assert.match(sql,/v_correction\.classification is distinct from 'avulso'/);
});
test("server uses São Paulo month boundaries and no payment writes",()=>{
 assert.match(sql,/America\/Sao_Paulo/);
 assert.doesNotMatch(sql,/update\s+public\.appointment_payments/i);
 assert.doesNotMatch(sql,/update\s+public\.package_charges/i);
});
