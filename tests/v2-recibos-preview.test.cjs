/**
 * Regressão da central de recibos V2 — nenhuma conexão externa.
 * Execute: node tests/v2-recibos-preview.test.cjs
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const js=read('v2-documento-misto-previa.js');
const nav=read('v2-recibos-atalhos.js');
const html=read('index.html');
const env={window:{},document:{readyState:'loading',addEventListener(){}}};
vm.runInNewContext(js,env,{timeout:1000});
const build=env.window.vpV2BuildConsolidatedPreviewModel;
let total=0;
function check(title,fn){fn();total++;console.log('PASS',title)}
function moneySum(rows,key){return rows.reduce((n,item)=>n+item[key],0)}
const client='client-a',other='client-b',vehicle='vehicle-a';
const maps={
  cm:new Map([[client,{name:'Cliente de teste'}],[other,{name:'Outro cliente'}]]),
  vm:new Map([[vehicle,{brand:'BMW',model:'X5'}],['vehicle-b',{brand:'Audi',model:'Q5'}],['vehicle-c',{brand:'VW',model:'T-Cross'}]]),
  sm:new Map([['plan-a',{name:'Premium'}],['plan-b',{name:'Essencial'}],['clean',{name:'Higienização'}]])
};
const base={
  keys:{month:'2026-10'},maps,
  packageMonthRows:[
    {id:'charge-a',client_id:client,vehicle_id:vehicle,service_id:'plan-a',subscription_id:'sub-a',status:'paid',amount:250},
    {id:'charge-b',client_id:client,vehicle_id:'vehicle-b',service_id:'plan-b',subscription_id:'sub-b',status:'paid',amount:300}
  ],
  serviceApps:[{id:'service-a',client_id:client,vehicle_id:'vehicle-c',service_id:'clean',final_value:150,starts_at:'2026-10-21',addon_value:10}],
  monthApps:[
    {id:'visit-a',client_id:client,vehicle_id:vehicle,recurring_plan_id:'plan-id-a',service_id:'plan-a',starts_at:'2026-10-05'},
    {id:'visit-b',client_id:client,vehicle_id:'vehicle-b',recurring_plan_id:'plan-id-b',service_id:'plan-b',starts_at:'2026-10-06'}
  ],
  subscriptionPlanById:new Map([['sub-a','plan-id-a'],['sub-b','plan-id-b']]),
  payMap:new Map()
};
function withChanges(fields){return Object.assign({},base,fields)}
const rows=build(base,client);
check('3 lançamentos para 3 veículos',()=>assert.equal(rows.length,3));
check('2 pacotes + 1 avulso',()=>assert.equal(rows.filter(x=>x.kind==='Pacote').length,2));
check('soma 700',()=>assert.equal(moneySum(rows,'value'),700));
check('recebidos 550',()=>assert.equal(moneySum(rows,'received'),550));
check('a receber 150',()=>assert.equal(moneySum(rows,'pending'),150));
check('visitas incluídas não geram cobrança',()=>assert(!rows.some(x=>x.key==='service:visit-a'||x.key==='service:visit-b')));
check('visita vinculada ao plano de fato',()=>assert(rows.find(x=>x.key==='package:charge-a').detail.includes('05/10/2026')));
check('identificador por origem e não nome',()=>assert(rows.some(x=>x.key==='service:service-a')&&rows.some(x=>x.key==='package:charge-a')));
check('outro plano no mesmo carro não mistura visitas',()=>{
  const more=withChanges({
    packageMonthRows:base.packageMonthRows.concat([{id:'charge-extra',client_id:client,vehicle_id:vehicle,service_id:'plan-b',subscription_id:'sub-extra',status:'pending',amount:100}]),
    monthApps:base.monthApps.concat([{id:'visit-extra',client_id:client,vehicle_id:vehicle,recurring_plan_id:'plan-id-extra',service_id:'plan-b',starts_at:'2026-10-22'}]),
    subscriptionPlanById:new Map([...base.subscriptionPlanById,['sub-extra','plan-id-extra']])
  });
  const a=build(more,client);
  assert(!a.find(x=>x.key==='package:charge-a').detail.includes('22/10/2026'));
  assert(a.find(x=>x.key==='package:charge-extra').detail.includes('22/10/2026'));
});
check('não inventa visitas sem relação confirmada',()=>{
  const changed=withChanges({subscriptionPlanById:new Map()});
  assert(build(changed,client).find(x=>x.key==='package:charge-a').detail.includes('Sem visitas vinculadas'));
});
check('coberto por ajuste não cobra valor novamente',()=>{
  const changed=withChanges({packageMonthRows:base.packageMonthRows.concat([{id:'covered',client_id:client,vehicle_id:vehicle,subscription_id:'sub-a',status:'covered',amount:400}])});
  assert.equal(build(changed,client).find(x=>x.key==='package:covered').value,0);
});
check('exclui mensalidade cancelada',()=>{
  const changed=withChanges({packageMonthRows:base.packageMonthRows.concat([{id:'cancelled',client_id:client,status:'cancelled',amount:5000}])});
  assert(!build(changed,client).some(x=>x.key==='package:cancelled'));
});
check('outro cliente isolado',()=>{
  const changed=withChanges({serviceApps:base.serviceApps.concat([{id:'alien',client_id:other,vehicle_id:vehicle,service_id:'clean',final_value:900}])});
  assert.equal(build(changed,client).length,3);
  assert.equal(build(changed,other).length,1);
});
check('pagamento registrado pago é respeitado',()=>{
  const changed=withChanges({payMap:new Map([['service-a',{status:'paid',amount:150}]])});
  const s=build(changed,client).find(x=>x.key==='service:service-a');
  assert.equal(s.received,150);assert.equal(s.pending,0);assert(!s.needsReview);
});
check('pagamento diferente do valor de serviço sinalizado',()=>{
  const changed=withChanges({payMap:new Map([['service-a',{status:'paid',amount:140}]])});
  const s=build(changed,client).find(x=>x.key==='service:service-a');
  assert.equal(s.received,140);assert.equal(s.value,140);assert.equal(s.needsReview,true);
});
check('pagamento sem valor não é presumido',()=>{
  const changed=withChanges({payMap:new Map([['service-a',{status:'paid',amount:null}]])});
  const s=build(changed,client).find(x=>x.key==='service:service-a');
  assert.equal(s.received,0);assert.equal(s.needsReview,true);
});
check('sem criação automática de mensalidades no preview',()=>assert(!html.includes('sb.rpc("ensure_current_package_charges")')));
check('competência diferente é bloqueada antes de abrir',()=>assert(js.includes('r.keys.month!==month')));
check('exportação bloqueada para dados inconsistentes',()=>assert(js.includes('snapshot().some(function(row){return row.needsReview})')));
check('sem mutação de dados via nova prévia',()=>assert(!/\bsb\.from\(|\bsb\.rpc\(|\bfetch\(/.test(js)));
check('módulos incluídos no HTML',()=>{
  assert(html.includes('src="./v2-documento-misto-previa.js?v=20261106"'));
  assert(html.includes('src="./v2-recibos-atalhos.js?v=20261106"'));
});
check('scripts válidos',()=>{new Function(js);new Function(nav)});
console.log('TOTAL',total,'verificações aprovadas.');
