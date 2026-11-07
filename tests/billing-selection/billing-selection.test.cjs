"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {billingCoverage,validateBillingSelection}=require("../../billing-selection-guard.cjs");
const ap={id:"a1",client_id:"c1",vehicle_id:"v1",service_id:"s1",recurring_plan_id:"r1",starts_at:"2026-11-06T10:00:00"};
const sub={id:"p1",client_id:"c1",vehicle_id:"v1",service_id:"s1",recurring_plan_id:"r1",starts_on:"2026-10-01"};
const charge={id:"ch1",subscription_id:"p1",competence_month:"2026-11-01",status:"pending"};
test("plan-covered service is informational, not billable",()=>assert.deepEqual(billingCoverage(ap,[sub],[charge],"2026-11"),{kind:"included_in_plan",billable:false}));
test("paid plan also covers appointment",()=>assert.equal(billingCoverage(ap,[sub],[{...charge,status:"paid"}],"2026-11").kind,"included_in_plan"));
test("recurrence without monthly charge requires review",()=>assert.equal(billingCoverage(ap,[sub],[],"2026-11").kind,"review_required"));
test("another vehicle does not cover service",()=>assert.equal(billingCoverage(ap,[{...sub,vehicle_id:"v2"}],[charge],"2026-11").kind,"review_required"));
test("another month does not cover service",()=>assert.equal(billingCoverage(ap,[sub],[{...charge,competence_month:"2026-10-01"}],"2026-11").kind,"review_required"));
test("cancelled charge does not cover service",()=>assert.equal(billingCoverage(ap,[sub],[{...charge,status:"cancelled"}],"2026-11").kind,"review_required"));
test("out of period cannot be billed",()=>assert.equal(billingCoverage(ap,[sub],[charge],"2026-10").kind,"out_of_period"));
test("selected monthly and extra amounts add up",()=>assert.equal(validateBillingSelection([{kind:"package_charge",id:"p1",amount:780,status:"pending"},{kind:"appointment_extra",id:"e1",amount:1500,status:"pending",coverage_verified:true}]),2280));
test("duplicate item is rejected",()=>assert.throws(()=>validateBillingSelection([{kind:"package_charge",id:"p1",amount:780},{kind:"package_charge",id:"p1",amount:780}]),/duplicado/));
test("paid and cancelled items are rejected",()=>{for(const status of ["paid","cancelled"])assert.throws(()=>validateBillingSelection([{kind:"package_charge",id:"p1",amount:780,status}]),/indisponível/);});
test("included service cannot be billed again",()=>assert.throws(()=>validateBillingSelection([{kind:"appointment_extra",id:"a1",amount:150,covered_by_plan:true,coverage_verified:true}]),/indisponível/));
test("invalid values are rejected",()=>{for(const amount of [-1,NaN,Infinity])assert.throws(()=>validateBillingSelection([{kind:"appointment_extra",id:"a1",amount,coverage_verified:true}]),/inválido/);});
test("unverified extra is blocked",()=>assert.throws(()=>validateBillingSelection([{kind:"appointment_extra",id:"e1",amount:150}]),/não verificada/));
test("client and month mismatch blocked",()=>{const ctx={client_id:"c1",competence:"2026-11"};assert.throws(()=>validateBillingSelection([{kind:"package_charge",id:"p1",amount:780,client_id:"c2",competence_month:"2026-11-01"}],ctx),/Cliente divergente/);assert.throws(()=>validateBillingSelection([{kind:"package_charge",id:"p1",amount:780,client_id:"c1",competence_month:"2026-10-01"}],ctx),/Competência divergente/);});

test("competence uses Sao Paulo local month at UTC rollover",()=>{
 const nearMidnight={...ap,starts_at:"2026-11-01T01:30:00Z"};
 const octoberCharge={...charge,competence_month:"2026-10-01"};
 assert.equal(billingCoverage(nearMidnight,[sub],[octoberCharge],"2026-10").kind,"included_in_plan");
 assert.equal(billingCoverage(nearMidnight,[sub],[charge],"2026-11").kind,"out_of_period");
});

test("subscription starting after appointment does not cover earlier service",()=>{
 const late={...sub,starts_on:"2026-11-20"};
 assert.equal(billingCoverage(ap,[late],[{...charge,subscription_id:late.id}],"2026-11").kind,"review_required");
});
test("subscription superseded before appointment does not cover later service",()=>{
 const ended={...sub,superseded_at:"2026-11-03T12:00:00Z"};
 assert.equal(billingCoverage(ap,[ended],[charge],"2026-11").kind,"review_required");
});
