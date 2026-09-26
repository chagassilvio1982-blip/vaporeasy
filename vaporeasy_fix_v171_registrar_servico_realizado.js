/* Vaporeasy V173 — 2026-09-24
   Corrige o fluxo de atendimentos já realizados diretamente no formulário normal.
   Também mantém:
   - importação de contatos selecionados do Android/Chrome;
   - fila de mensagens para vários clientes via WhatsApp.

   O index.html já carrega este nome:
   <script src="./vaporeasy_fix_v171_registrar_servico_realizado.js?v=171"></script>
*/
(function(){
  'use strict';
  if(window.__vpV173Installed)return;
  window.__vpV173Installed=true;

  const BUILD='v173-past-slots-contatos-whatsapp-2026-09-24';
  const CLIENTS_KEY=(typeof STORAGE_CLIENTS!=='undefined'?STORAGE_CLIENTS:'vaporeasy_clients_v1');
  let originalSaveAppointment=null;
  let originalSyncChips=null;
  let savingHistorical=false;
  let bulkQueue=[];
  let bulkIndex=0;

  function norm(v){
    try{if(typeof normalizeText==='function')return normalizeText(v||'')}catch(_){}
    try{return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}catch(_){return String(v||'').trim().toLowerCase()}
  }
  function escV(v){
    try{if(typeof esc==='function')return esc(v)}catch(_){}
    return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function plate(v){
    try{if(typeof cleanPlate==='function')return cleanPlate(v||'')}catch(_){}
    return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  }
  function phoneDigits(v){return String(v||'').replace(/\D/g,'')}
  function waNumber(v){
    let n=phoneDigits(v).replace(/^0+/,'');
    if(!n)return '';
    if(n.startsWith('55')&&n.length>=12)return n;
    if(n.length===10||n.length===11)return '55'+n;
    return n;
  }
  function today(){
    try{if(typeof agendaLocalToday==='function')return agendaLocalToday()}catch(_){}
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function nowMinutes(){const d=new Date();return d.getHours()*60+d.getMinutes()}
  function clockToMin(v){
    try{if(typeof clockToMinutes==='function')return clockToMinutes(v)}catch(_){}
    const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;
    return Number(m[1])*60+Number(m[2]);
  }
  function toast(msg,type='success'){try{showToast?.(msg,type)}catch(_){}}
  function getClientsSafe(){try{return typeof getClients==='function'?(getClients()||[]):[]}catch(_){return []}}
  function getAppointmentsSafe(){try{return typeof getAppointments==='function'?(getAppointments()||[]):[]}catch(_){return []}}

  function isPastSelection(date,time){
    if(!date||!time)return false;
    const t=today();
    if(date<t)return true;
    if(date>t)return false;
    const m=clockToMin(time);
    return m!==null && m<nowMinutes();
  }

  function calcValues(){
    const base=Math.max(0,Number(document.getElementById('agendaValorServico')?.value)||0);
    const discount=Math.min(100,Math.max(0,Number(document.getElementById('agendaDesconto')?.value)||0));
    try{
      if(typeof calculateDiscount==='function'){
        const x=calculateDiscount(base,discount);
        return {base:Number(x.base??base)||0,discount:Number(x.discount??discount)||0,total:Number(x.total??base)||0};
      }
    }catch(_){}
    return {base,discount,total:Math.max(0,base-(base*discount/100))};
  }

  function installStyle(){
    if(document.getElementById('vp-v173-style'))return;
    const s=document.createElement('style');
    s.id='vp-v173-style';
    s.textContent=`
      .agenda-time-chip.vp173-past-selectable{
        opacity:1!important;cursor:pointer!important;
        border-color:rgba(240,177,70,.52)!important;
        background:rgba(240,177,70,.12)!important;
        color:#ffd27a!important;
      }
      .agenda-time-chip.vp173-past-selected{
        outline:2px solid rgba(240,177,70,.65)!important;
        background:rgba(240,177,70,.22)!important;
      }
      #vp173HistoricalBanner{
        display:none;margin:9px 0 4px;padding:10px 12px;border-radius:12px;
        border:1px solid rgba(240,177,70,.35);background:rgba(240,177,70,.08);
        color:#ffd89a;font-size:12px;line-height:1.45
      }
      #vp173HistoricalBanner.show{display:block}
      #agendaRegisterRealizedBtn{
        border-color:rgba(31,190,126,.42)!important;
        background:rgba(19,109,77,.18)!important;color:#caffdf!important
      }
      body.vp-role-collaborator #agendaRegisterRealizedBtn,
      body.vp-role-collaborator #vp173ImportContactsBtn,
      body.vp-role-collaborator #vp173BulkBtn{display:none!important}
      .vp173-backdrop{position:fixed;inset:0;z-index:1950;display:none;align-items:flex-end;justify-content:center;padding:14px;background:rgba(0,8,14,.82)}
      .vp173-backdrop.show{display:flex}
      .vp173-sheet{width:min(600px,100%);max-height:92vh;overflow:auto;background:#071c29;border:1px solid rgba(35,183,238,.3);border-radius:22px;padding:18px}
      .vp173-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      .vp173-head h3{margin:0;color:#fff;font-size:20px}.vp173-head p{margin:5px 0 0;color:#8eacbd;font-size:11px;line-height:1.45}
      .vp173-close{width:38px;height:38px;padding:0!important;border-radius:50%!important;background:#102d3e!important;color:#fff!important;font-size:22px!important}
      .vp173-tools{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.vp173-tools button{min-height:36px;padding:7px 10px!important}
      #vp173BulkList{display:grid;gap:7px;max-height:36vh;overflow:auto;margin-top:9px}
      .vp173-bulk-row{display:grid;grid-template-columns:28px minmax(0,1fr);gap:9px;align-items:center;padding:10px;border:1px solid rgba(123,197,235,.13);border-radius:12px;background:rgba(255,255,255,.025)}
      .vp173-bulk-row input{width:18px;height:18px}.vp173-bulk-row strong{display:block}.vp173-bulk-row small{display:block;color:#88a7b8;margin-top:2px}
      .vp173-help{margin:10px 0;padding:10px 11px;border-radius:12px;border:1px solid rgba(30,174,240,.15);background:rgba(30,174,240,.05);color:#90adbc;font-size:11px;line-height:1.45}
      .vp173-msg{display:none;margin-top:10px;padding:9px 10px;border-radius:10px;font-size:11px}.vp173-msg.show{display:block}
      .vp173-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}.vp173-actions button{min-width:130px}
      .vp173-queue{display:none;margin-top:12px;padding:14px;border-radius:15px;border:1px solid rgba(48,196,133,.25);background:rgba(24,102,72,.10)}
      .vp173-queue.show{display:block}.vp173-queue-message{margin-top:10px;padding:10px;border-radius:11px;background:rgba(0,0,0,.16);white-space:pre-wrap;font-size:12px;line-height:1.45}
      @media(max-width:520px){.vp173-sheet{border-radius:19px}.vp173-actions{display:grid;grid-template-columns:1fr}.vp173-actions button{min-width:0}}
    `;
    document.head.appendChild(s);
  }

  function ensureHistoricalBanner(){
    if(document.getElementById('vp173HistoricalBanner'))return;
    const chips=document.getElementById('agendaAvailableTimeChips');
    if(!chips)return;
    const b=document.createElement('div');
    b.id='vp173HistoricalBanner';
    b.innerHTML='<b>Serviço já realizado.</b> Este horário já passou. Ao salvar, o atendimento será registrado como <b>Concluído</b> e entrará no histórico e no Financeiro.';
    chips.parentNode.insertBefore(b,chips);
  }

  function updateHistoricalBanner(){
    ensureHistoricalBanner();
    const date=document.getElementById('agendaData')?.value||'';
    const time=document.getElementById('agendaHora')?.value||'';
    const past=isPastSelection(date,time);
    const b=document.getElementById('vp173HistoricalBanner');
    b?.classList.toggle('show',past);
    const save=document.querySelector('#appointmentFormCard button[onclick="saveAppointment()"]');
    if(save && !savingHistorical){
      save.textContent=past?'Registrar serviço realizado':'Salvar agendamento';
    }
  }

  window.vp173SelectPastTime=function(time){
    const sel=document.getElementById('agendaHora');if(!sel)return;
    if(!Array.from(sel.options||[]).some(o=>String(o.value)===String(time))){
      const o=document.createElement('option');o.value=time;o.textContent=time;sel.appendChild(o);
    }
    sel.value=time;
    try{sel.dispatchEvent(new Event('change',{bubbles:true}))}catch(_){}
    updateHistoricalBanner();
    try{window.syncAvailableTimeChips?.()}catch(_){}
  };

  function patchedSyncChips(items){
    const box=document.getElementById('agendaAvailableTimeChips');
    const sel=document.getElementById('agendaHora');
    if(!box)return;
    let list=Array.isArray(items)?items:(typeof getAppointmentTimeOptions==='function'?getAppointmentTimeOptions():[]);
    if(list.length && typeof list[0]==='string')list=list.map(t=>({time:t,state:'available',available:true}));
    const current=sel?.value||'';
    const date=document.getElementById('agendaData')?.value||'';
    if(!list.length){box.innerHTML='';updateHistoricalBanner();return}
    box.innerHTML=list.map(o=>{
      const t=String(o.time||'').slice(0,5);
      const isPast=isPastSelection(date,t);
      if(isPast){
        return '<button type="button" class="agenda-time-chip vp173-past-selectable '+(t===current?'vp173-past-selected':'')+'" onclick="vp173SelectPastTime(\''+escV(t)+'\')" title="Registrar serviço já realizado">'+escV(t)+'</button>';
      }
      if(o.state==='busy')return '<button type="button" class="agenda-time-chip unavailable" disabled title="Horário ocupado por atendimento">'+escV(t)+'</button>';
      if(o.available||o.state==='available')return '<button type="button" class="agenda-time-chip '+(t===current?'active':'')+'" onclick="selectAvailableTimeChip(\''+escV(t)+'\')">'+escV(t)+'</button>';
      return '';
    }).join('')+
      '<div class="agenda-time-legend"><span class="dot available"></span>Disponível <span class="dot busy"></span>Ocupado <span class="dot past"></span>Já passou — toque para registrar como realizado</div>';
    updateHistoricalBanner();
  }

  function installTimePatch(){
    if(!originalSyncChips && typeof window.syncAvailableTimeChips==='function')originalSyncChips=window.syncAvailableTimeChips;
    window.syncAvailableTimeChips=patchedSyncChips;
    try{syncAvailableTimeChips=patchedSyncChips}catch(_){}
    ['agendaData','agendaHora','agendaServico','agendaColaborador'].forEach(id=>{
      const e=document.getElementById(id);
      if(e && !e.dataset.vp173Watch){
        e.dataset.vp173Watch='1';
        e.addEventListener('change',()=>setTimeout(()=>{try{patchedSyncChips();updateHistoricalBanner()}catch(_){}},20));
      }
    });
    try{patchedSyncChips()}catch(_){}
  }

  function duplicateHistorical(a){
    return getAppointmentsSafe().some(x=>
      plate(x?.vehicle||x?.plate)===plate(a.vehicle) &&
      String(x?.date||'')===String(a.date) &&
      String(x?.time||'').slice(0,5)===String(a.time).slice(0,5) &&
      !['cancelado','cancelled','excluido','excluído'].includes(norm(x?.status))
    );
  }

  function fallbackCompletedMirrors(a){
    try{
      if(typeof getServiceHistory==='function'&&typeof setServiceHistory==='function'){
        const h=getServiceHistory();
        if(!h.some(x=>String(x.appointmentId||'')===String(a.id))){
          h.push({id:'hist_'+a.id,appointmentId:String(a.id),client:a.client,vehicle:a.vehicle,service:a.service,date:a.date,time:a.time,value:Number(a.finalValue||0),collaborator:a.collaborator||'',notes:a.notes||'',completedAt:a.completedAt,source:'appointment'});
          setServiceHistory(h);
        }
      }
      if(typeof getFinanceTransactions==='function'&&typeof setFinanceTransactions==='function'){
        const f=getFinanceTransactions();
        if(!f.some(x=>String(x.appointmentId||'')===String(a.id)&&x.source==='appointment')){
          f.push({id:'tx_'+a.id,appointmentId:String(a.id),date:a.date,type:'Entrada',tipo:'Entrada',category:'Serviço realizado',description:[a.service,a.client,a.vehicle].filter(Boolean).join(' • '),value:Number(a.finalValue||0),client:a.client,vehicle:a.vehicle,service:a.service,source:'appointment',paymentStatus:'Pendente',paymentMethod:'',createdAt:new Date().toISOString()});
          setFinanceTransactions(f);
        }
      }
    }catch(e){console.warn('V173 mirrors',e)}
  }

  async function syncHistorical(){
    try{
      if(typeof window.vpSecureFlushNow==='function')return await window.vpSecureFlushNow();
      if(typeof window.vpSecureBridge==='function'&&typeof window.buildBridgeSyncBundle==='function'){
        await window.vpSecureBridge('sync',{method:'POST',body:window.buildBridgeSyncBundle()});
        try{await window.vpSecurePullNow?.(false)}catch(_){}
        return true;
      }
      try{window.vpSecureSchedule?.()}catch(_){}
      return false;
    }catch(e){
      console.warn('V173 sync',e);
      try{window.vpSecureSchedule?.()}catch(_){}
      return false;
    }
  }

  function setStatus(text,ok=true){
    const s=document.getElementById('agendaSaveStatus');if(!s)return;
    s.classList.remove('hidden');s.textContent=text;
    try{s.scrollIntoView({behavior:'smooth',block:'center'})}catch(_){}
  }

  function resetHistoricalForNext(client,date,collaborator){
    const ci=document.getElementById('agendaCliente');
    if(ci){ci.value=client;ci.dataset.selectedClient=client}
    try{updateAgendaVehicles?.()}catch(_){}
    const vehicle=document.getElementById('agendaVeiculo');
    if(vehicle){vehicle.classList.remove('hidden');vehicle.value=''}
    document.getElementById('agendaVehicleLocked')?.classList.add('hidden');
    const vl=document.getElementById('agendaVehicleLabel');if(vl)vl.style.display='';
    const dateEl=document.getElementById('agendaData');if(dateEl)dateEl.value=date;
    const coll=document.getElementById('agendaColaborador');if(coll)coll.value=collaborator||'';
    const service=document.getElementById('agendaServico');if(service)service.value='';
    const value=document.getElementById('agendaValorServico');if(value)value.value='';
    const disc=document.getElementById('agendaDesconto');if(disc)disc.value='0';
    const notes=document.getElementById('agendaObservacoes');if(notes)notes.value='';
    const status=document.getElementById('agendaStatus');if(status){status.value='Agendado';status.disabled=false;}
    const frequency=document.getElementById('agendaFrequencia');if(frequency)frequency.value='single';
    if(typeof toggleRecurrence==='function')toggleRecurrence();
    const time=document.getElementById('agendaHora');
    if(time){time.innerHTML='<option value="">Escolha primeiro data, serviço e colaborador...</option>';time.value=''}
    try{updateAvailableAppointmentTimes?.()}catch(_){}
    installTimePatch();
    setTimeout(()=>vehicle?.focus(),80);
  }

  async function saveHistoricalFromNormalForm(){
    if(savingHistorical)return;
    const client=(document.getElementById('agendaCliente')?.value||'').trim();
    const vehicle=(document.getElementById('agendaVeiculo')?.value||window.__agendaTargetVehiclePlate||'').trim();
    const date=document.getElementById('agendaData')?.value||'';
    const time=String(document.getElementById('agendaHora')?.value||'').slice(0,5);
    const service=document.getElementById('agendaServico')?.value||'';
    const collaborator=(document.getElementById('agendaColaborador')?.value||'').trim();
    const notes=(document.getElementById('agendaObservacoes')?.value||'').trim();
    if(!client||!vehicle||!date||!time||!service){
      setStatus('Preencha cliente, veículo, data, horário e serviço.',false);return;
    }
    if(!isPastSelection(date,time)){
      return originalSaveAppointment?.();
    }
    const validation=VaporeasyCadastroAgenda.appointmentError(client,vehicle,getClientsSafe(),getVehicles());
    if(validation){setStatus(validation,false);return;}
    const values=calcValues();
    const iso=new Date().toISOString();
    const a={
      id:'ag_realizado_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      client,vehicle:plate(vehicle),date,time,service,notes,
      value:values.base,discount:values.discount,finalValue:values.total,
      status:'Concluído',collaborator,
      routeOrigin:(document.getElementById('agendaOrigemRota')?.value||'').trim(),
      routeDestination:(document.getElementById('agendaDestinoRota')?.value||'').trim(),
      travelMinutes:Math.max(0,Number(document.getElementById('agendaTempoDeslocamento')?.value)||0),
      travelMargin:Math.max(0,Number(document.getElementById('agendaMargemDeslocamento')?.value)||0),
      recurring:false,frequency:'',customIntervalDays:0,
      manualCompleted:true,source:'manual_completed',
      createdAt:iso,updatedAt:iso,completedAt:iso
    };
    if(duplicateHistorical(a)){
      setStatus('Já existe um atendimento deste veículo neste mesmo dia e horário. Confira a agenda para evitar duplicidade.',false);
      return;
    }
    const save=document.querySelector('#appointmentFormCard button[onclick="saveAppointment()"]');
    savingHistorical=true;if(save){save.disabled=true;save.textContent='Registrando...'}
    try{
      const rows=getAppointmentsSafe().slice();rows.push(a);
      if(typeof setAppointments!=='function')throw new Error('Agenda local indisponível.');
      setAppointments(rows);
      try{
        if(typeof reconcileCompletedAppointmentRecords==='function')reconcileCompletedAppointmentRecords(a,'','Concluído');
        else fallbackCompletedMirrors(a);
      }catch(e){console.warn('V173 reconcile',e);fallbackCompletedMirrors(a)}
      try{agendaFocusDate=date;agendaCalendarMonth=String(date).slice(0,7);agendaCollabSelected='all'}catch(_){}
      try{renderAppointments?.();renderAgendaTimeline?.();renderRealizedServices?.();renderFinanceiro?.();renderManagementDashboard?.()}catch(_){}
      const synced=await syncHistorical();
      resetHistoricalForNext(client,date,collaborator);
      setStatus(synced?'Serviço realizado salvo e sincronizado. Selecione o próximo veículo e continue.':'Serviço realizado salvo. Selecione o próximo veículo e continue; a sincronização ficou agendada.',true);
      toast('Serviço realizado registrado.','success');
    }catch(e){
      console.error('V173 historical save',e);
      setStatus('Não foi possível registrar: '+String(e?.message||e||'erro inesperado')+'.',false);
    }finally{
      savingHistorical=false;
      if(save){save.disabled=false;save.textContent='Salvar agendamento'}
      updateHistoricalBanner();
    }
  }

  function installSavePatch(){
    if(!originalSaveAppointment && typeof window.saveAppointment==='function')originalSaveAppointment=window.saveAppointment;
    if(!originalSaveAppointment)return;
    const wrapped=async function(){
      const date=document.getElementById('agendaData')?.value||'';
      const time=document.getElementById('agendaHora')?.value||'';
      if(isPastSelection(date,time))return await saveHistoricalFromNormalForm();
      return await originalSaveAppointment.apply(this,arguments);
    };
    window.saveAppointment=wrapped;
    try{saveAppointment=wrapped}catch(_){}
  }

  function installRealizedShortcut(){
    const actions=document.querySelector('#agenda .agenda-view-actions');if(!actions)return;
    let b=document.getElementById('agendaRegisterRealizedBtn');
    if(!b){
      b=document.createElement('button');b.id='agendaRegisterRealizedBtn';b.type='button';b.className='agenda-view-btn';
      b.textContent='✓ Registrar serviço já realizado';actions.appendChild(b);
    }
    if(!b.dataset.vp173){
      b.dataset.vp173='1';
      b.addEventListener('click',()=>{
        try{openNewAppointmentMode?.()}catch(_){}
        const date=document.getElementById('agendaData');
        const focused=(typeof agendaFocusDate!=='undefined'?String(agendaFocusDate||''):'');
        if(date)date.value=(focused&&focused<=today())?focused:today();
        setTimeout(()=>{
          try{updateAvailableAppointmentTimes?.()}catch(_){}
          installTimePatch();
          ensureHistoricalBanner();
          const banner=document.getElementById('vp173HistoricalBanner');
          if(banner){banner.classList.add('show');banner.innerHTML='<b>Modo serviço já realizado.</b> Escolha cliente, veículo e serviço. Depois toque em um horário que já passou (amarelo).'}
        },80);
      });
    }
  }

  // ------------------- Importação de contatos -------------------
  function writeClients(rows){
    if(typeof writeStore==='function')writeStore(CLIENTS_KEY,rows);
    else localStorage.setItem(CLIENTS_KEY,JSON.stringify(rows||[]));
    try{updateClientSuggestions?.()}catch(_){}
    try{window.vpSecureSchedule?.()}catch(_){}
  }
  function installImportButton(){
    const section=document.getElementById('clientes');if(!section)return;
    const head=section.querySelector('.section-head');if(!head)return;
    const actions=head.lastElementChild||head;
    if(document.getElementById('vp173ImportContactsBtn'))return;
    const b=document.createElement('button');b.id='vp173ImportContactsBtn';b.type='button';b.className='btn-ghost';b.textContent='📇 Importar contatos';
    b.addEventListener('click',()=>window.vp173PickContacts?.());
    actions.insertBefore(b,actions.lastElementChild||null);
  }
  window.vp173PickContacts=async function(){
    if(!window.isSecureContext){toast('A importação de contatos exige HTTPS.','error');return}
    if(!('contacts' in navigator)||typeof navigator.contacts?.select!=='function'){
      toast('Abra o Vaporeasy no Chrome do Android para selecionar contatos do celular.','error');return;
    }
    try{
      const props=typeof navigator.contacts.getProperties==='function'?await navigator.contacts.getProperties():['name','tel'];
      const picked=await navigator.contacts.select(['name','tel'].filter(x=>props.includes(x)),{multiple:true});
      const selected=(picked||[]).map(c=>({
        name:String(Array.isArray(c.name)?(c.name[0]||''):(c.name||'')).trim(),
        phone:String(Array.isArray(c.tel)?(c.tel[0]||''):(c.tel||'')).trim()
      })).filter(c=>c.name&&phoneDigits(c.phone));
      if(!selected.length){toast('Nenhum contato com nome e telefone foi selecionado.','error');return}
      const rows=getClientsSafe().slice();let added=0,updated=0,skipped=0;
      for(const item of selected){
        const ph=phoneDigits(item.phone);
        let i=rows.findIndex(c=>phoneDigits(c.phone||c.telefone||'')===ph || norm(c.name)===norm(item.name));
        if(i>=0){
          if(!phoneDigits(rows[i].phone||rows[i].telefone||'')){rows[i]={...rows[i],phone:item.phone,updatedAt:new Date().toISOString()};updated++}
          else skipped++;
        }else{
          rows.push({name:item.name,phone:item.phone,condo:'',address:'',notes:'Importado dos contatos do celular',source:'contact_picker',updatedAt:new Date().toISOString()});
          added++;
        }
      }
      writeClients(rows);
      const m=document.getElementById('clienteManageStatus');
      if(m){m.classList.remove('hidden');m.textContent=`${added} contato(s) importado(s), ${updated} atualizado(s), ${skipped} já existente(s).`}
      toast(`${added} contato(s) importado(s).`,'success');
    }catch(e){
      const msg=String(e?.message||e||'');
      if(!/cancel|abort/i.test(msg))toast('Não foi possível importar: '+msg,'error');
    }
  };

  // ------------------- Mensagem para vários -------------------
  function installBulkButton(){
    const section=document.getElementById('comercial');if(!section)return;
    const head=section.querySelector('.section-head');if(!head)return;
    if(document.getElementById('vp173BulkBtn'))return;
    const b=document.createElement('button');b.id='vp173BulkBtn';b.type='button';b.className='btn-primary';b.textContent='📣 Mensagem para vários';
    b.addEventListener('click',()=>window.vp173OpenBulk?.());
    const back=head.querySelector('button[onclick*="voltarParaResumo"]');if(back)head.insertBefore(b,back);else head.appendChild(b);
  }
  function installBulkModal(){
    if(document.getElementById('vp173BulkModal'))return;
    const d=document.createElement('div');d.id='vp173BulkModal';d.className='vp173-backdrop';
    d.innerHTML=`
      <div class="vp173-sheet">
        <div class="vp173-head"><div><h3>Mensagem para vários clientes</h3><p>Selecione os clientes, escreva uma vez e percorra a fila no WhatsApp.</p></div><button class="vp173-close" type="button" data-vp173-close>×</button></div>
        <input id="vp173BulkSearch" type="search" placeholder="Buscar cliente ou telefone">
        <div class="vp173-tools"><button type="button" class="btn-ghost" id="vp173SelectVisible">Selecionar visíveis</button><button type="button" class="btn-ghost" id="vp173ClearBulk">Limpar</button></div>
        <div id="vp173BulkList"></div>
        <div class="vp173-help"><span id="vp173BulkCount">0 selecionado(s)</span></div>
        <label>Mensagem</label>
        <textarea id="vp173BulkText" rows="5" placeholder="Olá, {nome}! Tudo bem?"></textarea>
        <div class="vp173-help">Use <b>{nome}</b> para inserir o primeiro nome automaticamente. A fila abre o WhatsApp cliente por cliente.</div>
        <div id="vp173BulkMsg" class="vp173-msg"></div>
        <div id="vp173BulkQueue" class="vp173-queue"></div>
        <div class="vp173-actions"><button type="button" class="btn-ghost" data-vp173-close>Fechar</button><button id="vp173StartBulk" type="button" class="btn-primary">Iniciar fila</button></div>
      </div>`;
    document.body.appendChild(d);
    d.addEventListener('click',e=>{if(e.target===d||e.target.closest?.('[data-vp173-close]'))closeBulk()});
    d.querySelector('#vp173BulkSearch')?.addEventListener('input',renderBulk);
    d.querySelector('#vp173SelectVisible')?.addEventListener('click',()=>{d.querySelectorAll('[data-vp173-client]').forEach(x=>x.checked=true);updateBulkCount()});
    d.querySelector('#vp173ClearBulk')?.addEventListener('click',()=>{d.querySelectorAll('[data-vp173-client]').forEach(x=>x.checked=false);updateBulkCount()});
    d.querySelector('#vp173StartBulk')?.addEventListener('click',startBulk);
  }
  function eligibleClients(){
    return getClientsSafe().filter(c=>phoneDigits(c.phone||c.telefone||c.whatsapp||'')).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  }
  function renderBulk(){
    const list=document.getElementById('vp173BulkList');if(!list)return;
    const q=norm(document.getElementById('vp173BulkSearch')?.value||'');
    const rows=eligibleClients().filter(c=>!q||norm([c.name,c.phone,c.telefone].join(' ')).includes(q));
    list.innerHTML=rows.length?rows.map(c=>{
      const p=c.phone||c.telefone||c.whatsapp||'';
      const key=encodeURIComponent(String(c.name||'')+'|'+String(p));
      return `<label class="vp173-bulk-row"><input type="checkbox" data-vp173-client="${key}"><span><strong>${escV(c.name||'Cliente')}</strong><small>${escV(p)}</small></span></label>`;
    }).join(''):'<div class="vp173-help">Nenhum cliente com telefone encontrado.</div>';
    list.querySelectorAll('[data-vp173-client]').forEach(x=>x.addEventListener('change',updateBulkCount));updateBulkCount();
  }
  function updateBulkCount(){const n=document.querySelectorAll('#vp173BulkList [data-vp173-client]:checked').length;const e=document.getElementById('vp173BulkCount');if(e)e.textContent=n+' selecionado(s)'}
  function personalized(text,name){const first=String(name||'cliente').trim().split(/\s+/)[0]||'cliente';return String(text||'').replace(/\{nome\}/gi,first)}
  function bulkMsg(t){const e=document.getElementById('vp173BulkMsg');if(!e)return;e.textContent=t||'';e.classList.toggle('show',!!t)}
  function startBulk(){
    const template=String(document.getElementById('vp173BulkText')?.value||'').trim();if(!template){bulkMsg('Escreva a mensagem.');return}
    const selected=[...document.querySelectorAll('#vp173BulkList [data-vp173-client]:checked')].map(x=>{
      const raw=decodeURIComponent(x.dataset.vp173Client||'');const i=raw.indexOf('|');return {name:i>=0?raw.slice(0,i):raw,phone:i>=0?raw.slice(i+1):''};
    }).filter(x=>waNumber(x.phone));
    if(!selected.length){bulkMsg('Selecione pelo menos um cliente.');return}
    bulkQueue=selected.map(x=>({...x,message:personalized(template,x.name)}));bulkIndex=0;bulkMsg('');renderQueue();
  }
  function renderQueue(){
    const box=document.getElementById('vp173BulkQueue');if(!box)return;
    box.classList.add('show');
    if(bulkIndex>=bulkQueue.length){box.innerHTML='<strong>Fila concluída.</strong>';toast('Fila concluída.','success');return}
    const r=bulkQueue[bulkIndex];
    box.innerHTML=`<strong>${escV(r.name)}</strong><small>${bulkIndex+1} de ${bulkQueue.length} • ${escV(r.phone)}</small><div class="vp173-queue-message">${escV(r.message)}</div><div class="vp173-actions"><button id="vp173OpenWa" type="button" class="btn-green">Abrir WhatsApp</button><button id="vp173NextWa" type="button" class="btn-primary">Enviado • próximo</button></div>`;
    box.querySelector('#vp173OpenWa')?.addEventListener('click',()=>window.open('https://wa.me/'+waNumber(r.phone)+'?text='+encodeURIComponent(r.message),'_blank','noopener'));
    box.querySelector('#vp173NextWa')?.addEventListener('click',()=>{bulkIndex++;renderQueue()});
  }
  window.vp173OpenBulk=function(){
    installBulkModal();bulkQueue=[];bulkIndex=0;bulkMsg('');
    const q=document.getElementById('vp173BulkSearch');if(q)q.value='';
    const t=document.getElementById('vp173BulkText');if(t)t.value='Olá, {nome}! Tudo bem? Aqui é da Vaporeasy.';
    document.getElementById('vp173BulkQueue')?.classList.remove('show');renderBulk();
    const m=document.getElementById('vp173BulkModal');m?.classList.add('show');document.body.style.overflow='hidden';
  };
  function closeBulk(){document.getElementById('vp173BulkModal')?.classList.remove('show');document.body.style.overflow='';bulkQueue=[];bulkIndex=0}

  function install(){
    installStyle();
    installTimePatch();
    installSavePatch();
    installRealizedShortcut();
    installImportButton();
    installBulkButton();
    installBulkModal();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  [500,1200,2600,5000].forEach(ms=>setTimeout(install,ms));
  console.info('Vaporeasy patch ativo:',BUILD);
})();