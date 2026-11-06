/* Regressão estática dos bloqueios P0: node tests/v2-auditoria-guardas.test.cjs */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function body(start,end){
 const i=code.indexOf(start),j=code.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'função ausente: '+start);
 return code.slice(i,j);
}
const grouped=body('async function getReceiptGroupData(ids){','function groupReceiptVehicleGroups(g){');
assert.match(grouped,/items\.some\(d=>d\.x\?\.recurring_plan_id\)/,'agrupar visitas de planos deve bloquear');
assert.ok(grouped.indexOf('recurring_plan_id')<grouped.indexOf('const total=items.reduce'),'bloqueio deve preceder soma');
const monthly=body('async function getMonthlyClientReceiptData(clientId,month){','function monthlyServiceSummary(v){');
assert.match(monthly,/recurring_plan_id/,'consulta mensal deve trazer vinculo ao plano');
assert.match(monthly,/apps\.some\(a=>a\.recurring_plan_id\)/,'documento mensal deve recusar visitas de plano');
assert.ok(monthly.indexOf('apps.some(a=>a.recurring_plan_id)')<monthly.indexOf('let total=0'),'bloqueio deve preceder soma');
console.log('PASS: guardas de cobrança duplicada no agrupamento e documento mensal');
