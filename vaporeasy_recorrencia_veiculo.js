/* Vaporeasy — Recorrência do Atendimento por veículo
   - A recorrência pertence ao cliente/veículo, dia e horário.
   - Não fixa equipe: ocorrências futuras nascem sem colaborador.
   - A equipe pode ser definida/remanejada por ocorrência na agenda.
*/
(function(){
  'use strict';

  const VERSION='vehicle-recurrence-v1-2026-09-22';
  const REC_FIELD='attendanceRecurrence';
  const FREQ_LABEL={none:'Sem recorrência',weekly:'Semanal',biweekly:'Quinzenal',monthly:'Mensal'};
  const WEEKDAY_LABEL=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const FORM_CONFIG={
    cv:{cardId:'cadastrarVeiculoCard',statusId:'cvSaveStatus',plateId:'cvPlaca'},
    rg:{cardId:'veiculos',statusId:'vehicleSaveStatus',plateId:'rgPlaca'}
  };

  const $=id=>document.getElementById(id);
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const cleanPlateSafe=v=>typeof window.cleanPlate==='function'?window.cleanPlate(v):String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
  const todayISO=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
  const isoDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const parseISO=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0,0);return Number.isNaN(d.getTime())?null:d};
  const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
  const monthKey=d=>d.getFullYear()*12+d.getMonth();

  function recurrenceSignature(r){
    r=r||{};
    return [r.frequency||'none',r.weekday??'',String(r.time||'').slice(0,5),r.startDate||'',norm(r.service||''),Number(r.futureCount||12)].join('|');
  }

  function defaultRecurrence(){
    return {frequency:'none',weekday:new Date().getDay(),time:'08:00',startDate:todayISO(),service:'',futureCount:12,skipSlots:[],updatedAt:new Date().toISOString()};
  }

  function normalizeRecurrence(r){
    const base=defaultRecurrence();
    r={...base,...(r||{})};
    if(!['none','weekly','biweekly','monthly'].includes(r.frequency))r.frequency='none';
    r.weekday=Math.min(6,Math.max(0,Number(r.weekday)||0));
    r.time=/^\d{2}:\d{2}$/.test(String(r.time||''))?String(r.time).slice(0,5):'08:00';
    if(!parseISO(r.startDate))r.startDate=todayISO();
    r.futureCount=Math.min(52,Math.max(2,Number(r.futureCount)||12));
    r.skipSlots=Array.isArray(r.skipSlots)?[...new Set(r.skipSlots.map(String))]:[];
    return r;
  }

  function formHTML(prefix){
    return `
      <div id="${prefix}RecurrenceSection" class="vp-rec-section">
        <div class="vp-rec-title">Recorrência do Atendimento</div>
        <div class="vp-rec-help">A recorrência pertence ao cliente/veículo e ao horário. <b>Nenhuma equipe fica fixa</b>; a equipe é definida depois, em cada atendimento.</div>
        <label>Recorrência</label>
        <select id="${prefix}RecFrequency">
          <option value="none">Sem recorrência</option>
          <option value="weekly">Semanal</option>
          <option value="biweekly">Quinzenal</option>
          <option value="monthly">Mensal</option>
        </select>
        <div id="${prefix}RecDetails" class="vp-rec-details hidden">
          <div class="row">
            <div><label>Dia da semana</label><select id="${prefix}RecWeekday">${WEEKDAY_LABEL.map((x,i)=>`<option value="${i}">${x}</option>`).join('')}</select></div>
            <div><label>Horário padrão</label><input id="${prefix}RecTime" type="time" value="08:00"></div>
          </div>
          <label>Início da recorrência</label><input id="${prefix}RecStart" type="date" value="${todayISO()}">
          <label>Serviço padrão</label><select id="${prefix}RecService"><option value="">Selecione o serviço...</option></select>
          <label>Quantidade de próximos atendimentos</label><input id="${prefix}RecCount" type="number" min="2" max="52" value="12">
          <div class="vp-rec-note">Os próximos atendimentos serão criados como <b>Equipe não definida</b>. Remanejar a equipe de um atendimento não altera a recorrência original do veículo.</div>
        </div>
      </div>`;
  }

  function injectStyle(){
    if($('vpVehicleRecurrenceStyle'))return;
    const style=document.createElement('style');
    style.id='vpVehicleRecurrenceStyle';
    style.textContent=`
      .vp-rec-section{margin:16px 0;padding:15px;border:1px solid rgba(20,181,238,.22);border-radius:16px;background:rgba(20,181,238,.045)}
      .vp-rec-title{font-size:16px;font-weight:900;color:#f1fbff;margin-bottom:5px}.vp-rec-help{font-size:11px;line-height:1.45;color:#96b3c2;margin-bottom:12px}
      .vp-rec-details{margin-top:10px}.vp-rec-note{margin-top:10px;padding:10px 11px;border-radius:12px;background:rgba(255,255,255,.035);color:#a9c3d0;font-size:11px;line-height:1.45}
      .vp-rec-badge{display:inline-flex;align-items:center;margin-top:7px;padding:5px 8px;border-radius:999px;background:rgba(20,181,238,.10);border:1px solid rgba(20,181,238,.24);color:#82ddff;font-size:10px;font-weight:850}
      .vp-rec-team-btn{border-color:rgba(20,181,238,.5)!important;color:#9ee8ff!important}
      #vpRecTeamBackdrop{display:none;position:fixed;inset:0;z-index:99999;background:rgba(1,10,16,.78);align-items:flex-end;justify-content:center;padding:0}
      #vpRecTeamBackdrop.open{display:flex}.vp-rec-team-sheet{width:min(560px,100%);background:#071c28;border:1px solid #20475c;border-radius:22px 22px 0 0;padding:20px 18px max(22px,env(safe-area-inset-bottom));box-shadow:0 -20px 50px rgba(0,0,0,.45)}
      .vp-rec-team-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.vp-rec-team-head h3{margin:0;color:#fff}.vp-rec-team-head button{border:0;background:transparent;color:#b9d7e6;font-size:26px}
      .vp-rec-team-info{margin:10px 0 14px;color:#9ab7c5;font-size:12px;line-height:1.45}.vp-rec-team-actions{display:flex;gap:9px;margin-top:14px}.vp-rec-team-actions button{flex:1}
      .vp-rec-error{margin-top:10px;color:#ffc0c4;font-size:12px;line-height:1.4}
    `;
    document.head.appendChild(style);
  }

  function targetInsertionNode(prefix){
    if(prefix==='cv'){
      const card=$('cadastrarVeiculoCard');
      if(!card)return null;
      return card.querySelector('hr');
    }
    if(prefix==='rg'){
      const section=$('veiculos');
      if(!section)return null;
      const card=section.querySelector('.card.big');
      return card?.querySelector('hr')||null;
    }
    return null;
  }

  function injectForm(prefix){
    if($(`${prefix}RecurrenceSection`))return;
    const before=targetInsertionNode(prefix);if(!before)return;
    before.insertAdjacentHTML('beforebegin',formHTML(prefix));
    $(`${prefix}RecFrequency`)?.addEventListener('change',()=>toggleForm(prefix));
    $(`${prefix}RecStart`)?.addEventListener('change',()=>{
      const d=parseISO($(`${prefix}RecStart`)?.value); if(d && $(`${prefix}RecWeekday`))$(`${prefix}RecWeekday`).value=String(d.getDay());
    });
    refreshServiceOptions(prefix);
    resetForm(prefix);
  }

  function refreshServiceOptions(prefix,selected=''){
    const el=$(`${prefix}RecService`);if(!el)return;
    const current=selected||el.value||'';
    let services=[];
    try{services=typeof window.getServiceCatalog==='function'?window.getServiceCatalog():[]}catch(e){}
    el.innerHTML='<option value="">Selecione o serviço...</option>'+services
      .filter(s=>s && s.name && !s.disabled)
      .sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'))
      .map(s=>`<option value="${String(s.name).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}">${String(s.name).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</option>`).join('');
    if(current && [...el.options].some(o=>o.value===current))el.value=current;
  }

  function toggleForm(prefix){
    const freq=$(`${prefix}RecFrequency`)?.value||'none';
    $(`${prefix}RecDetails`)?.classList.toggle('hidden',freq==='none');
  }

  function resetForm(prefix){
    const r=defaultRecurrence();
    if($(`${prefix}RecFrequency`))$(`${prefix}RecFrequency`).value='none';
    if($(`${prefix}RecWeekday`))$(`${prefix}RecWeekday`).value=String(r.weekday);
    if($(`${prefix}RecTime`))$(`${prefix}RecTime`).value=r.time;
    if($(`${prefix}RecStart`))$(`${prefix}RecStart`).value=r.startDate;
    if($(`${prefix}RecCount`))$(`${prefix}RecCount`).value=String(r.futureCount);
    if($(`${prefix}RecService`))$(`${prefix}RecService`).value='';
    toggleForm(prefix);
  }

  function readForm(prefix){
    const frequency=$(`${prefix}RecFrequency`)?.value||'none';
    const oldPlate=cleanPlateSafe($(FORM_CONFIG[prefix].plateId)?.value||'');
    const existing=(typeof window.getVehicles==='function'?window.getVehicles():[]).find(v=>cleanPlateSafe(v.plate||'')===oldPlate);
    const old=normalizeRecurrence(existing?.[REC_FIELD]);
    if(frequency==='none')return {...old,frequency:'none',updatedAt:new Date().toISOString()};
    return normalizeRecurrence({
      frequency,
      weekday:Number($(`${prefix}RecWeekday`)?.value||0),
      time:$(`${prefix}RecTime`)?.value||'',
      startDate:$(`${prefix}RecStart`)?.value||todayISO(),
      service:$(`${prefix}RecService`)?.value||'',
      futureCount:Number($(`${prefix}RecCount`)?.value||12),
      skipSlots:old.skipSlots||[],
      updatedAt:new Date().toISOString()
    });
  }

  function validateForm(prefix){
    const r=readForm(prefix);if(r.frequency==='none')return {ok:true,rec:r};
    const missing=[];
    if(!parseISO(r.startDate))missing.push('data inicial');
    if(!/^\d{2}:\d{2}$/.test(r.time))missing.push('horário padrão');
    if(!r.service)missing.push('serviço padrão');
    if(r.futureCount<2)missing.push('quantidade');
    if(missing.length)return {ok:false,rec:r,message:'Preencha na recorrência: '+missing.join(', ')+'.'};
    return {ok:true,rec:r};
  }

  function showFormError(prefix,message){
    const id=FORM_CONFIG[prefix].statusId;const st=$(id);
    if(st){st.classList.remove('hidden');st.textContent=message;st.scrollIntoView({behavior:'smooth',block:'center'});}
    else if(typeof window.showToast==='function')window.showToast(message,'success');
  }

  function loadForm(prefix,vehicle){
    injectForm(prefix);
    const r=normalizeRecurrence(vehicle?.[REC_FIELD]);
    refreshServiceOptions(prefix,r.service||'');
    if($(`${prefix}RecFrequency`))$(`${prefix}RecFrequency`).value=r.frequency;
    if($(`${prefix}RecWeekday`))$(`${prefix}RecWeekday`).value=String(r.weekday);
    if($(`${prefix}RecTime`))$(`${prefix}RecTime`).value=r.time;
    if($(`${prefix}RecStart`))$(`${prefix}RecStart`).value=r.startDate;
    if($(`${prefix}RecCount`))$(`${prefix}RecCount`).value=String(r.futureCount);
    if($(`${prefix}RecService`) && r.service)$(`${prefix}RecService`).value=r.service;
    toggleForm(prefix);
  }

  function firstMatchingWeekday(startDate,weekday){
    let d=parseISO(startDate)||parseISO(todayISO());
    const delta=(Number(weekday)-d.getDay()+7)%7;
    return addDays(d,delta);
  }

  function monthlyOccurrence(anchor,index){
    const targetWeekday=anchor.getDay();
    const ordinal=Math.floor((anchor.getDate()-1)/7)+1;
    const y=anchor.getFullYear();
    const m=anchor.getMonth()+index;
    const first=new Date(y,m,1,12,0,0,0);
    const firstDelta=(targetWeekday-first.getDay()+7)%7;
    let day=1+firstDelta+7*(ordinal-1);
    const candidate=new Date(first.getFullYear(),first.getMonth(),day,12,0,0,0);
    if(candidate.getMonth()!==first.getMonth()){
      const last=new Date(first.getFullYear(),first.getMonth()+1,0,12,0,0,0);
      const back=(last.getDay()-targetWeekday+7)%7;
      day=last.getDate()-back;
    }
    return new Date(first.getFullYear(),first.getMonth(),day,12,0,0,0);
  }

  function recurrenceDates(rec,count){
    rec=normalizeRecurrence(rec);if(rec.frequency==='none')return [];
    const first=firstMatchingWeekday(rec.startDate,rec.weekday);
    const min=todayISO();
    const out=[];
    for(let i=0;i<420 && out.length<count;i++){
      let d;
      if(rec.frequency==='weekly')d=addDays(first,7*i);
      else if(rec.frequency==='biweekly')d=addDays(first,14*i);
      else d=monthlyOccurrence(first,i);
      const iso=isoDate(d);
      if(iso<min)continue;
      const slot=iso+'|'+rec.time;
      if((rec.skipSlots||[]).includes(slot))continue;
      out.push(iso);
    }
    return out;
  }

  function activeOrPreservedForSlot(list,plate,date,time){
    const p=cleanPlateSafe(plate),t=String(time||'').slice(0,5);
    return (list||[]).some(a=>cleanPlateSafe(a.vehicle||'')===p && String(a.date||'')===date && String(a.time||'').slice(0,5)===t && !a.recurrenceSuperseded && !(typeof window.isAppointmentDeleted==='function' && window.isAppointmentDeleted(a)));
  }

  function servicePrice(name){
    try{const n=typeof window.getCatalogPriceByName==='function'?window.getCatalogPriceByName(name):0;return Number(n)||0}catch(e){return 0}
  }

  function supersedeOldFutureGenerated(plate,oldRec){
    if(!oldRec || oldRec.frequency==='none')return false;
    const list=typeof window.getAppointments==='function'?window.getAppointments():[];
    const today=todayISO();let changed=false;
    for(const a of list){
      if(!a?.vehicleRecurrenceGenerated || cleanPlateSafe(a.vehicle||'')!==cleanPlateSafe(plate))continue;
      if(String(a.date||'')<today)continue;
      const st=norm(a.status||'');
      if(st.includes('conclu')||st==='completed')continue;
      a.status='Cancelado';
      a.recurrenceSuperseded=true;
      a.needsTeamAssignment=false;
      a.updatedAt=new Date().toISOString();
      changed=true;
    }
    if(changed && typeof window.setAppointments==='function')window.setAppointments(list);
    return changed;
  }

  function ensureVehicleRecurrence(vehicle,{oldRec=null,settingsChanged=false}={}){
    if(!vehicle?.plate)return 0;
    const rec=normalizeRecurrence(vehicle[REC_FIELD]);
    if(settingsChanged && oldRec && recurrenceSignature(oldRec)!==recurrenceSignature(rec))supersedeOldFutureGenerated(vehicle.plate,oldRec);
    if(rec.frequency==='none')return 0;

    const dates=recurrenceDates(rec,rec.futureCount);
    const list=typeof window.getAppointments==='function'?window.getAppointments():[];
    const now=new Date().toISOString();let added=0;
    const value=servicePrice(rec.service);
    for(const date of dates){
      if(activeOrPreservedForSlot(list,vehicle.plate,date,rec.time))continue;
      list.push({
        id:'ag_vr_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
        seriesId:'vehicle:'+cleanPlateSafe(vehicle.plate),
        client:vehicle.client||'',
        vehicle:cleanPlateSafe(vehicle.plate),
        date,
        time:rec.time,
        service:rec.service||'',
        notes:'Recorrência automática do veículo. Equipe definida no planejamento da semana.',
        value,
        discount:0,
        finalValue:value,
        status:'Agendado',
        collaborator:'',
        routeOrigin:'',routeDestination:'',travelMinutes:0,travelMargin:10,
        recurring:true,
        frequency:rec.frequency,
        vehicleRecurrenceGenerated:true,
        vehicleRecurrenceVersion:VERSION,
        needsTeamAssignment:true,
        createdAt:now,
        updatedAt:now
      });
      added++;
    }
    if(added && typeof window.setAppointments==='function'){
      window.setAppointments(typeof window.dedupeAppointments==='function'?window.dedupeAppointments(list):list);
      try{window.renderAppointments?.()}catch(e){}
      try{window.renderManagementDashboard?.()}catch(e){}
      try{window.cloudSyncAppointment?.({})}catch(e){}
    }
    return added;
  }

  function persistRecurrenceToSavedVehicle(prefix,rec,beforeSignature){
    const plate=cleanPlateSafe($(FORM_CONFIG[prefix].plateId)?.value||'');if(!plate)return;
    let vehicles=[];
    try{vehicles=JSON.parse(localStorage.getItem(window.STORAGE_VEHICLES||'vaporeasy_vehicles_v1')||'[]')||[]}catch(e){vehicles=[]}
    let idx=vehicles.findIndex(v=>cleanPlateSafe(v.plate||'')===plate);
    if(idx<0){
      const merged=typeof window.getVehicles==='function'?window.getVehicles():[];
      const v=merged.find(x=>cleanPlateSafe(x.plate||'')===plate);if(v){vehicles.push({...v});idx=vehicles.length-1;}
    }
    if(idx<0)return;
    const old=normalizeRecurrence(vehicles[idx][REC_FIELD]);
    const changed=beforeSignature!==recurrenceSignature(rec);
    if(changed)rec.skipSlots=[];
    vehicles[idx]={...vehicles[idx],[REC_FIELD]:{...rec,updatedAt:new Date().toISOString()},updatedAt:new Date().toISOString()};
    localStorage.setItem(window.STORAGE_VEHICLES||'vaporeasy_vehicles_v1',JSON.stringify(vehicles));
    ensureVehicleRecurrence(vehicles[idx],{oldRec:old,settingsChanged:changed});
    try{window.cloudSyncVehicle?.(vehicles[idx])}catch(e){}
    try{window.renderClientVehicles?.(vehicles[idx].client||'')}catch(e){}
  }

  function wrapVehicleSave(fnName,prefix){
    const original=window[fnName];if(typeof original!=='function' || original.__vpRecWrapped)return;
    const wrapped=function(){
      const validation=validateForm(prefix);
      if(!validation.ok){showFormError(prefix,validation.message);return;}
      const plate=cleanPlateSafe($(FORM_CONFIG[prefix].plateId)?.value||'');
      const oldVehicle=(typeof window.getVehicles==='function'?window.getVehicles():[]).find(v=>cleanPlateSafe(v.plate||'')===plate);
      const beforeSignature=recurrenceSignature(normalizeRecurrence(oldVehicle?.[REC_FIELD]));
      const result=original.apply(this,arguments);
      setTimeout(()=>persistRecurrenceToSavedVehicle(prefix,validation.rec,beforeSignature),40);
      return result;
    };
    wrapped.__vpRecWrapped=true;wrapped.__vpRecOriginal=original;window[fnName]=wrapped;
  }

  function wrapLoaders(){
    const originalApply=window.applyClientVehicle;
    if(typeof originalApply==='function'&&!originalApply.__vpRecWrapped){
      window.applyClientVehicle=function(v){const r=originalApply.apply(this,arguments);setTimeout(()=>loadForm('cv',v),0);return r};window.applyClientVehicle.__vpRecWrapped=true;
    }
    const originalOpen=window.openVehicle;
    if(typeof originalOpen==='function'&&!originalOpen.__vpRecWrapped){
      window.openVehicle=function(plate){const r=originalOpen.apply(this,arguments);const v=(typeof window.getVehicles==='function'?window.getVehicles():[]).find(x=>cleanPlateSafe(x.plate||'')===cleanPlateSafe(plate));setTimeout(()=>loadForm('rg',v),0);return r};window.openVehicle.__vpRecWrapped=true;
    }
    const originalPrepare=window.prepareAddVehicleForSelectedClient;
    if(typeof originalPrepare==='function'&&!originalPrepare.__vpRecWrapped){
      window.prepareAddVehicleForSelectedClient=function(){const r=originalPrepare.apply(this,arguments);setTimeout(()=>resetForm('cv'),0);return r};window.prepareAddVehicleForSelectedClient.__vpRecWrapped=true;
    }
    const originalNew=window.newVehicleFromSearch;
    if(typeof originalNew==='function'&&!originalNew.__vpRecWrapped){
      window.newVehicleFromSearch=function(){const r=originalNew.apply(this,arguments);setTimeout(()=>resetForm('rg'),0);return r};window.newVehicleFromSearch.__vpRecWrapped=true;
    }
  }

  function recurrenceLabel(v){
    const r=normalizeRecurrence(v?.[REC_FIELD]);if(r.frequency==='none')return '';
    return `${FREQ_LABEL[r.frequency]} • ${WEEKDAY_LABEL[r.weekday]} • ${r.time}`;
  }

  function decorateClientVehicles(){
    const box=$('clientVehiclesList');if(!box)return;
    [...box.querySelectorAll('.item')].forEach(item=>{
      if(item.querySelector('.vp-rec-badge'))return;
      const tag=item.querySelector('.tag');const plate=cleanPlateSafe(tag?.textContent||'');
      if(!plate)return;
      const v=(typeof window.getVehicles==='function'?window.getVehicles():[]).find(x=>cleanPlateSafe(x.plate||'')===plate);
      const label=recurrenceLabel(v);if(!label)return;
      const badge=document.createElement('div');badge.className='vp-rec-badge';badge.textContent='↻ '+label;
      const small=item.querySelector('small');(small||item).insertAdjacentElement('afterend',badge);
    });
  }

  function wrapClientVehicleRender(){
    const original=window.renderClientVehicles;if(typeof original!=='function'||original.__vpRecWrapped)return;
    window.renderClientVehicles=function(){const r=original.apply(this,arguments);setTimeout(decorateClientVehicles,0);return r};window.renderClientVehicles.__vpRecWrapped=true;
  }

  function injectTeamModal(){
    if($('vpRecTeamBackdrop'))return;
    const div=document.createElement('div');div.id='vpRecTeamBackdrop';div.innerHTML=`
      <div class="vp-rec-team-sheet" role="dialog" aria-modal="true">
        <div class="vp-rec-team-head"><div><h3>Equipe do atendimento</h3></div><button type="button" id="vpRecTeamClose">×</button></div>
        <div id="vpRecTeamInfo" class="vp-rec-team-info"></div>
        <label>Equipe / colaborador</label><select id="vpRecTeamSelect"></select>
        <div id="vpRecTeamError" class="vp-rec-error"></div>
        <div class="vp-rec-team-actions"><button type="button" class="btn-ghost" id="vpRecTeamCancel">Cancelar</button><button type="button" class="btn-primary" id="vpRecTeamSave">Salvar equipe</button></div>
      </div>`;
    document.body.appendChild(div);
    const close=()=>{div.classList.remove('open');div.dataset.appointmentId='';document.body.style.overflow=''};
    $('vpRecTeamClose').onclick=close;$('vpRecTeamCancel').onclick=close;div.addEventListener('click',e=>{if(e.target===div)close()});
    $('vpRecTeamSave').onclick=saveTeamAssignment;
  }

  function activeCollaborators(){
    let list=[];try{list=typeof window.getCollaborators==='function'?window.getCollaborators():[]}catch(e){}
    return list.filter(c=>{const s=norm(c.status||'Ativo');return !s||s==='ativo'}).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  }

  function openTeamAssignment(id){
    injectTeamModal();
    const a=(typeof window.getAppointments==='function'?window.getAppointments():[]).find(x=>String(x.id)===String(id));if(!a)return;
    const modal=$('vpRecTeamBackdrop');modal.dataset.appointmentId=String(id);
    $('vpRecTeamInfo').textContent=`${a.client||'Cliente'} • ${a.vehicle||''} • ${String(a.date||'').split('-').reverse().join('/')} às ${String(a.time||'').slice(0,5)}${a.service?' • '+a.service:''}`;
    const select=$('vpRecTeamSelect');select.innerHTML='<option value="">Equipe não definida</option>'+activeCollaborators().map(c=>`<option value="${String(c.name).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}">${String(c.name).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</option>`).join('');
    select.value=a.collaborator||'';$('vpRecTeamError').textContent='';
    modal.classList.add('open');document.body.style.overflow='hidden';
  }

  function clockMinutes(v){
    const m=String(v||'').match(/^(\d{1,2}):(\d{2})/);if(!m)return null;return Number(m[1])*60+Number(m[2]);
  }

  function durationMinutes(service){
    try{return Math.max(1,Number(window.serviceDurationMinutesByName?.(service))||90)}catch(e){return 90}
  }

  function teamConflict(appt,collaborator){
    if(!collaborator)return null;
    const start=clockMinutes(appt.time);if(start===null)return null;const end=start+durationMinutes(appt.service);
    const list=typeof window.getAppointments==='function'?window.getAppointments():[];
    for(const other of list){
      if(String(other.id)===String(appt.id))continue;
      if(String(other.date||'')!==String(appt.date||''))continue;
      if(norm(other.collaborator||'')!==norm(collaborator))continue;
      if(typeof window.isAgendaAppointmentActive==='function'&&!window.isAgendaAppointmentActive(other))continue;
      const os=clockMinutes(other.time);if(os===null)continue;const oe=os+durationMinutes(other.service);
      if(start<oe&&end>os)return other;
    }
    return null;
  }

  function saveTeamAssignment(){
    const modal=$('vpRecTeamBackdrop');const id=modal?.dataset.appointmentId||'';
    const list=typeof window.getAppointments==='function'?window.getAppointments():[];const idx=list.findIndex(a=>String(a.id)===String(id));if(idx<0)return;
    const selected=$('vpRecTeamSelect')?.value||'';
    const conflict=teamConflict(list[idx],selected);
    if(conflict){$('vpRecTeamError').textContent=`Conflito: ${selected} já possui ${conflict.client||'outro atendimento'} às ${String(conflict.time||'').slice(0,5)}.`;return;}
    list[idx].collaborator=selected;
    list[idx].needsTeamAssignment=!selected;
    list[idx].updatedAt=new Date().toISOString();
    if(typeof window.setAppointments==='function')window.setAppointments(list);
    try{window.cloudSyncAppointment?.(list[idx])}catch(e){}
    modal.classList.remove('open');modal.dataset.appointmentId='';document.body.style.overflow='';
    try{window.renderAppointments?.()}catch(e){}
    try{window.refreshAppointmentAvailability?.()}catch(e){}
    if(typeof window.showToast==='function')window.showToast(selected?'Equipe definida para este atendimento.':'Atendimento ficou sem equipe definida.','success');
  }

  function decorateAgendaTeams(){
    const all=typeof window.getAppointments==='function'?window.getAppointments():[];
    document.querySelectorAll('#agendaTimeline .timeline-actions').forEach(actions=>{
      if(actions.querySelector('.vp-rec-team-btn'))return;
      const any=actions.querySelector('[data-id]');const id=any?.dataset?.id;if(!id)return;
      const a=all.find(x=>String(x.id)===String(id));if(!a?.vehicleRecurrenceGenerated)return;
      const btn=document.createElement('button');btn.type='button';btn.className='btn-ghost vp-rec-team-btn';btn.textContent=a.collaborator?'Trocar equipe':'Definir equipe';btn.dataset.id=id;btn.onclick=()=>openTeamAssignment(id);actions.prepend(btn);
    });
  }

  function wrapAgendaRender(){
    const original=window.renderAgendaTimeline;if(typeof original!=='function'||original.__vpRecWrapped)return;
    window.renderAgendaTimeline=function(){const r=original.apply(this,arguments);setTimeout(decorateAgendaTeams,0);return r};window.renderAgendaTimeline.__vpRecWrapped=true;
    const oldBlock=window.appointmentBlocksCollaborator;
    if(typeof oldBlock==='function'&&!oldBlock.__vpRecWrapped){
      const wrapped=function(a,collaborator){if(a?.vehicleRecurrenceGenerated&&!String(a.collaborator||'').trim())return false;return oldBlock(a,collaborator)};wrapped.__vpRecWrapped=true;window.appointmentBlocksCollaborator=wrapped;
    }
  }

  function wrapDelete(){
    const original=window.deleteAppointment;if(typeof original!=='function'||original.__vpRecWrapped)return;
    const wrapped=async function(id){
      const a=(typeof window.getAppointments==='function'?window.getAppointments():[]).find(x=>String(x.id)===String(id));
      const result=await original.apply(this,arguments);
      const stillExists=(typeof window.getAppointments==='function'?window.getAppointments():[]).some(x=>String(x.id)===String(id));
      if(a?.vehicleRecurrenceGenerated && !stillExists){
        const plate=cleanPlateSafe(a.vehicle||'');
        let vehicles=[];try{vehicles=JSON.parse(localStorage.getItem(window.STORAGE_VEHICLES||'vaporeasy_vehicles_v1')||'[]')||[]}catch(e){}
        const vi=vehicles.findIndex(v=>cleanPlateSafe(v.plate||'')===plate);
        if(vi>=0){
          const rec=normalizeRecurrence(vehicles[vi][REC_FIELD]);const slot=String(a.date||'')+'|'+String(a.time||'').slice(0,5);
          if(!rec.skipSlots.includes(slot))rec.skipSlots.push(slot);
          rec.updatedAt=new Date().toISOString();vehicles[vi][REC_FIELD]=rec;vehicles[vi].updatedAt=rec.updatedAt;
          localStorage.setItem(window.STORAGE_VEHICLES||'vaporeasy_vehicles_v1',JSON.stringify(vehicles));
          try{window.cloudSyncVehicle?.(vehicles[vi])}catch(e){}
        }
      }
      return result;
    };
    wrapped.__vpRecWrapped=true;window.deleteAppointment=wrapped;
  }

  function ensureAllVehicleRecurrences(){
    let vehicles=[];try{vehicles=typeof window.getVehicles==='function'?window.getVehicles():[]}catch(e){}
    let added=0;for(const v of vehicles){const r=normalizeRecurrence(v?.[REC_FIELD]);if(r.frequency!=='none')added+=ensureVehicleRecurrence(v);}
    return added;
  }

  function init(){
    injectStyle();injectForm('cv');injectForm('rg');injectTeamModal();
    wrapVehicleSave('addVehicleToClient','cv');wrapVehicleSave('saveVehicle','rg');
    wrapLoaders();wrapClientVehicleRender();wrapAgendaRender();wrapDelete();
    setTimeout(()=>{try{ensureAllVehicleRecurrences();decorateClientVehicles();decorateAgendaTeams()}catch(e){console.warn('Recorrência Vaporeasy:',e)}},1200);
    setTimeout(()=>{try{ensureAllVehicleRecurrences()}catch(e){}},5000);
    window.vpEnsureVehicleRecurrences=ensureAllVehicleRecurrences;
    window.vpVehicleRecurrenceVersion=VERSION;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
