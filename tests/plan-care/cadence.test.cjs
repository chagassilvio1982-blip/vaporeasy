const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const rhythm=require('../../plan-care-rhythm.js');
const uiSource=fs.readFileSync(path.resolve(__dirname,'../../plan-care-ui.js'),'utf8');
const view={VaporeasyCareRhythm:rhythm};
const catalog=new Function('window','today',uiSource+'\nreturn window.VaporeasyCareUI;')(view,()=> '2026-10-14');
const rule=(kind,min,max,label='Proteção hidrorrepelente do para-brisa')=>({
 label,frequency:kind,min_days:min,max_days:max,monthly_quantity:1
});
const performed=(d,label='Proteção hidrorrepelente do para-brisa')=>[{date:d,label}];
const state=(rule,events,when='2026-10-14')=>rhythm.evaluate([rule],events,[],when)[0];
test('janela de hidrorrepelente 60–90 dias, incluindo mês anterior',()=>{
 assert.equal(state(rule('interval_days',60,90),performed('2026-08-30')).status,'ok');
 assert.equal(state(rule('interval_days',60,90),performed('2026-08-15')).status,'due');
 assert.equal(state(rule('interval_days',60,90),performed('2026-07-15')).status,'due');
 assert.match(state(rule('interval_days',60,90),performed('2026-07-15')).why,/ultrapassado/);
});
test('sem histórico não declara falsamente que benefício foi feito ou está vencido',()=>{
 const x=state(rule('interval_days',60,90),[]);
 assert.equal(x.status,'check');
 assert.match(x.why,/Primeira aplicação/);
});
test('grafeno mensal reinicia somente o controle da competência',()=>{
 const label='Selante com grafeno da pintura';
 const def=rule('monthly',null,null,label);
 assert.equal(state(def,performed('2026-09-30',label)).status,'due');
 assert.equal(state(def,performed('2026-10-02',label)).status,'done');
});
test('hidratação do couro 60 dias não confunde serviços',()=>{
 const def=rule('interval_days',60,60,'Hidratação do couro');
 assert.equal(state(def,performed('2026-09-01','Hidratação do couro')).status,'ok');
 assert.equal(state(def,performed('2026-08-15','Hidratação do couro')).status,'due');
 assert.equal(state(def,performed('2026-08-15','Hidrorrepelente')).status,'check');
});
test('enceramento alternado a cada duas estéticas só vence quando o ciclo é comprovado',()=>{
 const def={label:'Enceramento alternado',frequency:'every_n_visits',every_n_visits:2};
 const ev=[{date:'2026-10-01',label:'Enceramento alternado'}];
 const one=[{date:'2026-10-09'}];
 assert.equal(rhythm.evaluate([def],ev,one,'2026-10-14')[0].status,'due');
 assert.equal(rhythm.evaluate([def],ev,[],'2026-10-14')[0].status,'ok');
 assert.equal(rhythm.evaluate([def],[],one,'2026-10-14')[0].status,'check');
});
test('ficha do técnico destaca fazer hoje, anterior, em dia, sem HTML não confiável',()=>{
 const d={
  is_plan:true,plan_name:'Pacote Premium',visit_date:'2026-10-14',
  benefits:[rule('interval_days',60,90),rule('monthly',null,null,'Selante com grafeno da pintura')],
  care_history:performed('2026-08-15').concat(performed('2026-10-01','Selante com grafeno da pintura')),
  visit_history:[{date:'2026-10-01'},{date:'2026-08-15'}],
  appointment_notes:'<script>alert(1)</script>',vehicle_notes:'Bancos de couro'
 };
 const h=catalog.brief(d,false);
 assert.match(h,/FAZER NESTA ESTÉTICA/);
 assert.match(h,/ESTÉTICA ANTERIOR/);
 assert.match(h,/JÁ REALIZADO \/ DENTRO DO PRAZO/);
 assert.match(h,/Plano Premium/);
 assert.doesNotMatch(h,/<script>/);
 assert.match(h,/&lt;script&gt;/);
 assert.match(h,/Bancos de couro/);
});
test('dados financeiros e padrões globais não viram automaticamente benefícios do cliente',()=>{
 const d={is_plan:true,plan_name:'Plano Premium',visit_date:'2026-10-14',
 benefits:[],care_history:[],visit_history:[],vehicle_notes:''};
 const h=catalog.brief(d,true);
 assert.match(h,/Nenhum cuidado adicional foi confirmado/);
 assert.doesNotMatch(h,/\d{3},\d{2}|R\$/);
});
test('as páginas carregam os módulos e ocultam o antigo formulário duplicado',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
 const plan=fs.readFileSync(path.resolve(__dirname,'../../plan-control.js'),'utf8');
 assert.match(html,/src="\/plan-care-rhythm\.js/);
 assert.match(html,/src="\/plan-care-ui\.js/);
 assert.match(html,/href="\/plan-care\.css/);
 assert.match(plan,/el\('pc-define'\)\.classList\.add\('hidden'\)/);
 assert.match(plan,/window\.VaporeasyCareUI\.brief/);
 assert.match(plan,/\.rpc\('appointment_care_brief'/);
});
