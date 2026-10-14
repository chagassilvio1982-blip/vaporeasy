const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function cardIn(source,startText,stopText,context,x){
  const start=html.indexOf(startText,html.indexOf(source));
  const end=html.indexOf(stopText,start);
  assert.ok(start>=0&&end>start,'Função de cartão não encontrada');
  const cardCode=html.slice(start,end);
  return new Function(...Object.keys(context),'x',cardCode+'\nreturn card(x)')(...Object.values(context),x);
}
function managerCard(status,notes='Cuidado com bancos <del>'){
 const ctx={
  clientMap:new Map([['c',{name:'Cézar'}]]),
  vehicleMap:new Map([['v',{brand:'Porsche',model:'Cayenne'}]]),
  serviceMap:new Map([['s',{name:'Estética'}]]),
  collabMap:new Map(),teamMap:new Map(),paymentMap:new Map(),
  findVehicleLocal:()=>null,teamDisplay:()=>'',financeAllowed:()=>false,
  esc:escape,money:String,apRange:()=> '10:00–11:30',statusLabel:x=>x,
  window:{__v2PackagePlanIds:new Set()}
 };
 return cardIn('async function loadApps()', '  const card=x=>{','  let out=activeRows',ctx,{
  id:'a1',client_id:'c',vehicle_id:'v',service_id:'s',status,notes,source:'manual',
  starts_at:'2026-10-14T10:00:00-03:00'
 });
}
test('botões principais são visíveis e únicos nos estados operacionais',()=>{
 const cases=[
  ['requested','data-st="confirmed"','Aceitar solicitação'],
  ['scheduled','data-st="in_progress"','Iniciar'],
  ['confirmed','data-st="in_progress"','Iniciar'],
  ['in_progress','data-finish="a1"','Concluir serviço']
 ];
 for(const [status,action,label] of cases){
  const body=managerCard(status);
  assert.ok(body.includes('class="agenda-quick-actions"'),status);
  assert.ok(body.includes(action),status);
  assert.ok(body.includes(label),status);
  assert.equal(body.split(action).length-1,1,'Ação duplicada: '+status);
  assert.ok(body.indexOf('agenda-quick-actions')<body.indexOf('appt-actions'));
 }
});
test('nenhuma ação rápida é oferecida para concluído ou cancelado',()=>{
 for(const status of ['completed','cancelled']){
  assert.doesNotMatch(managerCard(status),/class="agenda-quick-actions"/);
 }
});
test('observações visíveis são escapadas e valores financeiros não são exibidos',()=>{
 const body=managerCard('scheduled');
 assert.match(body,/Observações:/);
 assert.ok(body.includes('Cuidado com bancos &lt;del&gt;'));
 assert.ok(!body.includes('Cuidado com bancos <del>'));
 assert.doesNotMatch(body,/R\$\s*\d/);
});
test('operador enxerga observações sem expandir e mantém cuidados por atendimento',()=>{
 const ctx={isToday:true,esc:escape,apRange:()=> '09:00–10:30',statusLabel:x=>x};
 const body=cardIn('async function loadOperatorJobs(','  const card=x=>{','  let out=active.length',ctx,{
  id:'op1',status:'scheduled',client_name:'Cliente',vehicle_label:'BMW',
  service_name:'Estética',notes:'Não molhar painel <script>'
 });
 assert.match(body,/class="operator-notes-open"/);
 assert.doesNotMatch(body,/class="operator-notes"><summary>/);
 assert.match(body,/Não molhar painel &lt;script&gt;/);
 assert.match(body,/data-care-job="op1"/);
 assert.match(body,/data-op-start="op1"/);
});
test('ações rápidas preservam fluxos atuais sem escrita adicional',()=>{
 const index=html.slice(html.indexOf('async function loadApps()'));
 assert.match(index,/data-finish/);
 assert.match(index,/openCompletion\(b\.dataset\.finish\)/);
 assert.match(index,/data-st/);
 assert.doesNotMatch(index,/function agendaQuickDirectPayment/);
});

test('observações do atendimento aparecem uma única vez no cartão do operador',()=>{
 const plan=fs.readFileSync(path.resolve(__dirname,'../../plan-control.js'),'utf8');
 const start=plan.indexOf('function briefHtml(d,hideAppointmentNotes=false){');
 const end=plan.indexOf('window.renderQuickPlanCare=',start);
 assert.ok(start>=0&&end>start);
 const code=plan.slice(start,end);
 const make=new Function('esc','briefDate','operationalBenefitLines','d','hide',
  code+'\nreturn briefHtml(d,hide)');
 const d={is_plan:false,recent_visits:[],appointment_notes:'Porta sensível',vehicle_notes:'Proteção delicada'};
 const compact=make(escape,x=>x,()=>{},d,true);
 const expanded=make(escape,x=>x,()=>{},d,false);
 assert.doesNotMatch(compact,/Porta sensível/);
 assert.match(compact,/Proteção delicada/);
 assert.match(expanded,/Porta sensível/);
 assert.match(plan,/node\.closest\('\.operator-job'\)/);
});
