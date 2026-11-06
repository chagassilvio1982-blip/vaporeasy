"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("index.html","utf8");
test("ordinary slot options exclude starts later than 16:00",()=>{
 assert.match(html,/const LAST_APPOINTMENT_START="16:00"/);
 assert.match(html,/\.filter\(x=>\/\^\\d\{2\}:\\d\{2\}\$\/\.test\(x\.local_time\)&&x\.local_time<=LAST_APPOINTMENT_START\)/);
});
test("authorized manual override remains available after 16:00",()=>{
 assert.match(html,/if\(override\)\{/);
 assert.match(html,/adminScheduleOverrideSelected\(\)/);
 assert.match(html,/time>LAST_APPOINTMENT_START&&!adminScheduleOverrideSelected\(\)/);
 assert.match(html,/apoverridereason/);
});
test("existing appointment time can be retained during edit",()=>{
 assert.match(html,/time!==spDateTime\(currentApps\.find\(x=>x\.id===id\)\?\.starts_at/);
});
