/* Vaporeasy — v172
   1) Registrar serviços já realizados em sequência, sem precisar voltar de tela.
   2) Importar contatos selecionados do celular para Clientes.
   3) Selecionar vários clientes e preparar uma fila de mensagens no WhatsApp.
   Compatível com a chamada já existente no index.html:
   <script src="./vaporeasy_fix_v171_registrar_servico_realizado.js?v=171"></script>
*/
(function(){
  'use strict';
  if(window.__vpV172Installed)return;
  window.__vpV172Installed=true;

  const BUILD='v172-realizado-contatos-mensagens-2026-09-24';
  const CLIENTS_KEY=(typeof STORAGE_CLIENTS!=='undefined'?STORAGE_CLIENTS:'vaporeasy_clients_v1');
  let realizedSaving=false;
  let lastAutoPrice='';
  let bulkQueue=[];
  let bulkIndex=0;

  function profile(){try{return window.vpGetCurrentProfile?.()||null}catch(_){return null}}
  function role(){return String(profile()?.role||'')}
  function canOperate(){const r=role();return !r||['owner','admin','operator'].includes(r)}
  function canBulk(){const r=role();return !r||['owner','admin','operator'].includes(r)}
  function escV(v){
    try{if(typeof esc==='function')return esc(v)}catch(_){}
    return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function norm(v){
    try{if(typeof normalizeText==='function')return normalizeText(v||'')}catch(_){}
    try{return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}catch(_){return String(v||'').trim().toLowerCase()}
  }
  function plate(v){
    try{if(typeof cleanPlate==='function')return cleanPlate(v||'')}catch(_){}
    return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  }
  function phoneDigits(v){return String(v||'').replace(/\D/g,'')}
  function waNumber(v){
    let n=phoneDigits(v).replace(/^0+/,'');
    if(!n)return '';
    if(n.startsWith('55') && n.length>=12)return n;
    if((n.length===10||n.length===11))return '55'+n;
    return n;
  }
  function getClientsSafe(){try{return typeof getClients==='function'?(getClients()||[]):[]}catch(_){return []}}
  function getVehiclesSafe(){try{return typeof getVehicles==='function'?(getVehicles()||[]):[]}catch(_){return []}}
  function getServicesSafe(){try{return typeof getServiceCatalog==='function'?(getServiceCatalog()||[]):[]}catch(_){return []}}
  function getCollabsSafe(){try{return typeof getCollaborators==='function'?(getCollaborators()||[]):[]}catch(_){return []}}
  function today(){
    try{if(typeof agendaLocalToday==='function')return agendaLocalToday()}catch(_){}
    const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function nowClock(){const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
  function toast(msg,type='success'){try{showToast?.(msg,type)}catch(_){}}
  function writeClients(rows){
    if(typeof writeStore==='function')writeStore(CLIENTS_KEY,rows);
    else localStorage.setItem(CLIENTS_KEY,JSON.stringify(rows||[]));
    try{updateClientSuggestions?.()}catch(_){}
    try{window.vpSecureSchedule?.()}catch(_){}
  }
  function managerNotice(text,ok=true){
    const e=document.getElementById('clienteManageStatus');
    if(!e)return;
    e.classList.remove('hidden');e.textContent=text;e.style.display='block';
    e.dataset.kind=ok?'ok':'err';
  }

  function installStyle(){
    if(document.getElementById('vp-v172-style'))return;
    const s=document.createElement('style');s.id='vp-v172-style';
    s.textContent=`
      #agendaRegisterRealizedBtn{border-color:rgba(31,190,126,.42)!important;background:rgba(19,109,77,.18)!important;color:#caffdf!important}
      body.vp-role-collaborator #agendaRegisterRealizedBtn,
      body.vp-role-collaborator #vp172ImportContactsBtn,
      body.vp-role-collaborator #vp172BulkBtn{display:none!important}
      .vp172-backdrop{position:fixed;inset:0;z-index:1900;display:none;align-items:flex-end;justify-content:center;padding:14px;background:rgba(0,8,14,.82)}
      .vp172-backdrop.show{display:flex}
      .vp172-sheet{width:min(600px,100%);max-height:92vh;overflow:auto;background:#071c29;border:1px solid rgba(35,183,238,.3);border-radius:22px;padding:18px;box-shadow:0 24px 72px rgba(0,0,0,.58)}
      .vp172-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
      .vp172-head h3{margin:0;color:#fff;font-size:20px}.vp172-head p{margin:5px 0 0;color:#8eacbd;font-size:11px;line-height:1.45}
      .vp172-close{width:38px;height:38px;padding:0!important;border-radius:50%!important;background:#102d3e!important;color:#fff!important;font-size:22px!important}
      .vp172-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.vp172-grid .full{grid-column:1/-1}
      .vp172-grid label,.vp172-field-label{display:block;margin:0 0 5px;color:#a8c1cf;font-size:11px;font-weight:700}
      .vp172-help{margin:10px 0 0;padding:10px 11px;border-radius:12px;border:1px solid rgba(30,174,240,.15);background:rgba(30,174,240,.05);color:#90adbc;font-size:11px;line-height:1.45}
      .vp172-msg{display:none;margin-top:10px;padding:9px 10px;border-radius:10px;font-size:11px;line-height:1.4}
      .vp172-msg.err{display:block;background:rgba(225,80,90,.09);border:1px solid rgba(225,80,90,.28);color:#ffc2c7}
      .vp172-msg.ok{display:block;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);color:#baf3cf}
      .vp172-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}.vp172-actions button{min-width:130px}
      .vp172-client-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      #vp172ImportContactsBtn,#vp172BulkBtn{white-space:nowrap}
      .vp172-contact-result{display:grid;gap:8px;max-height:46vh;overflow:auto;margin-top:10px}
      .vp172-contact-row,.vp172-bulk-row{display:grid;grid-template-columns:28px minmax(0,1fr);gap:9px;align-items:center;padding:10px;border:1px solid rgba(123,197,235,.13);border-radius:12px;background:rgba(255,255,255,.025)}
      .vp172-contact-row input,.vp172-bulk-row input{width:18px;height:18px}
      .vp172-contact-row strong,.vp172-bulk-row strong{display:block;color:#fff;font-size:13px}.vp172-contact-row small,.vp172-bulk-row small{display:block;color:#88a7b8;margin-top:2px}
      .vp172-bulk-tools{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.vp172-bulk-tools button{min-height:36px;padding:7px 10px!important}
      #vp172BulkList{display:grid;gap:7px;max-height:36vh;overflow:auto;margin-top:9px}
      .vp172-queue-card{margin-top:12px;padding:14px;border-radius:15px;border:1px solid rgba(48,196,133,.25);background:rgba(24,102,72,.10)}
      .vp172-queue-card strong{display:block;color:#fff}.vp172-queue-card small{display:block;color:#94b1c0;margin-top:4px}.vp172-queue-message{margin-top:10px;padding:10px;border-radius:11px;background:rgba(0,0,0,.16);color:#dcecf4;font-size:12px;line-height:1.45;white-space:pre-wrap}
      .vp172-counter{font-size:11px;color:#8caabd;margin-top:6px}
      @media(max-width:520px){.vp172-grid{grid-template-columns:1fr}.vp172-grid .full{grid-column:auto}.vp172-sheet{border-radius:19px}.vp172-actions{display:grid;grid-template-columns:1fr}.vp172-actions button{min-width:0}.vp172-client-actions>*{flex:1}}
    `;
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // 1) SERVIÇO JÁ REALIZADO — fluxo consecutivo
  // ---------------------------------------------------------------------------
  function realizedMsg(text,ok=false){
    const e=document.getElementById('vp172RealizedMsg');if(!e)return;
    e.textContent=text||'';e.className='vp172-msg '+(text?(ok?'ok':'err'):'');e.style.display=text?'block':'none';
  }
  function servicePrice(name){
    const s=getServicesSafe().find(x=>norm(x?.name)===norm(name));
    return Number(s?.price??s?.value??0)||0;
  }
  function installRealizedButton(){
    const actions=document.querySelector('#agenda .agenda-view-actions');if(!actions)return;
    const old=document.getElementById('agendaRegisterRealizedBtn');
    if(old)old.remove();
    const b=document.createElement('button');
    b.id='agendaRegisterRealizedBtn';b.type='button';b.className='agenda-view-btn';
    b.textContent='✓ Registrar serviço já realizado';
    b.addEventListener('click',()=>window.vp172OpenRealized?.());
    actions.appendChild(b);
  }
  function installRealizedModal(){
    if(document.getElementById('vp172RealizedModal'))return;
    const d=document.createElement('div');d.id='vp172RealizedModal';d.className='vp172-backdrop';d.setAttribute('aria-hidden','true');
    d.innerHTML=`
      <div class="vp172-sheet" role="dialog" aria-modal="true" aria-label="Registrar serviço já realizado">
        <div class="vp172-head"><div><h3>Registrar serviço já realizado</h3><p>Lance atendimentos passados sem precisar sair e entrar novamente entre um carro e outro.</p></div><button class="vp172-close" type="button" data-vp172-realized-close>×</button></div>
        <div class="vp172-grid">
          <div class="full"><label>Cliente</label><select id="vp172RealizedClient"></select></div>
          <div class="full"><label>Veículo</label><select id="vp172RealizedVehicle"></select></div>
          <div class="full"><label>Serviço realizado</label><select id="vp172RealizedService"></select></div>
          <div><label>Data do serviço</label><input id="vp172RealizedDate" type="date"></div>
          <div><label>Horário</label><input id="vp172RealizedTime" type="time" step="60"></div>
          <div><label>Equipe / colaborador</label><select id="vp172RealizedCollaborator"></select></div>
          <div><label>Valor (R$)</label><input id="vp172RealizedValue" type="number" min="0" step="0.01" inputmode="decimal"></div>
          <div class="full"><label>Observações</label><textarea id="vp172RealizedNotes" rows="3" placeholder="Opcional"></textarea></div>
        </div>
        <div class="vp172-help">Ao registrar, o atendimento entra como <b>Concluído</b> e o valor fica <b>pendente de recebimento</b> no Financeiro. Use “Registrar e continuar” para lançar o próximo carro sem voltar de tela.</div>
        <div id="vp172RealizedMsg" class="vp172-msg"></div>
        <div class="vp172-actions">
          <button type="button" class="btn-ghost" data-vp172-realized-close>Cancelar</button>
          <button id="vp172RealizedSaveContinue" type="button" class="btn-green">Registrar e continuar</button>
          <button id="vp172RealizedSaveClose" type="button" class="btn-primary">Registrar e fechar</button>
        </div>
      </div>`;
    document.body.appendChild(d);
    d.addEventListener('click',e=>{if(e.target===d||e.target.closest?.('[data-vp172-realized-close]'))window.vp172CloseRealized?.()});
    d.querySelector('#vp172RealizedClient')?.addEventListener('change',refreshRealizedVehicles);
    d.querySelector('#vp172RealizedService')?.addEventListener('change',refreshRealizedPrice);
    d.querySelector('#vp172RealizedSaveContinue')?.addEventListener('click',()=>window.vp172SaveRealized?.(false));
    d.querySelector('#vp172RealizedSaveClose')?.addEventListener('click',()=>window.vp172SaveRealized?.(true));
  }
  function refreshRealizedClients(){
    const e=document.getElementById('vp172RealizedClient');if(!e)return;
    const current=e.value;
    const rows=getClientsSafe().filter(c=>String(c?.name||'').trim()).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'));
    e.innerHTML='<option value="">Selecione o cliente...</option>'+rows.map(c=>`<option value="${escV(c.name)}">${escV(c.name)}</option>`).join('');
    if(rows.some(c=>String(c.name)===current))e.value=current;
  }
  function refreshRealizedVehicles(){
    const e=document.getElementById('vp172RealizedVehicle');if(!e)return;
    const client=document.getElementById('vp172RealizedClient')?.value||'';
    const current=e.value;
    const rows=getVehiclesSafe().filter(v=>norm(v?.client)===norm(client)&&plate(v?.plate)).sort((a,b)=>String([a.brand,a.model,a.plate].filter(Boolean).join(' ')).localeCompare(String([b.brand,b.model,b.plate].filter(Boolean).join(' ')),'pt-BR'));
    e.innerHTML='<option value="">Selecione o veículo...</option>'+rows.map(v=>{
      const p=plate(v.plate);const label=[v.brand,v.model,p].filter(Boolean).join(' • ');
      return `<option value="${escV(p)}">${escV(label||p)}</option>`;
    }).join('');
    e.disabled=!client||!rows.length;
    if(rows.some(v=>plate(v.plate)===plate(current)))e.value=plate(current);
  }
  function refreshRealizedServices(){
    const e=document.getElementById('vp172RealizedService');if(!e)return;
    const current=e.value;
    const rows=getServicesSafe().filter(s=>s?.name&&!s.disabled).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'));
    e.innerHTML='<option value="">Selecione o serviço...</option>'+rows.map(s=>`<option value="${escV(s.name)}">${escV(s.name)}</option>`).join('');
    if(rows.some(s=>String(s.name)===current))e.value=current;
  }
  function refreshRealizedCollabs(){
    const e=document.getElementById('vp172RealizedCollaborator');if(!e)return;
    const current=e.value;
    const rows=getCollabsSafe().filter(c=>c?.name&&(!c.status||norm(c.status)==='ativo')).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'));
    e.innerHTML='<option value="">Sem colaborador definido</option>'+rows.map(c=>`<option value="${escV(c.name)}">${escV(c.name)}</option>`).join('');
    if(rows.some(c=>String(c.name)===current))e.value=current;
  }
  function refreshRealizedPrice(){
    const service=document.getElementById('vp172RealizedService')?.value||'';
    const input=document.getElementById('vp172RealizedValue');if(!input)return;
    const current=String(input.value||'');
    const price=servicePrice(service);
    if(!current||current===lastAutoPrice){input.value=price?String(price):'';lastAutoPrice=String(input.value||'')}
  }
  function duplicateAppointment(a){
    try{return (getAppointments?.()||[]).some(x=>
      norm(x?.client)===norm(a.client)&&plate(x?.vehicle||x?.plate)===plate(a.vehicle)&&
      String(x?.date||'')===String(a.date)&&String(x?.time||'').slice(0,5)===String(a.time).slice(0,5)&&
      !['cancelado','cancelled','excluido','excluído'].includes(norm(x?.status))
    )}catch(_){return false}
  }
  function fallbackCompletedMirrors(a){
    try{
      if(typeof getServiceHistory==='function'&&typeof setServiceHistory==='function'){
        const h=getServiceHistory();
        if(!h.some(x=>String(x.appointmentId||'')===String(a.id)))h.push({
          id:'hist_'+a.id,appointmentId:String(a.id),client:a.client,vehicle:a.vehicle,service:a.service,date:a.date,time:a.time,
          value:Number(a.finalValue||a.value||0),collaborator:a.collaborator||'',notes:a.notes||'',completedAt:a.completedAt,source:'appointment'
        });
        setServiceHistory(h);
      }
      if(typeof getFinanceTransactions==='function'&&typeof setFinanceTransactions==='function'){
        const f=getFinanceTransactions();
        if(!f.some(x=>String(x.appointmentId||'')===String(a.id)&&x.source==='appointment'))f.push({
          id:'tx_'+a.id,appointmentId:String(a.id),date:a.date,type:'Entrada',tipo:'Entrada',category:'Serviço realizado',
          description:[a.service,a.client,a.vehicle].filter(Boolean).join(' • '),value:Number(a.finalValue||a.value||0),
          client:a.client,vehicle:a.vehicle,service:a.service,source:'appointment',paymentStatus:'Pendente',paymentMethod:'',createdAt:new Date().toISOString()
        });
        setFinanceTransactions(f);
      }
    }catch(e){console.warn('V172 mirrors',e)}
  }
  async function secureSync(){
    try{
      if(typeof window.vpSecureBridge==='function'&&typeof window.buildBridgeSyncBundle==='function'){
        await window.vpSecureBridge('sync',{method:'POST',body:window.buildBridgeSyncBundle()});
        try{await window.vpSecurePullNow?.(false)}catch(_){}
        return true;
      }
      window.vpSecureSchedule?.();return false;
    }catch(e){console.warn('V172 sync',e);try{window.vpSecureSchedule?.()}catch(_){};return false}
  }
  function resetRealizedForNext({keepClient=true,keepDate=true,keepCollaborator=true}={}){
    const client=document.getElementById('vp172RealizedClient');
    const date=document.getElementById('vp172RealizedDate');
    const coll=document.getElementById('vp172RealizedCollaborator');
    const oldClient=keepClient?(client?.value||''):'';
    const oldDate=keepDate?(date?.value||today()):today();
    const oldCollab=keepCollaborator?(coll?.value||''):'';
    refreshRealizedClients();refreshRealizedServices();refreshRealizedCollabs();
    if(client)client.value=oldClient;
    if(date){date.max=today();date.value=oldDate}
    if(coll)coll.value=oldCollab;
    refreshRealizedVehicles();
    ['vp172RealizedVehicle','vp172RealizedService','vp172RealizedValue','vp172RealizedNotes','vp172RealizedTime'].forEach(id=>{
      const e=document.getElementById(id);if(e)e.value='';
    });
    lastAutoPrice='';
    realizedMsg('');
    setTimeout(()=>document.getElementById('vp172RealizedVehicle')?.focus(),60);
  }
  window.vp172OpenRealized=function(){
    if(!canOperate()){toast('Seu nível de acesso não permite registrar serviços realizados.','error');return}
    installRealizedModal();refreshRealizedClients();refreshRealizedServices();refreshRealizedCollabs();
    const date=document.getElementById('vp172RealizedDate'),time=document.getElementById('vp172RealizedTime');
    if(date){date.max=today();if(!date.value)date.value=today()}
    if(time&&!time.value)time.value=nowClock();
    refreshRealizedVehicles();realizedMsg('');
    const m=document.getElementById('vp172RealizedModal');m?.classList.add('show');m?.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  };
  window.vp172CloseRealized=function(){
    if(realizedSaving)return;
    const m=document.getElementById('vp172RealizedModal');m?.classList.remove('show');m?.setAttribute('aria-hidden','true');document.body.style.overflow='';realizedMsg('');
  };
  window.vp172SaveRealized=async function(closeAfter){
    if(realizedSaving)return;
    if(!canOperate()){realizedMsg('Seu nível de acesso não permite registrar este serviço.');return}
    const client=document.getElementById('vp172RealizedClient')?.value||'';
    const vehicle=plate(document.getElementById('vp172RealizedVehicle')?.value||'');
    const service=document.getElementById('vp172RealizedService')?.value||'';
    const date=document.getElementById('vp172RealizedDate')?.value||'';
    const time=String(document.getElementById('vp172RealizedTime')?.value||'').slice(0,5);
    const collaborator=document.getElementById('vp172RealizedCollaborator')?.value||'';
    const value=Number(document.getElementById('vp172RealizedValue')?.value||0);
    const notes=document.getElementById('vp172RealizedNotes')?.value.trim()||'';
    if(!client||!vehicle||!service||!date||!time){realizedMsg('Preencha cliente, veículo, serviço, data e horário.');return}
    if(!Number.isFinite(value)||value<0){realizedMsg('Informe um valor válido.');return}
    const when=new Date(date+'T'+time+':00');
    if(!Number.isFinite(when.getTime())){realizedMsg('Data ou horário inválido.');return}
    if(when.getTime()>Date.now()+60000){realizedMsg('Para serviço já realizado, a data e o horário não podem estar no futuro.');return}
    const iso=new Date().toISOString();
    const a={
      id:'ag_realizado_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),client,vehicle,date,time,service,notes,
      value,discount:0,finalValue:value,status:'Concluído',collaborator,routeOrigin:'',routeDestination:'',travelMinutes:0,travelMargin:0,
      recurring:false,frequency:'',customIntervalDays:0,manualCompleted:true,source:'manual_completed',createdAt:iso,updatedAt:iso,completedAt:iso
    };
    if(duplicateAppointment(a)){realizedMsg('Já existe um atendimento deste veículo neste mesmo horário. Confira a agenda antes de duplicar.');return}
    realizedSaving=true;
    const b1=document.getElementById('vp172RealizedSaveContinue'),b2=document.getElementById('vp172RealizedSaveClose');
    [b1,b2].forEach(b=>{if(b)b.disabled=true});
    try{
      if(typeof setAppointments!=='function')throw new Error('Agenda local indisponível.');
      const rows=typeof getAppointments==='function'?(getAppointments()||[]):[];rows.push(a);setAppointments(rows);
      try{
        if(typeof reconcileCompletedAppointmentRecords==='function')reconcileCompletedAppointmentRecords(a,'','Concluído');
        else fallbackCompletedMirrors(a);
      }catch(e){console.warn('V172 reconcile',e);fallbackCompletedMirrors(a)}
      try{agendaFocusDate=date;agendaCalendarMonth=String(date).slice(0,7);agendaCollabSelected='all'}catch(_){}
      try{renderAppointments?.();renderAgendaTimeline?.();renderRealizedServices?.();renderFinanceiro?.();renderManagementDashboard?.()}catch(_){}
      const synced=await secureSync();
      toast('Serviço realizado registrado.','success');
      if(closeAfter){
        realizedMsg(synced?'Serviço registrado e sincronizado.':'Serviço registrado; sincronização agendada.',true);
        realizedSaving=false;[b1,b2].forEach(b=>{if(b)b.disabled=false});
        setTimeout(()=>{window.vp172CloseRealized?.();try{openAgendaViewMode?.()}catch(_){}},450);
      }else{
        realizedSaving=false;[b1,b2].forEach(b=>{if(b)b.disabled=false});
        resetRealizedForNext({keepClient:true,keepDate:true,keepCollaborator:true});
        realizedMsg(synced?'Salvo. Pode registrar o próximo carro.':'Salvo. Pode registrar o próximo carro; sincronização agendada.',true);
      }
    }catch(e){
      console.error('V172 realized',e);realizedSaving=false;[b1,b2].forEach(b=>{if(b)b.disabled=false});
      realizedMsg('Não foi possível registrar: '+String(e?.message||e||'erro inesperado')+'.');
    }
  };

  // ---------------------------------------------------------------------------
  // 2) IMPORTAR CONTATOS SELECIONADOS
  // ---------------------------------------------------------------------------
  function installClientButtons(){
    const section=document.getElementById('clientes');if(!section)return;
    const head=section.querySelector('.section-head');if(!head)return;
    const actions=head.lastElementChild||head;
    if(!document.getElementById('vp172ImportContactsBtn')){
      const b=document.createElement('button');b.id='vp172ImportContactsBtn';b.type='button';b.className='btn-ghost';b.textContent='📇 Importar contatos';
      b.addEventListener('click',()=>window.vp172PickContacts?.());actions.insertBefore(b,actions.lastElementChild||null);
    }
  }
  function installContactsModal(){
    if(document.getElementById('vp172ContactsModal'))return;
    const d=document.createElement('div');d.id='vp172ContactsModal';d.className='vp172-backdrop';d.setAttribute('aria-hidden','true');
    d.innerHTML=`
      <div class="vp172-sheet" role="dialog" aria-modal="true" aria-label="Importar contatos">
        <div class="vp172-head"><div><h3>Importar contatos</h3><p>Você escolhe no celular quais contatos podem entrar no Vaporeasy.</p></div><button class="vp172-close" type="button" data-vp172-contacts-close>×</button></div>
        <div id="vp172ContactsSummary" class="vp172-help">Nenhum contato selecionado ainda.</div>
        <div id="vp172ContactsList" class="vp172-contact-result"></div>
        <div id="vp172ContactsMsg" class="vp172-msg"></div>
        <div class="vp172-actions">
          <button type="button" class="btn-ghost" data-vp172-contacts-close>Cancelar</button>
          <button id="vp172ContactsConfirm" type="button" class="btn-primary">Importar selecionados</button>
        </div>
      </div>`;
    document.body.appendChild(d);
    d.addEventListener('click',e=>{if(e.target===d||e.target.closest?.('[data-vp172-contacts-close]'))closeContactsModal()});
    d.querySelector('#vp172ContactsConfirm')?.addEventListener('click',importPreviewContacts);
  }
  let contactPreview=[];
  function contactsMsg(text,ok=false){
    const e=document.getElementById('vp172ContactsMsg');if(!e)return;
    e.textContent=text||'';e.className='vp172-msg '+(text?(ok?'ok':'err'):'');e.style.display=text?'block':'none';
  }
  function showContactsModal(rows){
    installContactsModal();contactPreview=rows||[];
    const list=document.getElementById('vp172ContactsList'),sum=document.getElementById('vp172ContactsSummary');
    if(sum)sum.textContent=contactPreview.length+' contato(s) escolhido(s). Desmarque algum se não quiser importar.';
    if(list)list.innerHTML=contactPreview.map((c,i)=>`
      <label class="vp172-contact-row"><input type="checkbox" data-vp172-contact-index="${i}" checked>
        <span><strong>${escV(c.name||'Sem nome')}</strong><small>${escV(c.phone||'Sem telefone')}</small></span>
      </label>`).join('');
    contactsMsg('');
    const m=document.getElementById('vp172ContactsModal');m?.classList.add('show');m?.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  }
  function closeContactsModal(){
    const m=document.getElementById('vp172ContactsModal');m?.classList.remove('show');m?.setAttribute('aria-hidden','true');document.body.style.overflow='';contactsMsg('');contactPreview=[];
  }
  function mergeImportedContacts(selected){
    const rows=getClientsSafe().slice();
    let added=0,updated=0,skipped=0;
    const phoneIndex=()=>new Map(rows.map((c,i)=>[phoneDigits(c.phone||c.telefone||''),i]).filter(([p])=>p));
    let byPhone=phoneIndex();
    for(const item of selected){
      const name=String(item.name||'').trim(),ph=phoneDigits(item.phone||'');
      if(!name||!ph){skipped++;continue}
      let i=byPhone.get(ph);
      if(i===undefined)i=rows.findIndex(c=>norm(c.name)===norm(name));
      if(i>=0){
        const old=rows[i]||{};
        if(!phoneDigits(old.phone||old.telefone||'')){rows[i]={...old,phone:item.phone,updatedAt:new Date().toISOString()};updated++}
        else skipped++;
      }else{
        rows.push({name,phone:item.phone,condo:'',address:'',notes:'Importado dos contatos do celular',source:'contact_picker',updatedAt:new Date().toISOString()});
        added++;byPhone.set(ph,rows.length-1);
      }
    }
    writeClients(rows);
    return {added,updated,skipped};
  }
  async function importPreviewContacts(){
    const chosen=[...document.querySelectorAll('[data-vp172-contact-index]:checked')].map(x=>contactPreview[Number(x.dataset.vp172ContactIndex)]).filter(Boolean);
    if(!chosen.length){contactsMsg('Selecione pelo menos um contato.');return}
    const r=mergeImportedContacts(chosen);
    contactsMsg(`${r.added} novo(s), ${r.updated} atualizado(s) e ${r.skipped} já existente(s).`,true);
    managerNotice(`${r.added} contato(s) importado(s) para Clientes.`,true);
    toast('Contatos importados para o Vaporeasy.','success');
    try{window.vpSecureSchedule?.()}catch(_){}
    setTimeout(closeContactsModal,900);
  }
  window.vp172PickContacts=async function(){
    if(!canOperate()){toast('Seu nível de acesso não permite importar contatos.','error');return}
    if(!window.isSecureContext){toast('A importação de contatos exige acesso seguro (HTTPS).','error');return}
    if(!('contacts' in navigator)||typeof navigator.contacts?.select!=='function'){
      toast('Este navegador não oferece o seletor de contatos. Abra o Vaporeasy no Chrome do Android.','error');return;
    }
    try{
      const supported=typeof navigator.contacts.getProperties==='function'?await navigator.contacts.getProperties():['name','tel'];
      const props=['name','tel'].filter(p=>supported.includes(p));
      if(!props.includes('tel'))throw new Error('O navegador não liberou acesso aos telefones.');
      const picked=await navigator.contacts.select(props,{multiple:true});
      const rows=(picked||[]).map(c=>{
        const name=Array.isArray(c.name)?(c.name[0]||''):(c.name||'');
        const tel=Array.isArray(c.tel)?(c.tel[0]||''):(c.tel||'');
        return {name:String(name||'').trim(),phone:String(tel||'').trim()};
      }).filter(c=>c.name&&phoneDigits(c.phone));
      if(!rows.length){toast('Nenhum contato com nome e telefone foi selecionado.','error');return}
      showContactsModal(rows);
    }catch(e){
      const msg=String(e?.message||e||'');
      if(/cancel|abort/i.test(msg))return;
      toast('Não foi possível abrir os contatos: '+msg,'error');
    }
  };

  // ---------------------------------------------------------------------------
  // 3) MENSAGEM PARA VÁRIOS CLIENTES — fila segura de WhatsApp
  // ---------------------------------------------------------------------------
  function installBulkButton(){
    const section=document.getElementById('comercial');if(!section)return;
    const head=section.querySelector('.section-head');if(!head)return;
    if(!document.getElementById('vp172BulkBtn')){
      const b=document.createElement('button');b.id='vp172BulkBtn';b.type='button';b.className='btn-primary';b.textContent='📣 Mensagem para vários';
      b.addEventListener('click',()=>window.vp172OpenBulk?.());
      const back=head.querySelector('button[onclick*="voltarParaResumo"]');
      if(back)head.insertBefore(b,back);else head.appendChild(b);
    }
  }
  function installBulkModal(){
    if(document.getElementById('vp172BulkModal'))return;
    const d=document.createElement('div');d.id='vp172BulkModal';d.className='vp172-backdrop';d.setAttribute('aria-hidden','true');
    d.innerHTML=`
      <div class="vp172-sheet" role="dialog" aria-modal="true" aria-label="Mensagem para vários clientes">
        <div class="vp172-head"><div><h3>Mensagem para vários clientes</h3><p>Selecione os clientes, escreva uma vez e siga a fila de envio no WhatsApp.</p></div><button class="vp172-close" type="button" data-vp172-bulk-close>×</button></div>
        <label class="vp172-field-label">Buscar cliente</label><input id="vp172BulkSearch" type="search" placeholder="Nome ou telefone">
        <div class="vp172-bulk-tools"><button type="button" class="btn-ghost" id="vp172BulkSelectAll">Selecionar visíveis</button><button type="button" class="btn-ghost" id="vp172BulkClear">Limpar seleção</button></div>
        <div id="vp172BulkList"></div>
        <div class="vp172-counter" id="vp172BulkCounter">0 selecionado(s)</div>
        <label class="vp172-field-label" style="margin-top:12px">Mensagem</label>
        <textarea id="vp172BulkText" rows="5" placeholder="Ex.: Olá, {nome}! Tudo bem? Temos horários disponíveis para cuidar do seu carro esta semana."></textarea>
        <div class="vp172-help">Use <b>{nome}</b> para inserir automaticamente o primeiro nome do cliente. Selecione somente clientes que autorizaram receber mensagens da Vaporeasy no WhatsApp.</div>
        <div id="vp172BulkMsg" class="vp172-msg"></div>
        <div id="vp172BulkQueue" class="vp172-queue-card" style="display:none"></div>
        <div class="vp172-actions">
          <button type="button" class="btn-ghost" data-vp172-bulk-close>Fechar</button>
          <button id="vp172BulkStart" type="button" class="btn-primary">Iniciar fila de envio</button>
        </div>
      </div>`;
    document.body.appendChild(d);
    d.addEventListener('click',e=>{if(e.target===d||e.target.closest?.('[data-vp172-bulk-close]'))closeBulk()});
    d.querySelector('#vp172BulkSearch')?.addEventListener('input',renderBulkClients);
    d.querySelector('#vp172BulkSelectAll')?.addEventListener('click',()=>{
      document.querySelectorAll('#vp172BulkList [data-vp172-bulk-client]').forEach(x=>x.checked=true);updateBulkCounter();
    });
    d.querySelector('#vp172BulkClear')?.addEventListener('click',()=>{
      document.querySelectorAll('#vp172BulkList [data-vp172-bulk-client]').forEach(x=>x.checked=false);updateBulkCounter();
    });
    d.querySelector('#vp172BulkStart')?.addEventListener('click',startBulkQueue);
  }
  function bulkMsg(text,ok=false){
    const e=document.getElementById('vp172BulkMsg');if(!e)return;
    e.textContent=text||'';e.className='vp172-msg '+(text?(ok?'ok':'err'):'');e.style.display=text?'block':'none';
  }
  function bulkEligibleClients(){
    return getClientsSafe().filter(c=>phoneDigits(c?.phone||c?.telefone||c?.whatsapp||'')).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  }
  function renderBulkClients(){
    const list=document.getElementById('vp172BulkList');if(!list)return;
    const q=norm(document.getElementById('vp172BulkSearch')?.value||'');
    const rows=bulkEligibleClients().filter(c=>!q||norm([c.name,c.phone,c.telefone].join(' ')).includes(q));
    list.innerHTML=rows.length?rows.map(c=>{
      const p=c.phone||c.telefone||c.whatsapp||'';
      const key=encodeURIComponent(String(c.name||'')+'|'+String(p));
      return `<label class="vp172-bulk-row"><input type="checkbox" data-vp172-bulk-client="${key}"><span><strong>${escV(c.name||'Cliente')}</strong><small>${escV(p)}</small></span></label>`;
    }).join(''):'<div class="vp172-help">Nenhum cliente com telefone encontrado.</div>';
    list.querySelectorAll('[data-vp172-bulk-client]').forEach(x=>x.addEventListener('change',updateBulkCounter));
    updateBulkCounter();
  }
  function updateBulkCounter(){
    const n=document.querySelectorAll('#vp172BulkList [data-vp172-bulk-client]:checked').length;
    const e=document.getElementById('vp172BulkCounter');if(e)e.textContent=n+' selecionado(s)';
  }
  function personalizeBulk(template,name){
    const first=String(name||'cliente').trim().split(/\s+/)[0]||'cliente';
    return String(template||'').replace(/\{nome\}/gi,first);
  }
  function startBulkQueue(){
    const text=String(document.getElementById('vp172BulkText')?.value||'').trim();
    if(!text){bulkMsg('Escreva a mensagem antes de iniciar.');return}
    const selected=[...document.querySelectorAll('#vp172BulkList [data-vp172-bulk-client]:checked')].map(x=>{
      const raw=decodeURIComponent(x.dataset.vp172BulkClient||'');const split=raw.indexOf('|');
      return {name:split>=0?raw.slice(0,split):raw,phone:split>=0?raw.slice(split+1):''};
    }).filter(x=>waNumber(x.phone));
    if(!selected.length){bulkMsg('Selecione pelo menos um cliente com telefone.');return}
    bulkQueue=selected.map(x=>({...x,message:personalizeBulk(text,x.name)}));bulkIndex=0;bulkMsg('');
    renderBulkQueue();
  }
  function renderBulkQueue(){
    const box=document.getElementById('vp172BulkQueue');if(!box)return;
    if(!bulkQueue.length){box.style.display='none';return}
    if(bulkIndex>=bulkQueue.length){
      box.style.display='block';box.innerHTML='<strong>Fila concluída.</strong><small>Todos os clientes selecionados foram percorridos.</small>';
      toast('Fila de mensagens concluída.','success');return;
    }
    const row=bulkQueue[bulkIndex];
    box.style.display='block';
    box.innerHTML=`
      <strong>${escV(row.name||'Cliente')}</strong>
      <small>${bulkIndex+1} de ${bulkQueue.length} • ${escV(row.phone)}</small>
      <div class="vp172-queue-message">${escV(row.message)}</div>
      <div class="vp172-actions" style="margin-top:10px">
        <button type="button" class="btn-green" id="vp172OpenWhatsApp">Abrir WhatsApp</button>
        <button type="button" class="btn-primary" id="vp172NextBulk">Enviado • próximo</button>
      </div>`;
    box.querySelector('#vp172OpenWhatsApp')?.addEventListener('click',()=>{
      const n=waNumber(row.phone);if(!n)return;
      window.open('https://wa.me/'+n+'?text='+encodeURIComponent(row.message),'_blank','noopener');
    });
    box.querySelector('#vp172NextBulk')?.addEventListener('click',()=>{bulkIndex++;renderBulkQueue()});
  }
  window.vp172OpenBulk=function(){
    if(!canBulk()){toast('Seu nível de acesso não permite mensagens em lote.','error');return}
    installBulkModal();bulkQueue=[];bulkIndex=0;bulkMsg('');
    const q=document.getElementById('vp172BulkSearch');if(q)q.value='';
    const t=document.getElementById('vp172BulkText');if(t&&!t.value)t.value='Olá, {nome}! Tudo bem? Aqui é da Vaporeasy.';
    document.getElementById('vp172BulkQueue').style.display='none';renderBulkClients();
    const m=document.getElementById('vp172BulkModal');m?.classList.add('show');m?.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  };
  function closeBulk(){const m=document.getElementById('vp172BulkModal');m?.classList.remove('show');m?.setAttribute('aria-hidden','true');document.body.style.overflow='';bulkQueue=[];bulkIndex=0;bulkMsg('')}

  function install(){
    installStyle();installRealizedModal();installRealizedButton();installClientButtons();installContactsModal();installBulkButton();installBulkModal();
  }
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(document.getElementById('vp172RealizedModal')?.classList.contains('show'))window.vp172CloseRealized?.();
    else if(document.getElementById('vp172ContactsModal')?.classList.contains('show'))closeContactsModal();
    else if(document.getElementById('vp172BulkModal')?.classList.contains('show'))closeBulk();
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  [600,1500,3200].forEach(ms=>setTimeout(install,ms));
  console.info('Vaporeasy patch ativo:',BUILD);
})();