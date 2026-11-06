/* Testes locais sem Supabase: node tests/v2-recibos-antecipados.test.cjs */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'../v2-documento-misto-previa.js'),'utf8');
const ctx={window:{},document:{readyState:'loading',addEventListener(){}},Intl,Map,Set,console};
vm.runInNewContext(code,ctx,{filename:'v2-documento-misto-previa.js'});
const build=ctx.window.vpV2BuildConsolidatedPreviewModel;
assert.equal(typeof build,'function');
const cid='euripidio';
const report={
 maps:{vm:new Map([
 ['f',{brand:'Ferrari',model:'296 GTS'}],
 ['g',{brand:'Mercedes-Benz',model:'G63'}],
 ['p',{brand:'Porsche',model:'718 Cayman'}]
 ]),sm:new Map([['premium',{name:'Premium'}],['polimento',{name:'Polimento'}]])},
 packageMonthRows:[
 {id:'nov-f',client_id:cid,vehicle_id:'f',subscription_id:'sf',service_id:'premium',status:'pending',amount:780,competence_month:'2026-11-01'},
 {id:'nov-g',client_id:cid,vehicle_id:'g',subscription_id:'sg',service_id:'premium',status:'pending',amount:820,competence_month:'2026-11-01'}
 ],
 serviceApps:[{id:'pol-p',client_id:cid,vehicle_id:'p',service_id:'polimento',status:'completed',final_value:400,starts_at:'2026-11-04'}],
 monthApps:[],payMap:new Map(),subscriptionPlanById:new Map()
};
const rows=build(report,cid);
assert.equal(rows.length,3);
const packages=rows.filter(x=>x.kind==='Pacote');
assert.equal(packages.length,2);
assert.equal(packages.reduce((n,x)=>n+x.pending,0),1600);
assert.equal(packages.reduce((n,x)=>n+x.received,0),0);
assert.equal(rows.find(x=>x.vehicle.includes('Porsche')).kind,'Avulso / extra');
assert.equal(rows.filter(x=>x.vehicle.includes('Porsche')).length,1);
assert.equal(rows.filter(x=>x.kind==='Pacote'&&x.vehicle.includes('Porsche')).length,0);
assert.equal(build(report,'outro-cliente').length,0);
const selected=rows.filter(x=>!x.vehicle.includes('Porsche'));
assert.equal(selected.reduce((n,x)=>n+x.value,0),1600);
report.packageMonthRows[0].status='paid';
const afterPayment=build(report,cid);
assert.equal(afterPayment.find(x=>x.key==='package:nov-f').received,780);
assert.equal(afterPayment.find(x=>x.key==='package:nov-f').pending,0);
assert.equal(afterPayment.find(x=>x.key==='package:nov-g').pending,820);
assert.equal(report.serviceApps[0].final_value,400);
console.log('PASS: 11 verificações de modelo, seleção, antecipação e isolamento');
