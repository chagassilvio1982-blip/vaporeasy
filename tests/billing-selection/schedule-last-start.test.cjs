"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("index.html","utf8");
test("ordinary slot options exclude starts later than 16:00",()=>{
 assert.ok(html.includes('const LAST_APPOINTMENT_START="16:00"'));
 assert.ok(html.includes('x.local_time<=LAST_APPOINTMENT_START'));
});
test("authorized manual override remains available after 16:00",()=>{
 assert.ok(html.includes('if(override){'));
 assert.ok(html.includes('time>LAST_APPOINTMENT_START&&!adminScheduleOverrideSelected()'));
 assert.ok(html.includes('apoverridereason'));
});
test("existing appointment time can be retained during edit",()=>{
 assert.ok(html.includes('currentApps.find(x=>x.id===id)?.starts_at?spDateTime('));
});

test("monthly agenda must not be filtered by slot-local time",()=>{
 const start=html.indexOf('const rows=r.data||[];',html.indexOf('agendaListLoadSeq'));
 assert.ok(start>=0,'monthly agenda must keep all returned rows');
 assert.ok(html.slice(start,start+150).includes('if(!rows.length)'));
 assert.ok(!html.slice(start,start+150).includes('LAST_APPOINTMENT_START'));
});
test("slot filter occurs inside available-slot loader",()=>{
 const start=html.indexOf('async function loadAvailableSlots');
 const end=html.indexOf('async function fillVehicles',start);
 assert.ok(start>=0&&end>start);
 assert.ok(html.slice(start,end).includes('x.local_time<=LAST_APPOINTMENT_START'));
});

test("slot regex accepts HH:MM and rejects malformed time",()=>{
 const start=html.indexOf('async function loadAvailableSlots');
 const end=html.indexOf('async function fillVehicles',start);
 const body=html.slice(start,end);
 const match=body.match(/\.filter\(x=>(\/\^[^\n]+?\$\/)\.test\(x\.local_time\)/);
 assert.ok(match,'slot filter must contain a time regular expression');
 const pattern=match[1].slice(1,-1);
 const re=new RegExp(pattern);
 assert.equal(re.test('16:00'),true);
 assert.equal(re.test('15:40'),true);
 assert.equal(re.test('invalid'),false);
});
