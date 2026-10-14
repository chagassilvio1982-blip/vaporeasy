/* Vaporeasy care standards: editable tier templates, explicitly adopted per subscribed vehicle.
 * Does not modify charges, payment state or appointments.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const html=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const tier=x=>/premium/i.test(String(x||''))?'premium':/plus/i.test(String(x||''))?'plus':/essencial/i.test(String(x||''))?'essencial':null;
const labels={premium:'Premium',plus:'Plus',essencial:'Essencial'};
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
 return {label:$(prefix+'-label').value.trim(),type,min:a,max:b,every,quantity};
}
function editForm(prefix,rule){
 $(prefix+'-form').classList.remove('hidden');
 $(prefix+'-label').value=rule?.service_label||rule?.label||'';
 $(prefix+'-label').readOnly=!!rule;
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
  (current&&tier(current.plan)===chosen&&!/^estética de manutenção$/i.test(r.service_label)?'<button type="button" class="primary" data-pct-apply="'+html(r.id)+'">Confirmar no veículo</button>':'')+
  '</div></div>').join(''):'<div class="meta">Nenhum padrão para este plano.</div>';
 place.querySelectorAll('[data-pct-edit]').forEach(b=>b.onclick=()=>editForm('pct',rows.find(r=>r.id===b.dataset.pctEdit)));
 place.querySelectorAll('[data-pct-apply]').forEach(b=>b.onclick=()=>adoptTemplate(b.dataset.pctApply));
}
function displayVehicle(){
 const p=$('pc-care-vehicle-list');if(!p)return;
 if(!current){p.innerHTML='';return}
 const relevant=benefits.filter(b=>b.subscription_id===current.id&&b.effective_from_month.slice(0,7)<=month&&(!b.retired_from_month||b.retired_from_month.slice(0,7)>month));
 const states=window.VaporeasyCareRhythm?.evaluate(
 relevant.map(r=>({...r,label:r.service_label})),current.care_history||[],current.visits||[],today())||[];
 const stateMap=new Map(states.map(s=>[s.label.toLowerCase(),s]));
 p.innerHTML=relevant.length?relevant.map(r=>{
 const state=stateMap.get(r.service_label.toLowerCase());
 const stateText=state?(state.status==='due'?'Fazer hoje':state.status==='ok'?'Dentro do prazo':state.status==='done'?'Realizado':'Conferir histórico'):'';
 return '<div class="pc-template-row"><div><b>'+html(r.service_label)+'</b><div class="pc-cadence-hint">'+
 html(describe(r))+(state?'<div><b>'+html(stateText)+'</b> • '+html(state.why)+(state.lastDate?' • Última aplicação: '+html(state.lastDate.split('-').reverse().join('/')):'')+'</div>':'')+'</div></div>'+(month>=today().slice(0,7)?'<button type="button" class="ghost" data-pcv-edit="'+html(r.id)+'">Editar período</button>':'')+'</div>'}).join('')
 :'<div class="meta">Nenhum cuidado adicional contratado foi cadastrado para este veículo.</div>';
 p.querySelectorAll('[data-pcv-edit]').forEach(b=>b.onclick=editForm('pcv',benefits.find(x=>x.id===b.dataset.pcvEdit)));
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
   p_max:v.max,p_every:v.every,p_quantity:v.quantity,p_month:month+'-01'
  });
  if(result.error)throw result.error;
  $('pcv-form').classList.add('hidden');
  if(typeof window.refreshPlanControl==='function')await window.refreshPlanControl(current.vehicle_id);
 }catch(e){warning('Não foi possível salvar: '+(e.message||String(e)))}finally{catalogBusy=false}
}
function init(){
 if($('pc-care-tools'))return;
 const root=$('pc-summary');if(!root)return;
 const node=document.createElement('section');node.id='pc-care-tools';
 node.innerHTML='<div class="item" style="margin-top:12px"><h3>Cuidados deste veículo</h3><div id="pc-care-vehicle-list"></div>'+
 '<button class="ghost" id="pcv-new" type="button" style="margin-top:9px">+ Incluir cuidado contratado</button>'+
 formHtml('pcv','Salvar cuidado no veículo')+'</div>'+
 '<details id="pc-care-standards" style="margin-top:12px"><summary>Configurações padrão dos planos (administrador)</summary>'+
 '<div class="meta" style="margin:9px 0">Padrões são referências editáveis. Não concedem automaticamente benefícios a clientes.</div>'+
 '<label>Plano<select id="pct-tier"><option value="essencial">Essencial</option><option value="plus">Plus</option><option value="premium">Premium</option></select></label>'+
 '<div id="pct-list"></div><button type="button" class="ghost" id="pct-new" style="margin-top:10px">+ Novo cuidado padrão</button>'+
 formHtml('pct','Salvar padrão do plano')+'</details>';
 root.insertAdjacentElement('afterend',node);
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
 if($('pct-tier')&&current)$('pct-tier').value=tier(current.plan)||'premium';
 displayVehicle();displayTemplates();
 if($('pc-define'))$('pc-define').classList.add('hidden'); // replaced by compact rule editor
}
function task(name,items,css){
 if(!items.length)return '';
 return '<section class="care-group '+css+'"><h5>'+name+'</h5>'+
 items.map(x=>'<div class="care-task"><b>'+html(x.label)+'</b><small>'+html(x.why)+
  (x.lastDate?' • Última aplicação: '+html(x.lastDate.split('-').reverse().join('/')):'')+
  '</small></div>').join('')+'</section>';
}
function brief(d,hideAppointmentNotes){
 const rhythm=window.VaporeasyCareRhythm;
 if(!rhythm)return '<div class="notice">Cuidados do plano indisponíveis: atualize a página.</div>';
 const when=d.visit_date||today(),evaluated=rhythm.evaluate((d.benefits||[]).map(b=>({...b,appointment_id:d.appointment_id})),d.care_history||d.performed||[],d.visit_history||[],when);
 const due=evaluated.filter(x=>x.status==='due'),done=evaluated.filter(x=>x.status==='done'),ok=evaluated.filter(x=>x.status==='ok'),check=evaluated.filter(x=>x.status==='check');
 const last=rhythm.lastVisit(d.visit_history||d.recent_visits||[],when);
 const lastCare=last?(d.care_history||[]).filter(e=>String(e.date).slice(0,10)===String(last.date).slice(0,10)):[];
 const lastText=last?'<b>Última estética: '+html(String(last.date).slice(0,10).split('-').reverse().join('/'))+'</b>'+
 (lastCare.length?'<div class="care-meta">Cuidados registrados nessa data: '+lastCare.map(x=>html(x.label)).join(' • ')+'</div>':'<div class="care-meta">Sem cuidado adicional registrado nessa data.</div>'):
 '<span class="care-meta">Nenhuma estética anterior encontrada para este veículo.</span>';
 const notes=(!hideAppointmentNotes&&d.appointment_notes?'<div class="care-group"><b>Observação desta visita</b><div class="care-meta">'+html(d.appointment_notes)+'</div></div>':'')+
 (d.vehicle_notes?'<div class="care-group"><b>Observações do veículo</b><div class="care-meta">'+html(d.vehicle_notes)+'</div></div>':'');
 return '<div class="care-brief" role="region" aria-label="Cuidados desta estética"><h4>'+html(String(d.plan_name||'Plano Vaporeasy').replace(/^Pacote\s+/i,'Plano '))+' • O que fazer nesta visita</h4>'+
 '<div class="care-meta">Benefícios apenas deste contrato. Registros financeiros não aparecem aqui.</div>'+
 task('FAZER NESTA ESTÉTICA',due,'care-group-priority')+
 task('JÁ REALIZADO / DENTRO DO PRAZO',[...done,...ok],'care-group-muted')+
 task('CONFERIR PRIMEIRA APLICAÇÃO',check,'care-group-muted')+
 (!evaluated.length?'<div class="care-group care-group-muted"><div class="care-meta">Nenhum cuidado adicional foi confirmado neste contrato. Confirme com o administrador antes de executar benefícios extras.</div></div>':'')+
 '<section class="care-group care-group-previous"><h5>ESTÉTICA ANTERIOR</h5>'+lastText+'</section>'+notes+'</div>';
}
window.VaporeasyCareUI={init,refresh,brief,describe};
})();
