/* V176 — conclusão direta e sem "Confirmar".
   Requer vaporeasy-bridge-auth v17+.
   - Remove o botão "Confirmar" da agenda.
   - Atualiza somente o status na nuvem.
   - Não dispara o sync completo ao concluir/cancelar.
   - Atualiza todas as cópias agrupadas pelo V174.
*/
(function(){
  'use strict';
  if(window.__vpV176Installed)return;
  window.__vpV176Installed=true;

  const APPOINTMENTS_KEY='vaporeasy_appointments_v1';
  let busy=false;

  function uniq(values){
    return [...new Set((values||[]).map(v=>String(v||'').trim()).filter(Boolean))];
  }

  function findAppointment(id){
    const rows=(typeof getAppointments==='function'?getAppointments():[])||[];
    const wanted=String(id||'');
    return rows.find(a=>
      String(a?.id||'')===wanted ||
      String(a?.cloudId||'')===wanted ||
      (Array.isArray(a?._duplicateLocalIds)&&a._duplicateLocalIds.map(String).includes(wanted)) ||
      (Array.isArray(a?._duplicateCloudIds)&&a._duplicateCloudIds.map(String).includes(wanted))
    )||null;
  }

  function cloudIds(a){
    return uniq([
      a?.cloudId,
      ...(Array.isArray(a?._duplicateCloudIds)?a._duplicateCloudIds:[])
    ]);
  }

  function writeAppointmentsWithoutFullSync(rows){
    localStorage.setItem(APPOINTMENTS_KEY,JSON.stringify(rows||[]));
  }

  function removeConfirmUI(){
    document.querySelectorAll('.timeline-status-action[data-status="Confirmado"]').forEach(el=>el.remove());
    document.querySelectorAll('#vpAgendaEditStatusSelect option[value="Confirmado"]').forEach(el=>el.remove());
  }

  function installConfirmStyle(){
    if(document.getElementById('vp-v176-hide-confirm'))return;
    const style=document.createElement('style');
    style.id='vp-v176-hide-confirm';
    style.textContent='.timeline-status-action[data-status="Confirmado"]{display:none!important}';
    document.head.appendChild(style);
  }

  function setBusy(id,on){
    const safe=window.CSS&&CSS.escape?CSS.escape(String(id||'')):String(id||'').replace(/"/g,'\\"');
    document.querySelectorAll(
      '.timeline-status-action[data-id="'+safe+'"],.timeline-cancel-action[data-id="'+safe+'"]'
    ).forEach(btn=>{
      btn.disabled=!!on;
      if(on)btn.setAttribute('aria-busy','true');
      else btn.removeAttribute('aria-busy');
    });
  }

  async function persistStatus(a,newStatus){
    if(typeof window.vpSecureBridge!=='function'){
      throw new Error('Sessão segura indisponível. Entre novamente no Vaporeasy.');
    }
    const ids=cloudIds(a);
    const result=await window.vpSecureBridge('appointment_status',{
      method:'POST',
      body:{
        cloud_id:ids[0]||'',
        cloud_ids:ids,
        client:a.client||'',
        vehicle:a.vehicle||a.plate||'',
        date:a.date||'',
        time:String(a.time||'').slice(0,5),
        status:newStatus
      }
    });
    if(result?.ok===false)throw new Error(result.error||'Não foi possível atualizar o status.');
    return result;
  }

  function applyLocalStatus(a,newStatus,remote){
    const rows=(typeof getAppointments==='function'?getAppointments():[])||[];
    const linkedIds=new Set(uniq([
      a?.id,a?.cloudId,
      ...(Array.isArray(a?._duplicateLocalIds)?a._duplicateLocalIds:[]),
      ...(Array.isArray(a?._duplicateCloudIds)?a._duplicateCloudIds:[])
    ]));

    const serverRows=Array.isArray(remote?.appointments)?remote.appointments:[];
    const serverUpdated=serverRows.map(r=>r?.updated_at).filter(Boolean).sort().at(-1);
    const now=serverUpdated||new Date().toISOString();
    let changed=null;

    const next=rows.map(item=>{
      const linked=
        String(item?.id||'')===String(a?.id||'') ||
        linkedIds.has(String(item?.id||'')) ||
        linkedIds.has(String(item?.cloudId||''));

      if(!linked)return item;

      const previous=item.status||'';
      const copy={...item,status:newStatus,updatedAt:now};

      if(newStatus==='Concluído'){
        copy.completedAt=copy.completedAt||now;
      }else{
        try{
          if(typeof isCompletedStatus==='function'&&isCompletedStatus(previous))delete copy.completedAt;
        }catch(_){}
      }

      changed=copy;
      return copy;
    });

    writeAppointmentsWithoutFullSync(next);
    return changed||{...a,status:newStatus,updatedAt:now};
  }

  function refreshAfterStatus(item,previousStatus,newStatus){
    try{if(typeof reconcileVehicleNeedsAfterCompletion==='function')reconcileVehicleNeedsAfterCompletion(item)}catch(_){}
    try{
      if(typeof reconcileCompletedAppointmentRecords==='function'){
        reconcileCompletedAppointmentRecords(item,previousStatus,newStatus);
      }
    }catch(e){console.warn('V176 histórico/financeiro',e)}
    try{if(typeof renderAppointments==='function')renderAppointments()}catch(_){}
    try{if(typeof renderFinanceiro==='function')renderFinanceiro()}catch(_){}
    try{if(typeof renderManagementDashboard==='function')renderManagementDashboard()}catch(_){}
    try{if(typeof renderRealizedServices==='function')renderRealizedServices()}catch(_){}
    removeConfirmUI();
  }

  async function updateAppointmentStatusV176(id,newStatus){
    const a=findAppointment(id);
    if(!a){
      try{if(typeof showToast==='function')showToast('Agendamento não encontrado.','error')}catch(_){}
      return;
    }
    if(busy)return;

    if(newStatus==='Confirmado'){
      return;
    }

    if(newStatus==='Concluído' &&
       typeof appointmentCanBeCompleted==='function' &&
       !appointmentCanBeCompleted(a)){
      const end=typeof appointmentEndClock==='function'
        ? appointmentEndClock(a)
        : 'o término previsto';
      try{
        if(typeof showToast==='function'){
          showToast('Este serviço só poderá ser concluído após '+end+'.','error');
        }
      }catch(_){}
      return;
    }

    const previousStatus=a.status||'';
    busy=true;
    setBusy(id,true);

    try{
      const remote=await persistStatus(a,newStatus);
      const changed=applyLocalStatus(a,newStatus,remote);
      refreshAfterStatus(changed,previousStatus,newStatus);

      try{
        if(typeof window.vpSecurePullNow==='function'){
          await window.vpSecurePullNow(false);
        }
      }catch(_){}

      try{
        if(typeof showToast==='function'){
          showToast(
            newStatus==='Concluído'
              ? 'Serviço concluído e salvo na nuvem.'
              : newStatus==='Cancelado'
                ? 'Agendamento cancelado.'
                : 'Status atualizado.',
            'success'
          );
        }
      }catch(_){}
    }catch(e){
      console.error('V176 status',e);
      try{
        if(typeof window.vpSecurePullNow==='function'){
          await window.vpSecurePullNow(false);
        }
      }catch(_){}
      try{if(typeof renderAppointments==='function')renderAppointments()}catch(_){}

      const raw=String(e?.message||e||'');
      const msg=raw.includes('forbidden')
        ? 'Seu acesso não permite alterar este atendimento.'
        : raw.includes('appointment_not_found')
          ? 'Este agendamento não foi encontrado na nuvem. Atualize a agenda e tente novamente.'
          : 'Não foi possível salvar o status. A agenda foi recarregada sem gravar uma conclusão falsa.';

      try{if(typeof showToast==='function')showToast(msg,'error')}catch(_){}
    }finally{
      busy=false;
      setBusy(id,false);
      removeConfirmUI();
    }
  }

  window.updateAppointmentStatus=updateAppointmentStatusV176;
  try{updateAppointmentStatus=updateAppointmentStatusV176}catch(_){}

  installConfirmStyle();
  removeConfirmUI();

  const observer=new MutationObserver(removeConfirmUI);
  const startObserver=()=>{
    const root=document.getElementById('agendamentos')||document.body;
    observer.observe(root,{childList:true,subtree:true});
    removeConfirmUI();
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',startObserver,{once:true});
  }else{
    startObserver();
  }

  [800,1800,3800,7600,9000].forEach(ms=>setTimeout(()=>{
    window.updateAppointmentStatus=updateAppointmentStatusV176;
    try{updateAppointmentStatus=updateAppointmentStatusV176}catch(_){}
    removeConfirmUI();
  },ms));
})();
