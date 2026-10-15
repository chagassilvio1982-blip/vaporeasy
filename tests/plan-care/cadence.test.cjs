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
  is_plan:true,plan_name:'Pacote Premium',visit_date:'2026-10-14',appointment_id:'appt-20261014',
  benefits:[rule('interval_days',60,90),rule('monthly',null,null,'Selante com grafeno da pintura')],
  care_history:performed('2026-08-15').concat(performed('2026-10-01','Selante com grafeno da pintura')),
  visit_history:[{date:'2026-10-01'},{date:'2026-08-15'}],
  appointment_notes:'<script>alert(1)</script>',vehicle_notes:'Bancos de couro'
 };
 const h=catalog.brief(d,false);
 assert.match(h,/FAZER NESTA ESTÉTICA/);
 assert.match(h,/ESTÉTICA ANTERIOR/);
 assert.match(h,/JÁ REALIZADOS/);
 assert.match(h,/PRÓXIMOS CUIDADOS/);
 assert.match(h,/Próxima previsão: 14\/10\/2026/);
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

test('hidrorrepelente histórico é reconhecido mesmo com nome antigo no registro',()=>{
 const d=rule('interval_days',60,90,'Proteção hidrorrepelente do para-brisa');
 const r=state(d,performed('2026-08-15','Aplicação de hidrorrepelente'));
 assert.equal(r.status,'due');
 assert.equal(r.lastDate,'2026-08-15');
 const unrelated=state(d,performed('2026-08-15','Hidratação do couro'));
 assert.equal(unrelated.status,'check');
});

test('detalhes da visita usam histórico completo em vez de contagem mensal de benefícios',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../../plan-control.js'),'utf8');
 const start=source.indexOf('window.renderPlanBenefitsForAppointment=async function(ctx){');
 const end=source.indexOf('async function voidRecord',start);
 assert.ok(start>=0&&end>start);
 const detail=source.slice(start,end);
 assert.match(detail,/sb\.rpc\('appointment_care_brief'/);
 assert.match(detail,/VaporeasyCareUI\?\.brief/);
 assert.doesNotMatch(detail,/benefitsHtml\(/);
 assert.doesNotMatch(detail,/package_charges|confirm_payment|appointment_payments/);
});

test('cadastro do veículo usa programação futura, não sinaliza execução em visita inexistente',()=>{
 const d={is_plan:true,plan_name:'Plano Premium',visit_date:'2026-10-14',benefits:[
   {label:'Enceramento manual',frequency:'per_visit'},
   {label:'Selante com grafeno da pintura',frequency:'monthly',monthly_quantity:1}
 ],care_history:[],visit_history:[]};
 const h=catalog.brief(d,true);
 assert.match(h,/PROGRAMAR NA PRÓXIMA ESTÉTICA/);
 assert.doesNotMatch(h,/FAZER NESTA ESTÉTICA/);
 assert.match(h,/consulte o atendimento para confirmar/);
 const record=rhythm.evaluate([{label:'Enceramento manual',frequency:'per_visit'}],[],[],'2026-10-14')[0];
 assert.equal(record.status,'check');
});

test('confirmação neste atendimento conclui benefício por ciclo sem exigi-lo novamente',()=>{
 const b={label:'Enceramento',frequency:'every_n_visits',every_n_visits:1,appointment_id:'a'};
 const h=[{label:'Enceramento',date:'2026-10-14',appointment_id:'a'}];
 assert.equal(state(b,h).status,'done');
 assert.equal(state({...b,frequency:'per_visit'},[]).status,'due');
});
test('resumo Premium quatro visitas não desconta agendadas como concluídas',()=>{
 const h=catalog.summary({limit_visits:4,completed:1,scheduled:2});
 assert.match(h,/<b>4<\/b><span>Contratadas/);
 assert.match(h,/<b>1<\/b><span>Concluídas/);
 assert.match(h,/<b>2<\/b><span>Agendadas/);
 assert.match(h,/<b>3<\/b><span>Restantes/);
});
test('intervalo exato 90 dias, data da próxima aplicação e histórico futuro ignorado',()=>{
 const b=rule('interval_days',90,90);
 const h=performed('2026-07-16').concat(performed('2026-11-01'));
 assert.equal(state(b,h,'2026-10-13').status,'ok');
 assert.equal(state(b,h).status,'due');
 assert.equal(state(b,h).nextDate,'2026-10-14');
 assert.equal(state(b,h).lastDate,'2026-07-16');
});
test('mensal concluído mostra previsão no próximo mês e não inventa execução',()=>{
 const b=rule('monthly',null,null,'Grafeno');
 assert.equal(state(b,performed('2026-10-02','Grafeno')).nextDate,'2026-11-01');
 assert.equal(state(b,[]).lastDate,null);
});
test('nova frequência é avaliada sem mutar histórico ou contrato anterior',()=>{
 const h=performed('2026-08-15'),original=JSON.stringify(h),b=rule('interval_days',60,60);
 assert.equal(state(b,h).status,'due');
 assert.equal(state({...b,min_days:90,max_days:90},h).status,'ok');
 assert.equal(JSON.stringify(h),original);
 assert.equal(b.min_days,60);
});

 test('quatro contratadas e três agendadas continuam quatro por realizar',()=>{
 const h=catalog.summary({limit_visits:4,completed:0,scheduled:3});
 assert.match(h,/<b>4<\/b><span>Restantes/);
 assert.ok(h.includes('Faltam realizar 4 estética(s): 3 já agendada(s) e 1 ainda sem agendamento.'));
 assert.ok(h.includes('Nenhuma estética foi concluída.'));
 });
 test('instrução de pagamento termina em confirmação do recebimento',()=>{
 const h=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
 assert.ok(h.includes('Após o pagamento, envie o comprovante para confirmarmos o recebimento.'));
 assert.ok(!h.includes('confirmarmos o recebimento e realizarmos a baixa'));
 });

test('prazos contratados: hidro e grafeno 45 dias, hidratação do couro 60 dias',()=>{
 const ref='2026-10-14';
 for(const [label,historicLabel] of [
  ['Hidro repelente','Proteção hidrorrepelente do para-brisa'],
  ['Selante Grafeno','Selante com grafeno da pintura']
 ]){
  const care=rule('interval_days',45,45,label);
  const events=performed(ref,historicLabel);
  assert.equal(state(care,events,'2026-11-27').status,'ok',label);
  assert.equal(state(care,events,'2026-11-28').status,'due',label);
  assert.equal(state(care,events,'2026-11-28').nextDate,'2026-11-28',label);
 }
 const leather=rule('interval_days',60,60,'Hidratação do couro');
 const history=performed(ref,'Hidratação do couro');
 assert.equal(state(leather,history,'2026-12-12').status,'ok');
 assert.equal(state(leather,history,'2026-12-13').status,'due');
 assert.equal(state(leather,history,'2026-12-13').nextDate,'2026-12-13');
});
