"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const preview=fs.readFileSync("billing-selection-preview.js","utf8");
const html=fs.readFileSync("index.html","utf8");
test("preview never writes payment or charges",()=>{
  assert.doesNotMatch(preview,/\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(|\.rpc\s*\(/);
});
test("preview rechecks existing monthly document before export",()=>{
  assert.match(preview,/freshCharges,freshPayments,freshAppointments,existingDocument,freshSubscriptions/);
  assert.match(preview,/monthly_receipt_snapshots/);
  assert.match(preview,/existingDocument\.data/);
});
test("preview rechecks paid status and plan associations",()=>{
  assert.match(preview,/freshPayments\.data/);
  assert.match(preview,/freshSubscriptions\.data/);
  assert.match(preview,/Possível vínculo com plano/);
});
test("browser scripts are installed after main app initialization",()=>{
  const main=html.indexOf('boot();');
  const guard=html.indexOf('src="/billing-selection-guard.js');
  const previewIndex=html.indexOf('src="/billing-selection-preview.js');
  assert.ok(main>=0&&guard>main&&previewIndex>guard);
  assert.match(html,/installBillingSelection\(\)/);
});

test("preview uses São Paulo dates instead of UTC slicing",()=>{
  assert.match(preview,/timeZone:"America\/Sao_Paulo"/);
  assert.match(preview,/saoPauloDate\(latest\.starts_at\)/);
  assert.match(preview,/saoPauloDate\(a\.starts_at\)/);
});

test("each charge and appointment displays its vehicle",()=>{
 assert.match(preview,/sb\.from\("vehicles"\)\.select\("id,client_id,brand,model,plate"\)/);
 assert.match(preview,/Plano · "\+vehicleLabel\(c\.vehicle_id\)/);
 assert.match(preview,/Atendimento "\+saoPauloDate\(a\.starts_at\)\+" · "\+vehicleLabel\(a\.vehicle_id\)/);
 assert.match(preview,/label:"Mensalidade do plano · "\+vehicleLabel\(c\.vehicle_id\)/);
});

test("São Paulo date uses locale-independent ISO ordering",()=>{
 assert.match(preview,/\.formatToParts\(new Date\(iso\)\)/);
 assert.match(preview,/part\("year"\)\+"-"\+part\("month"\)\+"-"\+part\("day"\)/);
});

test("browser exposes the billing selection validator required by preview",()=>{
 const guard=fs.readFileSync("billing-selection-guard.js","utf8");
 assert.match(guard,/window\.validateBillingSelection = validateBillingSelection/);
 assert.match(preview,/validateBillingSelection\(chosen/);
});
