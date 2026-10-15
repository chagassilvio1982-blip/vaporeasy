/* Vaporeasy care standards: editable tier templates, explicitly adopted per subscribed vehicle.
 * Does not modify charges, payment state or appointments.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const html=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const tier=x=>/premium/i.test(String(x||''))?'premium':/plus/i.test(String(x||''))?'plus':/essencial/i.test(String(x||''))?'essencial':null;
const options='<option value="interval_days">Intervalo em dias</option><option value="monthly">Vezes por mês</option><option value="per_visit">Em toda estética</option><option value="every_n_visits">A cada N estéticas</option>';
let rows=[],current=null,benefits=[],month='',catalogBusy=false;
function describe(r){
 const kind=r.cadence_type||r.frequency;
 if(kind==='interval_days'){
  const a=Number(r.min_days??r.cadence_min_days),b=Number(r.max_days??r.cadence_max_days);
  return 'A cada '+a+(b!==a?'–'+b:'')+' dias';
 }
 if(kind==='every_n_visits')return 'A cada '+(r.every_n_visits||2)+' estéticas';
 if(kind==='per_visit')return 'Em todas as estéticas';
 return (r.monthly_quantity||1)+' vez(es) ao mês';
}
function togglePeriod(prefix){
 const type=$(prefix+'-type').value;
 $(prefix+'-days').classList.toggle('hidden',type!=='interval_days');
 $(prefix+'-visits').classList.toggle('hidden',type!=='every_n_visits');
 $(prefix+'-monthly').classList.toggle('hidden',type!=='monthly');
}
function formHtml(prefix,label){
 return '<form id="'+prefix+'-form" class="stack hidden" style="margin-top:10px">'+
  '<label>Serviço / cuidado<input id="'+prefix+'-label" maxlength="120" required></label>'+
  '<label>Periodicidade<select id="'+prefix+'-type">'+options+'</select></label>'+
  '<div id="'+prefix+'-days" class="pc-input-row"><label>De quantos dias<input id="'+prefix+'-min" type="number" min="1" max="365" value="60"></label>'+
  '<label>Até quantos dias<input id="'+prefix+'-max" type="number" min="1" max="365" value="90"></label></div>'+
  '<div id="'+prefix+'-visits" class="hidden"><label>A cada quantas estéticas<input id="'+prefix+'-every" type="number" min="1" max="12" value="2"></label></div>'+
  '<div id="'+prefix+'-monthly" class="hidden"><label>Quantidade mensal<input id="'+prefix+'-qty" type="number" min="1" max="12" value="1"></label></div>'+
  (prefix==='pcv'?'<label>Início da vigência<input id="pcv-effective" type="month" required></label><div class="meta">Mudanças em cuidados existentes valem a partir do próximo mês, preservando os atendimentos deste mês.</div>':'')+
  (prefix==='pct'?'<label>Orientação para o técnico<textarea id="pct-guidance" maxlength="500" rows="2"></textarea></label>':'')+
  '<div class="actions"><button type="submit" class="primary">'+label+'</button><button type="button" class="ghost" id="'+prefix+'-cancel">Cancelar</button></div></form>';
}
function values(prefix){
 const type=$(prefix+'-type').value;
 const a=type==='interval_days'?Number($(prefix+'-min').value):null,b=type==='interval_days'?Number($(prefix+'-max').value):null,
 every=type==='every_n_visits'?Number($(prefix+'-every').value):null,quantity=type==='monthly'?Number($(prefix+'-qty').value):1;
 if(!['interval_days','monthly','per_visit','every_n_visits'].includes(type)||((type==='interval_days')&&(!Number.isInteger(a)||!Number.isInteger(b)||a<1||b<a||b>365))||
 (type==='every_n_visits'&&(!Number.isInteger(every)||every<1||every>12))||quantity<1||quantity>12)
 throw Error('Confirme o intervalo de dias ou a frequência selecionada.');
 return {label:$(prefix+'-label').value.trim(),type,min:a,max:b,every,quantity,effective:prefix==='pcv'?$('pcv-effective').value:null};
}
function editForm(prefix,rule){
 $(prefix+'-form').classList.remove('hidden');
 $(prefix+'-label').value=rule?.service_label||rule?.label||'';
 $(prefix+'-label').readOnly=!!rule;
 if(prefix==='pcv'){
  const [y,m]=today().slice(0,7).split('-').map(Number);
  const earliest=rule?new Date(Date.UTC(y,m,1)).toISOString().slice(0,7):today().slice(0,7);
  $('pcv-effective').min=earliest;$('pcv-effective').value=earliest;
 }
 $(prefix+'-type').value=rule?.cadence_type||rule?.frequency||'interval_days';
 $(prefix+'-min').value=rule?.min_days??rule?.cadence_min_days??60;
 $(prefix+'-max').value=rule?.max_days??rule?.cadence_max_days??90;
 $(prefix+'-every').value=rule?.every_n_visits??2;
 $(prefix+'-qty').value=rule?.monthly_quantity??1;
 if(prefix==='pct')$('pct-guidance').value=rule?.guidance||'';
 togglePeriod(prefix);
 $(prefix+'-label').focus();
}
function warning(t){const n=$('pc-msg');if(n){n.textContent=t;n.className='notice error';}}
async function refreshTemplates(){
 const r=await sb.from('plan_care_templates').select('id,plan_tier,service_label,cadence_type,min_days,max_days,every_n_visits,monthly_quantity,guidance,enabled').order('service_label');
 if(r.error)throw r.error;rows=r.data||[];
 displayTemplates();
}
function displayTemplates(){
 const place=$('pct-list');if(!place)return;
 const chosen=$('pct-tier').value,subset=rows.filter(x=>x.plan_tier===chosen&&x.enabled);
 place.innerHTML=subset.length?subset.map(r=>'<div class="pc-template-row"><div><b>'+html(r.service_label)+'</b>'+
  '<div class="pc-cadence-hint">'+html(describe(r))+(r.guidance?'<div>'+html(r.guidance)+'</div>':'')+'</div></div>'+
  '<div class="actions"><button type="button" class="ghost" data-pct-edit="'+html(r.id)+'">Editar padrão</button>'+
  (current&&month>=today().slice(0,7)&&tier(current.plan)===chosen&&!/^estética de manutenção$/i.test(r.service_label)?'<button type="button" class="primary" data-pct-apply="'+html(r.id)+'">Confirmar no veículo</button>':'')+
  '</div></div>').join(''):'<div class="meta">Nenhum padrão para este plano.</div>';
 place.querySelectorAll('[data-pct-edit]').forEach(b=>b.onclick=()=>editForm('pct',rows.find(r=>r.id===b.dataset.pctEdit)));
 place.querySelectorAll('[data-pct-apply]').forEach(b=>b.onclick=()=>adoptTemplate(b.dataset.pctApply));
}
function displayVehicle(){
 const p=$('pc-care-vehicle-list');if(!p)return;
 if(!current){p.innerHTML='';return}
 const relevant=benefits.filter(b=>b.subscription_id===current.id&&b.effective_from_month.slice(0,7)<=month&&(!b.retired_from_month||b.retired_from_month.slice(0,7)>month));
 const selectedEnd=month?new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10):today();
 const asOf=selectedEnd<today()?selectedEnd:today();
 const states=window.VaporeasyCareRhythm?.evaluate(
 relevant.map(r=>({...r,label:r.service_label})),current.care_history||[],current.visits||[],asOf)||[];
 const stateMap=new Map(states.map(s=>[s.label.toLowerCase(),s]));
 p.innerHTML=relevant.length?relevant.map(r=>{
 const state=stateMap.get(r.service_label.toLowerCase());
 const stateText=state?(state.status==='due'?'Pendente':state.status==='ok'?'Dentro do prazo':state.status==='done'?'Realizado':'Conferir histórico'):'';
 return '<div class="pc-template-row"><div><b>'+html(r.service_label)+'</b><div class="pc-cadence-hint">'+
 html(describe(r))+(state?'<div><b>'+html(stateText)+'</b> • '+html(state.why)+(state.lastDate?' • Última aplicação: '+html(state.lastDate.split('-').reverse().join('/')):'')+'</div>':'')+'</div></div>'+(month>=today().slice(0,7)?'<div class="actions"><button type="button" class="ghost" data-pcv-edit="'+html(r.id)+'">Editar período</button><button type="button" class="ghost" data-pcv-retire="'+html(r.id)+'">Encerrar cuidado</button></div>':'')+'</div>'}).join('')
 :'<div class="meta">Nenhum cuidado adicional contratado foi cadastrado para este veículo.</div>';
 p.querySelectorAll('[data-pcv-edit]').forEach(b=>b.onclick=editForm('pcv',benefits.find(x=>x.id===b.dataset.pcvEdit)));
 p.querySelectorAll('[data-pcv-retire]').forEach(b=>b.onclick=()=>retireRule(b.dataset.pcvRetire));
}
async function retireRule(id){
 const rule=benefits.find(x=>x.id===id);
 if(!rule||!current||catalogBusy||month<today().slice(0,7))return;
 const [y,m]=today().slice(0,7).split('-').map(Number);
 const retirement=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);
 if(!window.confirm('Encerrar "'+rule.service_label+'" a partir de '+retirement+'? Registros anteriores serão preservados.'))return;
 catalogBusy=true;
 try{
  const result=await sb.rpc('retire_package_included_benefit',{p_benefit_id:id,p_from_month:retirement+'-01'});
  if(result.error)throw result.error;
  if(typeof window.refreshPlanControl==='function')await window.refreshPlanControl(current.vehicle_id);
  $('pc-msg').textContent='Encerramento previsto para '+retirement.split('-').reverse().join('/')+'.';$('pc-msg').className='notice';
 }catch(e){warning('Não foi possível encerrar o cuidado: '+(e.message||String(e)))}finally{catalogBusy=false}
}
async function adoptTemplate(id){
 const r=rows.find(x=>x.id===id);
 if(!r||!current||r.plan_tier!==tier(current.plan)||catalogBusy||/^estética de manutenção$/i.test(r.service_label))return;
 if(benefits.some(b=>b.subscription_id===current.id&&b.service_label.toLowerCase()===r.service_label.toLowerCase()&&
 b.effective_from_month.slice(0,7)<=month&&(!b.retired_from_month||b.retired_from_month.slice(0,7)>month))){
  warning('Este cuidado já está configurado para o veículo. Use Editar período.');return;
 }
 if(!window.confirm('Confirmar que "'+r.service_label+'" faz parte do contrato deste veículo? Esta ação não gera cobrança.'))return;
 await saveRule({label:r.service_label,type:r.cadence_type,min:r.min_days,max:r.max_days,every:r.every_n_visits,quantity:r.monthly_quantity});
}
async function saveRule(v){
 if(!current||catalogBusy)return;
 catalogBusy=true;
 try{
  const result=await sb.rpc('save_subscription_care_rule',{
   p_subscription_id:current.id,p_label:v.label,p_type:v.type,p_min:v.min,
   p_max:v.max,p_every:v.every,p_quantity:v.quantity,p_month:(v.effective||month)+'-01'
  });
  if(result.error)throw result.error;
  $('pcv-form').classList.add('hidden');
  if(typeof window.refreshPlanControl==='function')await window.refreshPlanControl(current.vehicle_id);
  if(v.effective&&v.effective>month){$('pc-msg').textContent='Cuidado salvo para '+v.effective.split('-').reverse().join('/')+'. O mês atual permanece igual.';$('pc-msg').className='notice';}
 }catch(e){warning('Não foi possível salvar: '+(e.message||String(e)))}finally{catalogBusy=false}
}
function init(){
 if($('pc-care-tools'))return;
 const root=$('pc-admin');if(!root||!['owner','admin'].includes(currentRole))return;
 const node=document.createElement('section');node.id='pc-care-tools';
 node.innerHTML='<div class="item" style="margin-top:12px"><h3>Cuidados deste veículo</h3><div id="pc-care-vehicle-list"></div>'+
 '<button class="ghost" id="pcv-new" type="button" style="margin-top:9px">+ Incluir cuidado contratado</button>'+
 formHtml('pcv','Salvar cuidado no veículo')+'</div>'+
 '<details id="pc-care-standards" style="margin-top:12px"><summary>Configurações padrão dos planos (administrador)</summary>'+
 '<div class="meta" style="margin:9px 0">Padrões são referências editáveis. Não concedem automaticamente benefícios a clientes.</div>'+
 '<label>Plano<select id="pct-tier"><option value="essencial">Essencial</option><option value="plus">Plus</option><option value="premium">Premium</option></select></label>'+
 '<div id="pct-list"></div><button type="button" class="ghost" id="pct-new" style="margin-top:10px">+ Novo cuidado padrão</button>'+
 formHtml('pct','Salvar padrão do plano')+'</details>';
 root.appendChild(node);
 for(const prefix of ['pct','pcv']){
  $(prefix+'-type').onchange=()=>togglePeriod(prefix);
  $(prefix+'-cancel').onclick=()=>$(prefix+'-form').classList.add('hidden');
 }
 $('pct-tier').onchange=displayTemplates;
 $('pcv-new').onclick=()=>editForm('pcv',null);
 $('pct-new').onclick=()=>editForm('pct',null);
 $('pcv-form').onsubmit=async e=>{
  e.preventDefault();try{const v=values('pcv');await saveRule(v)}catch(err){warning(err.message)}
 };
 $('pct-form').onsubmit=async e=>{
  e.preventDefault();if(catalogBusy)return;
  catalogBusy=true;
  try{
   const v=values('pct');
   const result=await sb.rpc('save_plan_care_template',{
    p_tier:$('pct-tier').value,p_label:v.label,p_type:v.type,p_min:v.min,p_max:v.max,
    p_every:v.every,p_quantity:v.quantity,p_guidance:$('pct-guidance').value.trim(),p_enabled:true
   });
   if(result.error)throw result.error;
   $('pct-form').classList.add('hidden');
   await refreshTemplates();
  }catch(err){warning('Não foi possível salvar o padrão: '+(err.message||String(err)))}
  finally{catalogBusy=false}
 };
 refreshTemplates().catch(err=>warning('Falha ao consultar padrões: '+(err.message||err)));
}
function refresh(s,b,selectedMonth){
 current=s||null;benefits=b||[];month=selectedMonth||today().slice(0,7);
 if($('pcv-new'))$('pcv-new').classList.toggle('hidden',!current||month<today().slice(0,7));
 if($('pc-care-standards'))$('pc-care-standards').open=false;
 if($('pcv-form'))$('pcv-form').classList.add('hidden');
 if($('pct-tier')&&current)$('pct-tier').value=tier(current.plan)||'premium';
 displayVehicle();displayTemplates();
 if($('pc-define'))$('pc-define').classList.add('hidden'); // replaced by compact rule editor
}
function nextText(x){
 if(x.nextDate)return x.nextDate.split('-').reverse().join('/');
 if(x.frequency==='per_visit')return 'Em cada estética';
 if(x.frequency==='every_n_visits')return 'Conforme ciclo de estéticas';
 return 'A confirmar';
}
function summary(d){
 const limit=d.limit_visits??d.visits_limit,done=d.completed??(d.visits||[]).length,
  scheduled=d.scheduled,known=limit!==null&&limit!==undefined;
 const remaining=known?Math.max(0,Number(limit)-Number(done)):null;
 const overbooked=known&&scheduled!==null&&scheduled!==undefined&&Number(scheduled)>remaining;
 const note=overbooked?'Atenção: há mais agendamentos que estéticas disponíveis no plano.':
  'Agendadas só são descontadas quando o atendimento é concluído.';
 return '<div class="care-counts" aria-label="Estéticas do mês">'+[
  ['Contratadas',known?limit:'—'],['Concluídas',done],['Agendadas',scheduled??'—'],
  ['A realizar',known?remaining:'—']
 ].map(([label,value])=>'<div><b>'+html(value)+'</b><span>'+label+'</span></div>').join('')+
 '</div><div class="care-meta">'+html(note)+(scheduled===undefined||scheduled===null?' Consulte os agendamentos na agenda.':'')+'</div>';
}
function careDate(s){return String(s||'').slice(0,10).split('-').reverse().join('/');}
function careInfo(x,mode){
 const date=x.lastDate?careDate(x.lastDate):null;
 const next=x.nextDate?careDate(x.nextDate):null;
 if(mode==='due'){
  if(x.frequency==='per_visit')return 'Fazer em todas as estéticas do plano';
  if(x.frequency==='monthly')return date?'Última aplicação: '+date+' • Fazer neste mês':'Aplicação prevista neste mês';
  if(x.frequency==='interval_days')return date?'Última aplicação: '+date+' • Reaplicar nesta estética':'Aplicar nesta estética';
  if(x.frequency==='every_n_visits')return date?'Última aplicação: '+date+' • Repetir conforme ciclo de estéticas':'Conferir ciclo antes de aplicar';
  return 'Cuidado previsto neste atendimento';
 }
 if(mode==='recorded'){
  if(x.frequency==='per_visit')return 'Feito nesta estética • Repetir na próxima';
  if(x.frequency==='every_n_visits')return 'Última aplicação: '+date+' • Repetir conforme ciclo de estéticas';
  if(next&&date)return 'Aplicado em '+date+' • Próxima aplicação: '+next;
  return date?'Aplicado em '+date:'Realizado neste atendimento';
 }
 if(x.frequency==='per_visit')return 'Fazer em cada estética do plano; confirme no atendimento';
 if(x.frequency==='every_n_visits')return 'Conferir quando começou o ciclo de estéticas';
 return 'Sem primeira aplicação registrada • Confirmar com o administrador';
}
function task(name,items,css,mode){
 if(!items.length)return '';
 return '<section class="care-group '+css+'"><h5>'+name+'</h5>'+
 items.map(x=>'<div class="care-task"><b>'+html(x.label)+'</b><small>'+html(careInfo(x,mode))+
 '</small></div>').join('')+'</section>';
}
function brief(d,hideAppointmentNotes){
 const rhythm=window.VaporeasyCareRhythm;
 if(!rhythm)return '<div class="notice">Cuidados do plano indisponíveis: atualize a página.</div>';
 const when=d.visit_date||today(),isAppointment=!!d.appointment_id,
  evaluated=rhythm.evaluate((d.benefits||[]).map(b=>({...b,appointment_id:d.appointment_id})),
  d.care_history||d.performed||[],d.visit_history||[],when);
 const due=evaluated.filter(x=>x.status==='due'),
  recorded=evaluated.filter(x=>x.status==='ok'||x.status==='done'),
  check=evaluated.filter(x=>x.status==='check');
 const last=rhythm.lastVisit(d.visit_history||d.recent_visits||[],when);
 const lastCare=last?(d.care_history||[]).filter(e=>String(e.date).slice(0,10)===String(last.date).slice(0,10)):[];
 const lastText=last?'<b>Última estética: '+html(careDate(last.date))+'</b>'+
 (lastCare.length?'<div class="care-meta">Cuidados registrados: '+lastCare.map(x=>html(x.label)).join(' • ')+'</div>':'<div class="care-meta">Sem cuidado adicional registrado.</div>'):
 '<span class="care-meta">Nenhuma estética anterior encontrada para este veículo.</span>';
 const notes=(!hideAppointmentNotes&&d.appointment_notes?'<div class="care-group"><b>Observação desta visita</b><div class="care-meta">'+html(d.appointment_notes)+'</div></div>':'')+
 (d.vehicle_notes?'<div class="care-group"><b>Observações do veículo</b><div class="care-meta">'+html(d.vehicle_notes)+'</div></div>':'');
 return '<div class="care-brief" role="region" aria-label="Cuidados do veículo"><h4>'+
 html(String(d.plan_name||'Plano Vaporeasy').replace(/^Pacote\s+/i,'Plano '))+
 ' • '+(isAppointment?'O que fazer nesta estética':'Situação dos cuidados')+'</h4>'+
 '<div class="care-meta">'+html(String(d.month||when).slice(0,7).split('-').reverse().join('/'))+'</div>'+
 (d.hide_summary?'':summary(d))+
 notes+
 task(isAppointment?'FAZER NESTA ESTÉTICA':'PROGRAMAR NA PRÓXIMA ESTÉTICA',due,'care-group-priority','due')+
 (!due.length&&isAppointment?'<div class="care-group care-group-priority"><div class="care-meta">Nenhum cuidado pendente para esta estética.</div></div>':'')+
 task('JÁ REALIZADOS • EM DIA',recorded,'care-group-muted','recorded')+
 task('CONFERIR REGISTROS',check,'care-group-muted','check')+
 (!evaluated.length?'<div class="care-group care-group-muted"><div class="care-meta">Nenhum cuidado adicional foi confirmado neste contrato. Confirme com o administrador antes de executar benefícios extras.</div></div>':'')+
 '<details class="care-group care-group-previous"><summary>ESTÉTICA ANTERIOR</summary>'+lastText+'</details></div>';
}
window.VaporeasyCareUI={init,refresh,brief,describe,summary};
})();
