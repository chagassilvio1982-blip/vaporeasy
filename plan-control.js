/* Internal plan usage and included-service history. Does not create charges. */
(function(){
'use strict';
let clientId='',data=[],benefitConfigs=[],sequence=0,requestKey='',saving=false;
const el=id=>document.getElementById(id),allowed=()=>['owner','admin'].includes(currentRole);
function dateLabel(date){return String(date||'').slice(0,10).split('-').reverse().join('/')}
function ensureDialog(){
 if(el('plancontrol'))return;
 const d=document.createElement('dialog');d.id='plancontrol';d.setAttribute('aria-label','Controle dos planos');
 d.innerHTML='<div class="stack"><div class="actions"><h3 id="pc-title" style="flex:3;margin:8px 0">Controle dos planos</h3><button id="pc-close" type="button" class="ghost">Fechar</button></div><div id="pc-msg" class="notice hidden" role="status"></div><label>Mês do plano<input id="pc-month" type="month"></label><label>Veículo e plano<select id="pc-sub"></select></label><div id="pc-summary"></div><div id="pc-body" class="hidden"><h3>Serviços efetuados no plano</h3><div id="pc-history"></div><details id="pc-register"><summary style="cursor:pointer;padding:12px;font-weight:850">+ Registrar serviço incluído</summary><form id="pc-form" class="stack" style="padding-top:12px"><div class="notice">Registra um benefício realizado, sem cobrança adicional. A contagem de estéticas vem dos atendimentos concluídos na agenda.</div><label>Serviço<select id="pc-kind"><option>Aplicação de hidrorrepelente</option><option>Enceramento manual</option><option>Hidratação do couro</option><option>Higienização dos bancos</option><option>Tratamento do couro</option><option value="other">Outro serviço incluído</option></select></label><label id="pc-custom-wrap" class="hidden">Nome do serviço<input id="pc-custom" maxlength="120"></label><label>Vincular a uma estética concluída<select id="pc-appt"><option value="">Registro independente</option></select></label><label>Data da execução<input id="pc-date" type="date" required></label><label>Observações<textarea id="pc-notes" maxlength="2000"></textarea></label><button id="pc-save" type="submit" class="primary">Salvar serviço realizado</button></form></details></div></div>';
 document.body.appendChild(d);
 const spec=document.createElement('div');spec.id='pc-spec';
 spec.innerHTML='<div id="pc-benefit-list"></div><details id="pc-define"><summary style="cursor:pointer;padding:12px;font-weight:850">+ Definir benefício contratado</summary><form id="pc-define-form" class="stack" style="padding:12px"><div class="meta">Cadastre somente benefícios comprovadamente contratados para este veículo, inclusive se o mês for anterior. A definição vale a partir do mês selecionado e não cria cobrança.</div><label>Benefício previsto<input id="pc-define-label" maxlength="120" required placeholder="Ex.: Enceramento manual"></label><label>Frequência<select id="pc-define-frequency"><option value="monthly">Quantidade por mês</option><option value="per_visit">Em cada estética do plano</option></select></label><label id="pc-define-qty-wrap">Quantidade mensal<input id="pc-define-qty" type="number" min="1" max="12" value="1" required></label><button class="primary" type="submit">Adicionar ao plano</button></form></details>';
 el('pc-summary').insertAdjacentElement('afterend',spec);
 window.VaporeasyCareUI?.init();
 el('pc-define-frequency').onchange=()=>el('pc-define-qty-wrap').classList.toggle('hidden',el('pc-define-frequency').value==='per_visit');
 el('pc-define-form').onsubmit=defineBenefit;
 el('pc-benefit-list').addEventListener('click',e=>{const b=e.target.closest('[data-pc-retire]');if(b)retireBenefit(b.dataset.pcRetire)});
 d.addEventListener('close',()=>{const c=window.__v2DetailPlanContext;if(c&&document.getElementById('dd')?.open)window.renderPlanBenefitsForAppointment?.(c).catch(()=>{});});
 el('pc-close').onclick=()=>d.close();el('pc-month').onchange=()=>load();el('pc-sub').onchange=render;
 el('pc-kind').onchange=()=>{const custom=el('pc-kind').value==='other';el('pc-custom-wrap').classList.toggle('hidden',!custom);el('pc-custom').required=custom;requestKey=''};
 el('pc-appt').onchange=()=>{const s=selected(),a=(s?.visits||[]).find(x=>x.id===el('pc-appt').value);if(a)el('pc-date').value=a.date;requestKey=''};
 el('pc-form').onsubmit=save;
 ['pc-date','pc-custom','pc-notes'].forEach(id=>el(id).addEventListener('input',()=>{if(!saving)requestKey=''}));
}
function lockWriting(){
 ['pc-month','pc-sub','pc-kind','pc-custom','pc-appt','pc-date','pc-notes','pc-define-label','pc-define-frequency','pc-define-qty'].forEach(id=>el(id).disabled=saving||(id==='pc-sub'&&!data.length));
 el('pc-save').disabled=saving||!selected()||el('pc-date').min>el('pc-date').max;
 el('pc-history').querySelectorAll('[data-pc-void]').forEach(b=>b.disabled=saving);
}
function selected(){return data.find(s=>s.id===el('pc-sub').value)}
window.openPlanControl=async function(id,vehicleId='',month=''){
 if(saving)return;
 if(!allowed())return show('msg','Seu perfil não pode consultar os planos.','error');
 ensureDialog();clientId=id;data=[];el('pc-sub').innerHTML='';el('pc-summary').innerHTML='';el('pc-body').classList.add('hidden');
 const c=clients.find(x=>x.id===id);el('pc-title').textContent='Planos • '+(c?.name||'Cliente');
 el('pc-month').value=month&&month<=today().slice(0,7)?month:today().slice(0,7);el('pc-month').max=today().slice(0,7);el('plancontrol').showModal();await load(vehicleId);
};
function message(text,error=false){const b=el('pc-msg');b.textContent=text;b.className='notice'+(error?' error':'')+(text?'':' hidden')}
async function load(vehicleId=''){
 const token=++sequence,month=el('pc-month').value,previous=el('pc-sub').value;
 el('pc-body').classList.add('hidden');el('pc-summary').textContent='Consultando plano...';el('pc-sub').disabled=true;message('');
 if(!/^\d{4}-\d{2}$/.test(month)){el('pc-summary').textContent='Selecione o mês.';return}
 try{
  const r=await sb.rpc('get_client_plan_control',{p_client_id:clientId,p_month:month+'-01'});if(token!==sequence)return;if(r.error)throw r.error;
  data=r.data?.subscriptions||[];
  const ids=data.map(x=>x.id);
  const br=ids.length?await sb.from('package_included_benefits').select('id,subscription_id,service_label,frequency,monthly_quantity,effective_from_month,retired_from_month,cadence_min_days,cadence_max_days,every_n_visits').in('subscription_id',ids):{data:[],error:null};
  if(token!==sequence)return;if(br.error)throw br.error;
  benefitConfigs=br.data||[];
  const hist=ids.length?await sb.from('package_service_events').select('subscription_id,performed_on,service_label,appointment_id').in('subscription_id',ids).is('voided_at',null).lt('performed_on',new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)).toISOString().slice(0,10)).order('performed_on',{ascending:false}).limit(700):{data:[],error:null};
  if(token!==sequence)return;if(hist.error)throw hist.error;
  data.forEach(p=>{p.care_history=(hist.data||[]).filter(x=>x.subscription_id===p.id).map(x=>({date:x.performed_on,label:x.service_label,appointment_id:x.appointment_id}))});
  el('pc-sub').innerHTML=data.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.vehicle+(s.plate?' • '+s.plate:'')+' • '+s.plan+(!s.active?' • histórico':''))+'</option>').join('');
  const chosen=data.find(s=>s.vehicle_id===vehicleId)||data.find(s=>s.id===previous)||data[0];
  if(chosen)el('pc-sub').value=chosen.id;
  el('pc-sub').disabled=!data.length;render();
 }catch(e){if(token===sequence){data=[];el('pc-sub').innerHTML='';el('pc-summary').textContent='Não foi possível consultar o plano.';message(fail(e),true)}}
}
function render(){
 const s=selected();requestKey='';el('pc-register').open=false;el('pc-define').open=false;
 if(!s){window.VaporeasyCareUI?.refresh(null,[],el('pc-month').value);el('pc-benefit-list').innerHTML='';el('pc-define').classList.add('hidden');el('pc-summary').innerHTML='<div class="empty">Nenhum plano registrado para este cliente neste mês.</div>';el('pc-body').classList.add('hidden');return}
 const known=s.limit_visits!==null&&s.limit_visits!==undefined,limit=Number(s.limit_visits||0),done=Number(s.completed||0),scheduled=Number(s.scheduled||0),remaining=Math.max(0,limit-done),extra=Math.max(0,done-limit);
 el('pc-summary').innerHTML='<div class="item"><h3>'+esc(s.plan)+'</h3><div class="meta">'+esc(s.vehicle)+' • '+esc(el('pc-month').value.split('-').reverse().join('/'))+'</div><div style="font-size:23px;font-weight:900;margin:12px 0">'+done+(known?' de '+limit:'')+' estéticas concluídas</div><div class="meta">'+(known?remaining+' restante'+(remaining===1?'':'s')+' no mês':'Limite deste mês não registrado')+' • '+scheduled+' agendada'+(scheduled===1?'':'s')+'</div>'+(known&&extra?'<div class="notice" style="margin-top:10px">'+extra+' estética'+(extra===1?'':'s')+' acima da quantidade contratada. Confira o histórico.</div>':'')+(s.limit_source==='current_contract'?'<div class="meta" style="margin-top:8px">Quantidade de referência do contrato atual.</div>':'')+'</div>';
 const history=[...(s.visits||[]).map(v=>({...v,label:'Estética do plano',kind:'visit',notes:''})),...(s.services||[]).map(v=>({...v,kind:'benefit'}))].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 el('pc-benefit-list').innerHTML='';
 window.VaporeasyCareUI?.refresh(s,benefitConfigs,el('pc-month').value);
 el('pc-define').classList.add('hidden');
 const defined=forMonth(s,el('pc-month').value);
 el('pc-kind').innerHTML='<option value="">Selecione o serviço realizado</option>'+
  (defined.length?defined.map(b=>'<option value="'+esc(b.service_label)+'">'+esc(b.service_label)+'</option>').join(''):
   '<option>Aplicação de hidrorrepelente</option><option>Enceramento manual</option><option>Hidratação do couro</option><option>Higienização dos bancos</option><option>Tratamento do couro</option>')+
  '<option value="other">Outro serviço incluído</option>';
 el('pc-history').innerHTML=history.length?history.map(h=>'<div class="item"><b>'+esc(dateLabel(h.date))+' • '+esc(h.label)+'</b><div class="meta">'+(h.kind==='visit'?'Estética concluída • conta como uma visita':'Serviço incluído • sem cobrança adicional')+'</div>'+(h.notes?'<div class="meta" style="margin-top:5px">'+esc(h.notes)+'</div>':'')+(h.kind==='benefit'?'<button type="button" class="ghost" data-pc-void="'+esc(h.id)+'" style="margin-top:8px">Anular registro</button>':'')+'</div>').join(''):'<div class="empty">Nenhuma estética concluída ou benefício registrado neste mês.</div>';
 el('pc-history').querySelectorAll('[data-pc-void]').forEach(b=>b.onclick=()=>voidRecord(b.dataset.pcVoid));
 el('pc-body').classList.remove('hidden');el('pc-form').reset();el('pc-custom-wrap').classList.add('hidden');el('pc-custom').required=false;
 el('pc-appt').innerHTML='<option value="">Registro independente</option>'+(s.visits||[]).map(v=>'<option value="'+esc(v.id)+'">'+esc(dateLabel(v.date)+' • Estética concluída')+'</option>').join('');
 const month=el('pc-month').value,first=month+'-01',parts=month.split('-').map(Number),last=month+'-'+String(new Date(parts[0],parts[1],0).getDate()).padStart(2,'0'),maximum=last<today()?last:today();
 el('pc-date').min=s.starts_on>first?s.starts_on:first;el('pc-date').max=maximum;el('pc-date').value=maximum;el('pc-save').disabled=saving||el('pc-date').min>maximum;lockWriting();
}
async function save(e){
 e.preventDefault();if(saving||!allowed())return;
 const s=selected(),date=el('pc-date').value,label=el('pc-kind').value==='other'?el('pc-custom').value.trim():el('pc-kind').value,notes=el('pc-notes').value.trim(),appointmentId=el('pc-appt').value||null;
 if(!s||label.length<3||label.length>120||!date||date.slice(0,7)!==el('pc-month').value||date<el('pc-date').min||date>el('pc-date').max)return message('Confira o serviço e a data da execução dentro do mês selecionado.',true);
 requestKey=requestKey||crypto.randomUUID();saving=true;lockWriting();message('');
 try{
  const r=await sb.rpc('register_package_service',{p_subscription_id:s.id,p_performed_on:date,p_service_label:label,p_notes:notes,p_appointment_id:appointmentId,p_request_key:requestKey});if(r.error)throw r.error;
  requestKey='';await load(s.vehicle_id);message('Serviço realizado registrado no plano, sem cobrança adicional.');
 }catch(err){message(fail(err),true)}finally{saving=false;lockWriting()}
}

