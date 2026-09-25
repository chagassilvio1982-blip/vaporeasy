/* Vaporeasy V174 — anti-duplicidade de agendamentos
   Corrige a duplicação causada pela reconciliação entre a cópia local e a cópia
   devolvida pelo Supabase, que possuem o mesmo id lógico mas passam a ter cloudId.
   Também garante que a exclusão remova todas as cópias lógicas do mesmo agendamento.
*/
(function(){
  'use strict';
  if(window.__vpV174Installed)return;
  window.__vpV174Installed=true;

  const BUILD='v174-anti-duplicidade-agenda-delete-2026-09-25';
  const baseSetAppointments=typeof window.setAppointments==='function'?window.setAppointments:null;
  const baseDeleteAppointment=typeof window.deleteAppointment==='function'?window.deleteAppointment:null;

  function norm(v){
    try{if(typeof normalizeText==='function')return normalizeText(v||'')}catch(_){}
    try{return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}
    catch(_){return String(v||'').trim().toLowerCase()}
  }

  function plate(v){
    try{if(typeof cleanPlate==='function')return cleanPlate(v||'')}catch(_){}
    return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
  }

  function logicalKey(a){
    if(!a)return '';
    return [
      norm(a.client||a.clientName||''),
      plate(a.vehicle||a.plate||''),
      String(a.date||''),
      String(a.time||'').slice(0,5),
      norm(a.service||''),
      norm(a.collaborator||'')
    ].join('|');
  }

  function uniq(list){
    return [...new Set((list||[]).map(v=>String(v||'')).filter(Boolean))];
  }

  function cloudIds(a){
    return uniq([
      a?.cloudId,
      ...(Array.isArray(a?._duplicateCloudIds)?a._duplicateCloudIds:[])
    ]);
  }

  function localIds(a){
    return uniq([
      a?.id,
      ...(Array.isArray(a?._duplicateLocalIds)?a._duplicateLocalIds:[])
    ]);
  }

  function timestamp(a){
    const n=Date.parse(a?.updatedAt||a?.updated_at||a?.createdAt||a?.created_at||'');
    return Number.isFinite(n)?n:0;
  }

  function isCloudTombstoned(a){
    try{
      if(typeof getAppointmentTombstones!=='function')return false;
      const ids=new Set(cloudIds(a));
      if(!ids.size)return false;
      return (getAppointmentTombstones()||[]).some(t=>t?.cloudId&&ids.has(String(t.cloudId)));
    }catch(_){
      return false;
    }
  }

  function preferredLocalId(a,b){
    const ids=uniq([...localIds(a),...localIds(b)]);
    return ids.find(id=>!/^cloudag_/i.test(id))||ids[0]||'';
  }

  function mergeDuplicate(a,b){
    const newer=timestamp(b)>=timestamp(a)?b:a;
    const older=newer===b?a:b;
    const merged={...older,...newer};

    ['client','vehicle','date','time','service','collaborator','notes','status'].forEach(k=>{
      if((merged[k]===undefined||merged[k]===null||String(merged[k])==='') &&
         older?.[k]!==undefined){
        merged[k]=older[k];
      }
    });

    const allCloud=uniq([...cloudIds(a),...cloudIds(b)]);
    const allLocal=uniq([...localIds(a),...localIds(b)]);
    const stableId=preferredLocalId(a,b);

    if(stableId)merged.id=stableId;

    if(allCloud.length){
      const preferred=String(newer?.cloudId||a?.cloudId||b?.cloudId||allCloud[0]);
      merged.cloudId=allCloud.includes(preferred)?preferred:allCloud[0];
      merged._duplicateCloudIds=allCloud.filter(x=>x!==String(merged.cloudId||''));
    }

    merged._duplicateLocalIds=allLocal.filter(x=>x!==String(merged.id||''));
    return merged;
  }

  function dedupeAppointmentsV174(rows){
    const out=[];
    const positions=new Map();

    for(const row of (Array.isArray(rows)?rows:[])){
      if(!row)continue;
      if(isCloudTombstoned(row))continue;

      const key=logicalKey(row);
      if(!key||key==='|||||'){
        out.push(row);
        continue;
      }

      if(!positions.has(key)){
        positions.set(key,out.length);
        out.push(row);
      }else{
        const i=positions.get(key);
        out[i]=mergeDuplicate(out[i],row);
      }
    }

    return out;
  }

  function installStoreGuard(){
    if(!baseSetAppointments)return;

    const guarded=function(rows){
      return baseSetAppointments(dedupeAppointmentsV174(rows));
    };
    guarded.__vp174=true;

    window.setAppointments=guarded;
    try{setAppointments=guarded}catch(_){}

    try{
      const current=typeof getAppointments==='function'?getAppointments():[];
      guarded(current);
    }catch(e){
      console.warn('V174: limpeza inicial da agenda',e);
    }
  }

  function automaticLinkedIds(target,group){
    return uniq([
      ...localIds(target),
      ...cloudIds(target),
      ...(group||[]).flatMap(x=>[...localIds(x),...cloudIds(x)])
    ]);
  }

  function removeAutomaticMirrors(ids){
    const idset=new Set((ids||[]).map(String));

    try{
      if(typeof getServiceHistory==='function'&&typeof setServiceHistory==='function'){
        const rows=getServiceHistory()||[];
        const next=rows.filter(r=>!(
          r?.source==='appointment' &&
          idset.has(String(r.appointmentId||''))
        ));
        if(next.length!==rows.length)setServiceHistory(next);
      }
    }catch(e){
      console.warn('V174: limpeza do histórico',e);
    }

    try{
      if(typeof getFinanceTransactions==='function'&&typeof setFinanceTransactions==='function'){
        const rows=getFinanceTransactions()||[];
        const next=rows.filter(r=>!(
          r?.source==='appointment' &&
          idset.has(String(r.appointmentId||''))
        ));
        if(next.length!==rows.length)setFinanceTransactions(next);
      }
    }catch(e){
      console.warn('V174: limpeza do financeiro',e);
    }
  }

  async function deleteAppointmentV174(id){
    const list=typeof getAppointments==='function'?(getAppointments()||[]):[];

    const target=list.find(a=>
      String(a?.id||'')===String(id) ||
      String(a?.cloudId||'')===String(id) ||
      (Array.isArray(a?._duplicateCloudIds)&&a._duplicateCloudIds.map(String).includes(String(id))) ||
      (Array.isArray(a?._duplicateLocalIds)&&a._duplicateLocalIds.map(String).includes(String(id)))
    );

    if(!target){
      try{showToast?.('Agendamento não encontrado.','error')}catch(_){}
      return;
    }

    const key=logicalKey(target);
    const group=list.filter(a=>logicalKey(a)===key);
    const allCloud=uniq(group.flatMap(cloudIds));
    const allLinked=automaticLinkedIds(target,group);
    const when=[target.date,String(target.time||'').slice(0,5)].filter(Boolean).join(' ');

    if(!confirm(
      'Excluir definitivamente este agendamento?\n\n'+
      (target.client||'Cliente')+' • '+
      (target.vehicle||target.plate||'Veículo não informado')+' • '+when+
      '\n\nTodas as cópias duplicadas deste mesmo agendamento serão removidas.'
    ))return;

    const bodyBase={
      localId:target.id||'',
      client:target.client||'',
      plate:target.vehicle||target.plate||'',
      date:target.date||'',
      time:String(target.time||'').slice(0,5),
      deletedAt:new Date().toISOString()
    };

    try{
      // Protege contra retorno de cópias antigas durante a sincronização.
      try{
        if(typeof addAppointmentTombstone==='function'){
          if(allCloud.length){
            allCloud.forEach(cid=>addAppointmentTombstone(target,cid));
          }else{
            addAppointmentTombstone(target,'');
          }
        }
      }catch(_){}

      if(typeof window.vpSecureBridge==='function'){
        if(allCloud.length){
          const failed=[];
          for(const cid of allCloud){
            try{
              await window.vpSecureBridge('appointment_delete',{
                method:'POST',
                body:{...bodyBase,cloudId:cid}
              });
            }catch(e){
              failed.push(e);
            }
          }

          // Fallback por identidade lógica caso alguma réplica antiga não tenha
          // sido removida pelo UUID da nuvem.
          if(failed.length){
            try{
              await window.vpSecureBridge('appointment_delete',{
                method:'POST',
                body:{...bodyBase,cloudId:''}
              });
            }catch(_){}
          }
        }else{
          await window.vpSecureBridge('appointment_delete',{
            method:'POST',
            body:{...bodyBase,cloudId:''}
          });
        }
      }else if(typeof baseDeleteAppointment==='function'){
        return await baseDeleteAppointment(target.id||id);
      }else{
        throw new Error('Conexão segura indisponível.');
      }

      if(typeof window.setAppointments==='function'){
        window.setAppointments(list.filter(a=>logicalKey(a)!==key));
      }

      removeAutomaticMirrors(allLinked);

      try{
        if(typeof window.vpSecurePullNow==='function'){
          await window.vpSecurePullNow(false);
        }
      }catch(_){}

      // Reaplica a deduplicação após o pull.
      try{
        const now=typeof getAppointments==='function'?getAppointments():[];
        if(typeof window.setAppointments==='function')window.setAppointments(now);
      }catch(_){}

      try{renderAppointments?.()}catch(_){}
      try{renderAgendaTimeline?.()}catch(_){}
      try{renderRealizedServices?.()}catch(_){}
      try{renderFinanceiro?.()}catch(_){}
      try{renderManagementDashboard?.()}catch(_){}

      try{
        showToast?.('Agendamento e cópias duplicadas excluídos.','success');
      }catch(_){}
    }catch(e){
      console.error('V174: exclusão',e);
      try{
        showToast?.('Não foi possível concluir a exclusão na nuvem. Tente novamente.','error');
      }catch(_){}
    }
  }

  function installDeleteGuard(){
    window.deleteAppointment=deleteAppointmentV174;
    try{deleteAppointment=deleteAppointmentV174}catch(_){}
  }

  window.vp174RepairDuplicates=function(){
    try{
      const before=typeof getAppointments==='function'?(getAppointments()||[]):[];
      const after=dedupeAppointmentsV174(before);

      if(typeof window.setAppointments==='function'){
        window.setAppointments(after);
      }

      try{renderAppointments?.()}catch(_){}
      try{renderAgendaTimeline?.()}catch(_){}

      return {
        before:before.length,
        after:after.length,
        removed:Math.max(0,before.length-after.length)
      };
    }catch(e){
      console.warn('V174: reparo',e);
      return {before:0,after:0,removed:0,error:String(e?.message||e)};
    }
  };

  installStoreGuard();
  installDeleteGuard();

  // O patch V169 reaplica a exclusão antiga nos primeiros segundos do load.
  // V174 reassume por último para ficar como rotina definitiva.
  [700,1800,3600,7000].forEach(ms=>setTimeout(function(){
    installDeleteGuard();
    try{window.vp174RepairDuplicates()}catch(_){}
  },ms));

  console.info('Vaporeasy patch ativo:',BUILD);
})();
