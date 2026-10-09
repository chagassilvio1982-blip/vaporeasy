/* Internal plan usage and included-service history. Does not create charges. */
(function(){
'use strict';
let clientId='',data=[],sequence=0,requestKey='',saving=false;
const el=id=>document.getElementById(id),allowed=()=>['owner','admin'].includes(currentRole);
function dateLabel(date){return String(date||'').slice(0,10).split('-').reverse().join('/')}
function ensureDialog(){
 if(el('plancontrol'))return;
 const d=document.createElement('dialog');d.id='plancontrol';d.setAttribute('aria-label','Controle dos planos');
 d.innerHTML='<div class="stack"><div class="actions"><h3 id="pc-title" style="flex:3;margin:8px 0">Controle dos planos</h3><button id="pc-close" type="button" class="ghost">Fechar</button></div><div id="pc-msg" class="notice hidden" role="status"></div><label>Mês do plano<input id="pc-month" type="month"></label><label>Veículo e plano<select id="pc-sub"></select></label><div id="pc-summary"></div><div id="pc-body" class="hidden"><h3>Serviços efetuados no plano</h3><div id="pc-history"></div><details id="pc-register"><summary style="cursor:pointer;padding:12px;font-weight:850">+ Registrar serviço incluído</summary><form id="pc-form" class="stack" style="padding-top:12px"><div class="notice">Registra um benefício realizado, sem cobrança adicional. A contagem de estéticas vem dos atendimentos concluídos na agenda.</div><label>Serviço<select id="pc-kind"><option>Aplicação de hidrorrepelente</option><option>Enceramento manual</option><option>Hidratação do couro</option><option>Higienização dos bancos</option><option>Tratamento do couro</option><option value="other">Outro serviço incluído</option></select></label><label id="pc-custom-wrap" class="hidden">Nome do serviço<input id="pc-custom" maxlength="120"></label><label>Vincular a uma estética concluída<select id="pc-appt"><option value="">Registro independente</option></select></label><label>Data da execução<input id="pc-date" type="date" required></label><label>Observações<textarea id="pc-notes" maxlength="2000"></textarea></label><button id="pc-save" type="submit" class="primary">Salvar serviço realizado</button></form></details></div></div>';
 document.body.appendChild(d);
 el('pc-close').onclick=()=>d.close();el('pc-month').onchange=()=>load();el('pc-sub').onchange=render;
 el('pc-kind').onchange=()=>{const custom=el('pc-kind').value==='other';el('pc-custom-wrap').classList.toggle('hidden',!custom);el('pc-custom').required=custom;requestKey=''};
 el('pc-appt').onchange=()=>{const s=selected(),a=(s?.visits||[]).find(x=>x.id===el('pc-appt').value);if(a)el('pc-date').value=a.date;requestKey=''};
 el('pc-form').onsubmit=save;
 ['pc-date','pc-custom','pc-notes'].forEach(id=>el(id).addEventListener('input',()=>{if(!saving)requestKey=''}));
}
function lockWriting(){
 ['pc-month','pc-sub','pc-kind','pc-custom','pc-appt','pc-date','pc-notes'].forEach(id=>el(id).disabled=saving||(id==='pc-sub'&&!data.length));
 el('pc-save').disabled=saving||!selected()||el('pc-date').min>el('pc-date').max;
 el('pc-history').querySelectorAll('[data-pc-void]').forEach(b=>b.disabled=saving);
}
function selected(){return data.find(s=>s.id===el('pc-sub').value)}
window.openPlanControl=async function(id,vehicleId=''){
 if(saving)return;
 if(!allowed())return show('msg','Seu perfil não pode consultar os planos.','error');
 ensureDialog();clientId=id;data=[];el('pc-sub').innerHTML='';el('pc-summary').innerHTML='';el('pc-body').classList.add('hidden');
 const c=clients.find(x=>x.id===id);el('pc-title').textContent='Planos • '+(c?.name||'Cliente');
 el('pc-month').value=today().slice(0,7);el('pc-month').max=today().slice(0,7);el('plancontrol').showModal();await load(vehicleId);
};
function message(text,error=false){const b=el('pc-msg');b.textContent=text;b.className='notice'+(error?' error':'')+(text?'':' hidden')}
async function load(vehicleId=''){
 const token=++sequence,month=el('pc-month').value,previous=el('pc-sub').value;
 el('pc-body').classList.add('hidden');el('pc-summary').textContent='Consultando plano...';el('pc-sub').disabled=true;message('');
 if(!/^\d{4}-\d{2}$/.test(month)){el('pc-summary').textContent='Selecione o mês.';return}
 try{
  const r=await sb.rpc('get_client_plan_control',{p_client_id:clientId,p_month:month+'-01'});if(token!==sequence)return;if(r.error)throw r.error;
  data=r.data?.subscriptions||[];
  el('pc-sub').innerHTML=data.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.vehicle+(s.plate?' • '+s.plate:'')+' • '+s.plan+(!s.active?' • histórico':''))+'</option>').join('');
  const chosen=data.find(s=>s.vehicle_id===vehicleId)||data.find(s=>s.id===previous)||data[0];
  if(chosen)el('pc-sub').value=chosen.id;
  el('pc-sub').disabled=!data.length;render();
 }catch(e){if(token===sequence){data=[];el('pc-sub').innerHTML='';el('pc-summary').textContent='Não foi possível consultar o plano.';message(fail(e),true)}}
}
function render(){
 const s=selected();requestKey='';el('pc-register').open=false;
 if(!s){el('pc-summary').innerHTML='<div class="empty">Nenhum plano registrado para este cliente neste mês.</div>';el('pc-body').classList.add('hidden');return}
 const known=s.limit_visits!==null&&s.limit_visits!==undefined,limit=Number(s.limit_visits||0),done=Number(s.completed||0),scheduled=Number(s.scheduled||0),remaining=Math.max(0,limit-done),extra=Math.max(0,done-limit);
 el('pc-summary').innerHTML='<div class="item"><h3>'+esc(s.plan)+'</h3><div class="meta">'+esc(s.vehicle)+' • '+esc(el('pc-month').value.split('-').reverse().join('/'))+'</div><div style="font-size:23px;font-weight:900;margin:12px 0">'+done+(known?' de '+limit:'')+' estéticas concluídas</div><div class="meta">'+(known?remaining+' restante'+(remaining===1?'':'s')+' no mês':'Limite deste mês não registrado')+' • '+scheduled+' agendada'+(scheduled===1?'':'s')+'</div>'+(known&&extra?'<div class="notice" style="margin-top:10px">'+extra+' estética'+(extra===1?'':'s')+' acima da quantidade contratada. Confira o histórico.</div>':'')+(s.limit_source==='current_contract'?'<div class="meta" style="margin-top:8px">Quantidade de referência do contrato atual.</div>':'')+'</div>';
 const history=[...(s.visits||[]).map(v=>({...v,label:'Estética do plano',kind:'visit',notes:''})),...(s.services||[]).map(v=>({...v,kind:'benefit'}))].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
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
  requestKey='';await load();message('Serviço realizado registrado no plano, sem cobrança adicional.');
 }catch(err){message(fail(err),true)}finally{saving=false;lockWriting()}
}
async function voidRecord(id){
 if(saving||!allowed())return;
 const reason=window.prompt('Motivo da anulação (mínimo 6 caracteres):');if(reason===null)return;if(reason.trim().length<6)return message('Informe o motivo da anulação com pelo menos 6 caracteres.',true);
 saving=true;lockWriting();
 try{const r=await sb.rpc('void_package_service',{p_event_id:id,p_reason:reason.trim()});if(r.error)throw r.error;await load();message('Registro anulado. O histórico de auditoria foi preservado.')}catch(e){message(fail(e),true)}finally{saving=false;lockWriting()}
}
})();