function forMonth(s,month){
 return benefitConfigs.filter(b=>b.subscription_id===s.id&&b.effective_from_month.slice(0,7)<=month&&(!b.retired_from_month||b.retired_from_month.slice(0,7)>month));
}
function keyName(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR')}
function benefitRows(s,month){
 const defs=forMonth(s,month),used=new Set(),rows=defs.map(b=>{
  const dates=(s.services||[]).filter(v=>keyName(v.label)===keyName(b.service_label)).map(v=>dateLabel(v.date));
  (s.services||[]).forEach(v=>{if(keyName(v.label)===keyName(b.service_label))used.add(v.id)});
  const known=s.limit_visits!==null&&s.limit_visits!==undefined;
  const qty=b.frequency==='per_visit'?(known?Number(s.limit_visits):null):Number(b.monthly_quantity);
  const done=dates.length,status=qty===null?'Quantidade a conferir':done>qty?'Acima do previsto • conferir':done===qty?'Realizado':'Pendente';
  return {id:b.id,label:b.service_label,done,qty,status,dates,frequency:b.frequency};
 });
 const other=(s.services||[]).filter(v=>!used.has(v.id));
 return {rows,other};
}
function benefitsHtml(s,month,withActions=true){
 const {rows,other}=benefitRows(s,month);
 let html='<div class="item" style="margin-top:10px"><h3 style="margin-top:0">Benefícios previstos no plano</h3>';
 if(!rows.length)html+='<div class="meta">Nenhum benefício adicional foi especificado para este veículo neste mês. Configure somente o que foi contratado; serviços registrados permanecem no histórico abaixo.</div>';
 else html+=rows.map(b=>{
  const raw=benefitConfigs.find(v=>v.id===b.id);
  const frequency=b.frequency==='per_visit'?'Em cada estética':'Por mês';
  const qtyText=b.qty===null?'previsão a confirmar':b.done+' de '+b.qty+' realizado(s)';
  return '<div class="item" style="margin-top:8px"><b>'+esc(b.label)+'</b><div class="meta">'+frequency+' • '+esc(qtyText)+'</div><div class="meta" style="margin-top:6px"><b>'+esc(b.status)+'</b>'+(b.dates.length?' • '+esc(b.dates.join(', ')):' • Sem execução registrada')+'</div>'+
   (withActions&&month>=today().slice(0,7)?'<button type="button" class="ghost" data-pc-retire="'+esc(raw.id)+'" style="margin-top:8px">Encerrar benefício a partir deste mês</button>':'')+'</div>';
 }).join('');
 if(other.length)html+='<div class="meta" style="margin-top:9px"><b>Outros serviços realizados:</b> '+other.map(v=>esc(v.label)+' ('+esc(dateLabel(v.date))+')').join(' • ')+'</div>';
 return html+'</div>';
}
async function defineBenefit(e){
 e.preventDefault();if(saving||!allowed())return;
 const s=selected(),month=el('pc-month').value,label=el('pc-define-label').value.trim(),frequency=el('pc-define-frequency').value,qty=frequency==='per_visit'?1:Number(el('pc-define-qty').value);
 if(!s||label.length<3||label.length>120||!['monthly','per_visit'].includes(frequency)||!Number.isInteger(qty)||qty<1||qty>12)return message('Verifique o benefício e o mês de início.',true);
 saving=true;lockWriting();message('');
 try{
  const r=await sb.rpc('add_package_included_benefit',{p_subscription_id:s.id,p_service_label:label,p_frequency:frequency,p_monthly_quantity:qty,p_effective_from_month:month+'-01'});
  if(r.error)throw r.error;await load(s.vehicle_id);message('Benefício contratado incluído para o veículo, sem alteração financeira.');
 }catch(e){message(fail(e),true)}finally{saving=false;lockWriting()}
}
async function retireBenefit(id){
 if(saving||!allowed())return;
 const s=selected(),month=el('pc-month').value;
 if(month<today().slice(0,7))return message('Não é permitido alterar a previsão de meses anteriores.',true);
 if(!window.confirm('Encerrar este benefício a partir de '+month+'? Registros anteriores serão preservados.'))return;
 saving=true;lockWriting();message('');
 try{
  const r=await sb.rpc('retire_package_included_benefit',{p_benefit_id:id,p_from_month:month+'-01'});
  if(r.error)throw r.error;await load(s.vehicle_id);message('Previsão encerrada a partir do mês selecionado. Histórico preservado.');
 }catch(e){message(fail(e),true)}finally{saving=false;lockWriting()}
}
/* Inline view for the existing appointment details dialog. No new navigation. */
window.renderPlanBenefitsForAppointment=async function(ctx){
 if(!allowed())return;
 const box=document.getElementById(ctx.containerId||'dd-plan-benefits');
 if(!box)return;
 window.__v2DetailPlanContext=ctx;
 box.dataset.appointment=ctx.appointmentId;
 box.innerHTML='<div class="item" style="margin-top:10px">Consultando cuidados do plano...</div>';
 const [rp,sub]=await Promise.all([
  sb.rpc('get_client_plan_control',{p_client_id:ctx.clientId,p_month:ctx.month+'-01'}),
  sb.from('package_subscriptions').select('id').eq('recurring_plan_id',ctx.recurringPlanId).maybeSingle()
 ]);
 if(!box.isConnected||box.dataset.appointment!==ctx.appointmentId)return;
 if(rp.error||sub.error)throw rp.error||sub.error;
 const s=(rp.data?.subscriptions||[]).find(x=>x.id===sub.data?.id&&x.vehicle_id===ctx.vehicleId);
 if(!s){box.innerHTML='<div class="item" style="margin-top:10px">Não foi encontrado plano contratado para esta competência.</div>';return}
 const br=await sb.from('package_included_benefits').select('id,subscription_id,service_label,frequency,monthly_quantity,effective_from_month,retired_from_month').eq('subscription_id',s.id);
 if(!box.isConnected||box.dataset.appointment!==ctx.appointmentId)return;
 if(br.error)throw br.error;
 const previousConfigs=benefitConfigs;
 benefitConfigs=br.data||[];
 const markup=benefitsHtml(s,ctx.month,false);
 const doneHere=(s.services||[]).filter(x=>x.appointment_id===ctx.appointmentId);
 const thisAppointment='<div class="item" style="margin-top:10px"><b>Cuidados vinculados a este atendimento</b><div class="meta">'+(doneHere.length?doneHere.map(x=>esc(x.label)+' • '+esc(dateLabel(x.date))).join('<br>'):'Nenhum benefício registrado especificamente nesta estética. Confira o histórico mensal acima.')+'</div></div>';
 benefitConfigs=previousConfigs;
 const quantity=s.limit_visits===null||s.limit_visits===undefined?'Previsão mensal não registrada':s.completed+' de '+s.limit_visits+' estéticas concluídas';
 box.innerHTML='<div><div class="item" style="margin-top:10px"><b>Controle do plano • '+esc(ctx.month.split('-').reverse().join('/'))+'</b><div class="meta">'+esc(quantity)+'</div></div>'+markup+thisAppointment+'<div class="actions" style="margin-top:10px"><button type="button" class="ghost" data-detail-open-benefits>Consultar / registrar cuidados</button></div></div>';
 const b=box.querySelector('[data-detail-open-benefits]');
 if(b)b.onclick=()=>window.openPlanControl(ctx.clientId,ctx.vehicleId,ctx.month);
};

async function voidRecord(id){
 if(saving||!allowed())return;
 const reason=window.prompt('Motivo da anulação (mínimo 6 caracteres):');if(reason===null)return;if(reason.trim().length<6)return message('Informe o motivo da anulação com pelo menos 6 caracteres.',true);
 saving=true;lockWriting();
 try{const r=await sb.rpc('void_package_service',{p_event_id:id,p_reason:reason.trim()});if(r.error)throw r.error;await load(selected()?.vehicle_id||'');message('Registro anulado. O histórico de auditoria foi preservado.')}catch(e){message(fail(e),true)}finally{saving=false;lockWriting()}
}

/* Automatic, read-only operational overview; does not change bookings or charges. */
function briefDate(d){return d?dateLabel(d):'—'}
function operationalBenefitLines(definitions,events,visitsLimit){
 const used=new Set();
 const rows=(definitions||[]).map(b=>{
  const performed=(events||[]).filter(x=>keyName(x.label)===keyName(b.label));
  performed.forEach(x=>used.add(x.id));
  const expected=b.frequency==='per_visit'?visitsLimit:Number(b.quantity||1);
  const complete=expected===null||expected===undefined?'A conferir':
   performed.length>expected?'Acima do previsto':
   performed.length===expected?'Realizado':'Pendente';
  return {label:b.label,expected,performed,complete};
 });
 return {rows,other:(events||[]).filter(x=>!used.has(x.id))};
}
function briefHtml(d,hideAppointmentNotes=false){
 if(d?.is_plan&&window.VaporeasyCareUI?.brief)return window.VaporeasyCareUI.brief(d,hideAppointmentNotes);
 const names=(d.recent_visits||[]).map(x=>briefDate(x.date));
 const notes=[!hideAppointmentNotes&&d.appointment_notes?'<div class="meta" style="margin-top:7px"><b>Observações de hoje:</b> '+esc(d.appointment_notes)+'</div>':'',
 d.vehicle_notes?'<div class="meta" style="margin-top:7px"><b>Cuidados e observações do veículo:</b> '+esc(d.vehicle_notes)+'</div>':''].join('');
 const recent=names.length?'<div class="meta" style="margin-top:7px"><b>Últimos atendimentos:</b> '+esc(names.slice(0,4).join(' • '))+'</div>':
 '<div class="meta" style="margin-top:7px">Nenhum atendimento concluído localizado.</div>';
 if(!d.is_plan)return '<div class="item" style="margin-top:10px"><b>Resumo do veículo</b>'+recent+notes+
 '<div class="meta" style="margin-top:7px">Sem plano contratado vinculado a este agendamento. Recorrência simples não recebe benefícios de plano.</div></div>';
 const {rows,other}=operationalBenefitLines(d.benefits,d.performed,d.visits_limit);
 const limit=d.visits_limit===null||d.visits_limit===undefined?'previstas a confirmar':(d.visits||[]).length+' de '+d.visits_limit+' concluídas';
 const visits=(d.visits||[]).map(v=>briefDate(v.date));
 const benefitView=rows.length?rows.map(b=>{
  const count=b.expected===null||b.expected===undefined?b.performed.length+' realizado(s)':b.performed.length+' de '+b.expected;
  return '<div class="meta" style="margin-top:7px"><b>'+esc(b.label)+'</b> • '+esc(b.complete)+' ('+esc(count)+')'+
  (b.performed.length?'<div>'+esc(b.performed.map(x=>briefDate(x.date)).join(' • '))+'</div>':'')+'</div>';
 }).join(''):'<div class="meta" style="margin-top:7px">Benefícios previstos ainda não foram especificados para este veículo.</div>';
 const recordedOther=other.length?'<div class="meta" style="margin-top:7px"><b>Outros cuidados registrados:</b> '+
 other.map(x=>esc(x.label)+' • '+esc(briefDate(x.date))).join(' | ')+'</div>':'';
 return '<div class="item" style="margin-top:10px"><b>Cuidados deste veículo • '+esc(String(d.plan_name||'Plano Vaporeasy').replace(/^Pacote\s+/i,'Plano '))+'</b>'+
 '<div class="meta" style="margin-top:7px"><b>Estéticas do mês:</b> '+esc(limit)+
 (visits.length?'<div>Executadas em: '+esc(visits.slice(0,6).join(' • '))+'</div>':'')+'</div>'+
 '<div style="margin-top:9px"><b>Benefícios do plano</b>'+benefitView+recordedOther+'</div>'+recent+notes+'</div>';
}
window.refreshPlanControl=load;
window.renderQuickPlanCare=async function(appointmentId,elementId){
 const node=document.getElementById(elementId);if(!node)return;
 node.dataset.careRequest=appointmentId;
 node.innerHTML='<div class="meta" style="margin-top:7px">Consultando histórico e cuidados...</div>';
 try{
  const r=await sb.rpc('appointment_care_brief',{p_appointment_id:appointmentId});
  if(!node.isConnected||node.dataset.careRequest!==appointmentId)return;
  if(r.error)throw r.error;
  node.innerHTML=briefHtml(r.data||{},!!node.closest('.operator-job'));
 }catch(err){
  if(node.isConnected&&node.dataset.careRequest===appointmentId)
   node.innerHTML='<div class="notice error">Não foi possível consultar os cuidados: '+esc(fail(err))+'</div>';
 }
};
/* Single client read and three small batched queries, not one query per vehicle. */
window.renderClientVehicleCare=async function(clientId){
 if(!allowed())return;
 const root=document.getElementById('v-'+clientId);
 if(!root||root.classList.contains('hidden'))return;
 const slots=[...root.querySelectorAll('[data-care-vehicle]')],month=today().slice(0,7);
 if(!slots.length)return;
 const requestId=String(Date.now())+':'+clientId;
 root.dataset.careRequest=requestId;
 slots.forEach(node=>{node.innerHTML='<div class="meta">Consultando cuidados...</div>'});
 try{
  const ps=await sb.rpc('get_client_plan_control',{p_client_id:clientId,p_month:month+'-01'});
  if(ps.error)throw ps.error;
  const plans=ps.data?.subscriptions||[],ids=plans.map(x=>x.id),vehicleIds=slots.map(x=>x.dataset.careVehicle);
  const [br,vis,pr,hist]=await Promise.all([
   ids.length?sb.from('package_included_benefits').select(
    'subscription_id,service_label,frequency,monthly_quantity,effective_from_month,retired_from_month,cadence_min_days,cadence_max_days,every_n_visits'
   ).in('subscription_id',ids):{data:[],error:null},
   sb.from('appointments').select('vehicle_id,starts_at,notes').eq('client_id',clientId)
    .eq('status','completed').is('deleted_at',null).order('starts_at',{ascending:false}).limit(180),
   sb.from('vehicle_profiles').select('vehicle_id,notes').in('vehicle_id',vehicleIds),
   ids.length?sb.from('package_service_events')
    .select('subscription_id,performed_on,service_label,appointment_id').in('subscription_id',ids)
    .is('voided_at',null).lte('performed_on',today()).order('performed_on',{ascending:false}).limit(700)
    :{data:[],error:null}
  ]);
  if(!root.isConnected||root.classList.contains('hidden')||root.dataset.careRequest!==requestId)return;
  for(const r of [br,vis,pr,hist])if(r.error)throw r.error;
  const notes=new Map((pr.data||[]).map(x=>[x.vehicle_id,x.notes||'']));
  slots.forEach(node=>{
   const vehicleId=node.dataset.careVehicle,found=plans.filter(p=>p.vehicle_id===vehicleId);
   const visits=(vis.data||[]).filter(x=>x.vehicle_id===vehicleId)
    .map(x=>({date:spDateTime(x.starts_at).date}));
   const preview=visits.slice(0,4);
   const last=preview.length?'<div class="meta" style="margin-top:7px"><b>Últimas estéticas:</b> '+
     esc(preview.map(x=>dateLabel(x.date)).join(' • '))+'</div>':
     '<div class="meta">Nenhuma estética concluída localizada.</div>';
   const planLines=found.map(p=>{
    const defs=(br.data||[]).filter(x=>x.subscription_id===p.id&&x.effective_from_month.slice(0,7)<=month&&
     (!x.retired_from_month||x.retired_from_month.slice(0,7)>month)).map(x=>({
      label:x.service_label,frequency:x.frequency,quantity:x.monthly_quantity,
      min_days:x.cadence_min_days,max_days:x.cadence_max_days,every_n_visits:x.every_n_visits
     }));
    const history=(hist.data||[]).filter(x=>x.subscription_id===p.id)
     .map(x=>({date:x.performed_on,label:x.service_label,appointment_id:x.appointment_id}));
    const title='<div class="meta"><b>'+esc(p.plan.replace(/^Pacote\s+/i,'Plano '))+'</b> • '+
      esc(p.limit_visits===null||p.limit_visits===undefined?p.completed+' estéticas, limite a confirmar':
        p.completed+' de '+p.limit_visits+' estéticas concluídas no mês')+'</div>';
    const care=window.VaporeasyCareUI?.brief?.({
      is_plan:true,plan_name:p.plan,benefits:defs,care_history:history,visit_history:visits,
      visit_date:today(),vehicle_notes:notes.get(vehicleId)||''
    },true)||'<div class="meta">Cuidados indisponíveis.</div>';
    return title+care;
   }).join('');
   const observation=notes.get(vehicleId)?'<div class="meta" style="margin-top:8px"><b>Observações do veículo:</b> '+esc(notes.get(vehicleId))+'</div>':'';
   node.innerHTML='<div class="item" style="margin:6px 0 12px;padding:12px"><b>Resumo do veículo</b>'+
    (found.length?planLines:'<div class="meta" style="margin-top:6px">Sem plano contratado neste mês. A recorrência simples não concede benefícios do plano.</div>'+last+observation)+'</div>';
  });
 }catch(err){
  if(root.isConnected&&root.dataset.careRequest===requestId)
   slots.forEach(node=>node.innerHTML='<div class="notice error">Não foi possível consultar os cuidados: '+esc(fail(err))+'</div>');
 }
};

})();
