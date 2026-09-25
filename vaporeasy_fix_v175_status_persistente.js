/* Vaporeasy V175 — status persistente
   Corrige Confirmar / Iniciar / Concluir que mudavam apenas o estado local e
   depois voltavam ao status anterior quando o snapshot do Supabase era puxado.

   Regra:
   1) grava primeiro no endpoint seguro appointment_update;
   2) somente depois confirma a alteração local;
   3) faz pull da nuvem e verifica a persistência;
   4) evita duplo clique durante a gravação.
*/
(function(){
  'use strict';
  if(window.__vpV175Installed)return;
  window.__vpV175Installed=true;

  const BUILD='v175-status-persistente-2026-09-25';
  const pending=new Set();

  function isCompleted(status){
    try{
      if(typeof isCompletedStatus==='function')return isCompletedStatus(status);
    }catch(_){}
    return String(status||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().includes('conclu');
  }

  function findAppointment(id){
    try{
      const rows=typeof getAppointments==='function'?getAppointments():[];
      return rows.find(a=>
        String(a?.id||'')===String(id) ||
        String(a?.cloudId||'')===String(id) ||
        (Array.isArray(a?._duplicateCloudIds)&&a._duplicateCloudIds.map(String).includes(String(id))) ||
        (Array.isArray(a?._duplicateLocalIds)&&a._duplicateLocalIds.map(String).includes(String(id)))
      )||null;
    }catch(_){
      return null;
    }
  }

  function setBusy(a,busy,label=''){
    const ids=new Set([
      String(a?.id||''),
      String(a?.cloudId||''),
      ...(Array.isArray(a?._duplicateLocalIds)?a._duplicateLocalIds.map(String):[]),
      ...(Array.isArray(a?._duplicateCloudIds)?a._duplicateCloudIds.map(String):[])
    ].filter(Boolean));

    document.querySelectorAll('.timeline-status-action,[onclick*="updateAppointmentStatus"]').forEach(btn=>{
      const bid=String(btn.getAttribute?.('data-id')||'');
      const onclick=String(btn.getAttribute?.('onclick')||'');
      const matches=(bid&&ids.has(bid)) || [...ids].some(id=>id&&onclick.includes(id));
      if(!matches)return;

      if(busy){
        if(!btn.dataset.vp175Text)btn.dataset.vp175Text=btn.textContent||'';
        btn.disabled=true;
        if(label && (btn.getAttribute('data-status')===label || onclick.includes("'"+label+"'"))){
          btn.textContent='Salvando…';
        }
      }else{
        btn.disabled=false;
        if(btn.dataset.vp175Text){
          btn.textContent=btn.dataset.vp175Text;
          delete btn.dataset.vp175Text;
        }
      }
    });
  }

  function toast(msg,type='success'){
    try{showToast?.(msg,type)}catch(_){}
  }

  async function persistStatus(a,newStatus){
    if(typeof window.vpSecureBridge!=='function'){
      throw new Error('Sessão segura indisponível. Feche e abra o Vaporeasy novamente.');
    }

    const result=await window.vpSecureBridge('appointment_update',{
      method:'POST',
      body:{
        cloud_id:a.cloudId||'',
        client:a.client||'',
        original_date:a.date||'',
        original_time:String(a.time||'').slice(0,5),
        date:a.date||'',
        time:String(a.time||'').slice(0,5),
        vehicle:a.vehicle||a.plate||'',
        service:a.service||'',
        collaborator:a.collaborator||'',
        status:newStatus,
        notes:a.notes||''
      }
    });

    if(!result?.appointment?.id){
      throw new Error('O servidor não confirmou a alteração do atendimento.');
    }

    return result.appointment;
  }

  function applyLocalStatus(a,newStatus,serverRow,previousStatus){
    const rows=typeof getAppointments==='function'?getAppointments():[];
    let i=rows.findIndex(x=>String(x?.id||'')===String(a.id||''));
    if(i<0 && a.cloudId)i=rows.findIndex(x=>String(x?.cloudId||'')===String(a.cloudId));
    if(i<0)return null;

    const now=new Date().toISOString();
    rows[i]={
      ...rows[i],
      status:newStatus,
      cloudId:serverRow?.id||rows[i].cloudId||'',
      updatedAt:now
    };

    if(isCompleted(newStatus)){
      rows[i].completedAt=rows[i].completedAt||now;
    }else if(isCompleted(previousStatus)){
      delete rows[i].completedAt;
    }

    if(typeof setAppointments==='function')setAppointments(rows);
    return rows[i];
  }

  async function updateAppointmentStatusV175(id,newStatus){
    const a=findAppointment(id);
    if(!a){
      toast('Agendamento não encontrado.','error');
      return;
    }

    const key=String(a.cloudId||a.id||id);
    if(pending.has(key))return;

    if(isCompleted(newStatus)){
      try{
        if(typeof appointmentCanBeCompleted==='function' && !appointmentCanBeCompleted(a)){
          const end=typeof appointmentEndClock==='function'?appointmentEndClock(a):'o horário final';
          toast('Este serviço só poderá ser concluído após '+end+'.','error');
          return;
        }
      }catch(_){}
    }

    const allowed=['Agendado','Confirmado','Em atendimento','Concluído','Cancelado'];
    if(!allowed.includes(String(newStatus))){
      toast('Status inválido.','error');
      return;
    }

    pending.add(key);
    setBusy(a,true,newStatus);
    const previousStatus=a.status||'';

    try{
      // A nuvem é confirmada primeiro. Isso elimina a janela em que o pull de
      // 10 segundos podia restaurar o status anterior.
      const serverRow=await persistStatus(a,newStatus);

      const saved=applyLocalStatus(a,newStatus,serverRow,previousStatus);
      if(!saved)throw new Error('O atendimento foi salvo na nuvem, mas não foi encontrado localmente.');

      try{
        if(typeof reconcileVehicleNeedsAfterCompletion==='function'){
          reconcileVehicleNeedsAfterCompletion(saved);
        }
      }catch(_){}

      try{
        if(typeof reconcileCompletedAppointmentRecords==='function'){
          reconcileCompletedAppointmentRecords(saved,previousStatus,newStatus);
        }
      }catch(e){
        console.warn('V175 histórico/financeiro',e);
      }

      try{renderAppointments?.()}catch(_){}
      try{renderFinanceiro?.()}catch(_){}
      try{renderManagementDashboard?.()}catch(_){}
      try{renderRealizedServices?.()}catch(_){}

      // Confirma contra a fonte autoritativa logo após a atualização.
      try{
        if(typeof window.vpSecurePullNow==='function'){
          await window.vpSecurePullNow(false);
        }
      }catch(e){
        console.warn('V175 pull de confirmação',e);
      }

      const check=findAppointment(saved.id||saved.cloudId||id);
      if(check && String(check.status||'')!==String(newStatus)){
        throw new Error('A nuvem devolveu um status diferente após a confirmação.');
      }

      if(newStatus==='Concluído'){
        toast('Serviço concluído e confirmado na nuvem.','success');
      }else if(newStatus==='Confirmado'){
        toast('Agendamento confirmado e sincronizado.','success');
      }else if(newStatus==='Em atendimento'){
        toast('Atendimento iniciado e sincronizado.','success');
      }else if(newStatus==='Cancelado'){
        toast('Agendamento cancelado e sincronizado.','success');
      }else{
        toast('Status atualizado e sincronizado.','success');
      }
    }catch(e){
      console.error('V175 status',e);
      // Não deixa uma alteração apenas visual sobreviver se o servidor não confirmou.
      try{
        if(typeof window.vpSecurePullNow==='function'){
          await window.vpSecurePullNow(false);
        }
      }catch(_){}
      try{renderAppointments?.()}catch(_){}
      toast('Não foi possível salvar o status: '+String(e?.message||e||'erro de sincronização'),'error');
    }finally{
      pending.delete(key);
      setBusy(a,false,newStatus);
    }
  }

  window.updateAppointmentStatus=updateAppointmentStatusV175;
  try{updateAppointmentStatus=updateAppointmentStatusV175}catch(_){}

  // Reaplica após scripts tardios, caso alguma versão antiga reassuma a função.
  [500,1500,3500,7000].forEach(ms=>setTimeout(function(){
    window.updateAppointmentStatus=updateAppointmentStatusV175;
    try{updateAppointmentStatus=updateAppointmentStatusV175}catch(_){}
  },ms));

  console.info('Vaporeasy patch ativo:',BUILD);
})();
