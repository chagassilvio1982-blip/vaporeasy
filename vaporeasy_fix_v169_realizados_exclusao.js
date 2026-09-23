/* Vaporeasy v169 — edição de serviços realizados + exclusão persistente de agendamentos
   Instalar este arquivo no final do index.html:
   <script src="./vaporeasy_fix_v169_realizados_exclusao.js?v=169"></script>
*/
(function(){
  'use strict';
  if(window.__vpV169Installed)return;
  window.__vpV169Installed=true;

  const V169_BUILD='v169-realizados-edit-delete-persist-2026-09-23';

  function profile(){
    try{return window.vpGetCurrentProfile?.()||null}catch(_){return null}
  }
  function isManager(){
    return ['owner','admin'].includes(profile()?.role||'');
  }
  function safe(v){
    try{return typeof esc==='function'?esc(v):String(v??'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;')}catch(_){return ''}
  }
  function norm(v){
    try{
      if(typeof normalizeText==='function')return normalizeText(v||'');
      return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
    }catch(_){return String(v||'').trim().toLowerCase()}
  }
  function plate(v){
    try{return typeof cleanPlate==='function'?cleanPlate(v||''):String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
    catch(_){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
  }
  function money(v){
    try{return typeof moneyBR==='function'?moneyBR(v):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
    catch(_){return 'R$ '+Number(v||0).toFixed(2).replace('.',',')}
  }
  function history(){
    try{return typeof getServiceHistory==='function'?getServiceHistory():[]}catch(_){return []}
  }
  function finance(){
    try{return typeof getFinanceTransactions==='function'?getFinanceTransactions():[]}catch(_){return []}
  }
  function appointments(){
    try{return typeof getAppointments==='function'?getAppointments():[]}catch(_){return []}
  }
  function sameLogicalRecord(r,a){
    if(!r||!a)return false;
    const sameClient=norm(r.client)===norm(a.client);
    const sameDate=String(r.date||'')===String(a.date||'');
    const sameTime=String(r.time||'').slice(0,5)===String(a.time||'').slice(0,5);
    const rv=plate(r.vehicle||r.plate||''), av=plate(a.vehicle||a.plate||'');
    const sameVehicle=!rv||!av||rv===av;
    return sameClient&&sameDate&&sameTime&&sameVehicle;
  }
  function findLinkedAppointment(h){
    const list=appointments();
    if(h?.appointmentId){
      const exact=list.find(a=>String(a.id||'')===String(h.appointmentId)||String(a.cloudId||'')===String(h.appointmentId));
      if(exact)return exact;
    }
    return list.find(a=>sameLogicalRecord(h,a) && norm(a.status).includes('conclu')) || null;
  }

  function injectStyle(){
    if(document.getElementById('vp-v169-style'))return;
    const s=document.createElement('style');
    s.id='vp-v169-style';
    s.textContent=`
      .vp-v169-realized-actions{display:flex;justify-content:flex-end;margin-top:10px}
      .vp-v169-edit-btn{min-height:36px!important;padding:8px 12px!important;font-size:11px!important;background:#0d3850!important;color:#e9f8ff!important;border:1px solid rgba(38,186,247,.32)!important}
      #vpRealizedEditModal{position:fixed;inset:0;z-index:1600;background:rgba(0,8,14,.78);display:none;align-items:flex-end;justify-content:center;padding:16px}
      #vpRealizedEditModal.show{display:flex}
      .vp-v169-sheet{width:min(560px,100%);max-height:88vh;overflow:auto;background:#071c29;border:1px solid rgba(36,172,232,.3);border-radius:20px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.55)}
      .vp-v169-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}
      .vp-v169-head h3{margin:0;color:#fff;font-size:20px}.vp-v169-head p{margin:5px 0 0;color:#8faebe;font-size:11px;line-height:1.4}
      .vp-v169-close{width:38px;height:38px;padding:0!important;border-radius:50%!important;background:#102d3e!important;color:#fff!important;font-size:22px!important}
      .vp-v169-readonly{padding:10px 12px;margin-bottom:12px;border-radius:12px;background:rgba(17,184,255,.06);border:1px solid rgba(17,184,255,.14)}
      .vp-v169-readonly span{display:block;color:#7899aa;font-size:9px;text-transform:uppercase}.vp-v169-readonly strong{display:block;margin-top:3px;color:#fff;font-size:14px}
      .vp-v169-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.vp-v169-grid .full{grid-column:1/-1}
      .vp-v169-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}.vp-v169-actions button{min-width:120px}
      #vpRealizedEditMsg{display:none;margin-top:10px;padding:9px 10px;border-radius:10px;font-size:11px;line-height:1.4}
      #vpRealizedEditMsg.err{display:block;background:rgba(225,80,90,.09);border:1px solid rgba(225,80,90,.28);color:#ffc2c7}
      #vpRealizedEditMsg.ok{display:block;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);color:#baf3cf}
      @media(max-width:520px){.vp-v169-grid{grid-template-columns:1fr}.vp-v169-grid .full{grid-column:auto}.vp-v169-sheet{border-radius:18px}}
    `;
    document.head.appendChild(s);
  }

  function injectModal(){
    if(document.getElementById('vpRealizedEditModal'))return;
    const d=document.createElement('div');
    d.id='vpRealizedEditModal';
    d.setAttribute('aria-hidden','true');
    d.innerHTML=`
      <div class="vp-v169-sheet" role="dialog" aria-modal="true" aria-label="Editar serviço realizado">
        <div class="vp-v169-head">
          <div><h3>Editar serviço realizado</h3><p>Disponível apenas para proprietário e administrador.</p></div>
          <button type="button" class="vp-v169-close" data-v169-close aria-label="Fechar">×</button>
        </div>
        <div class="vp-v169-readonly"><span>Cliente</span><strong id="vpRealizedEditClient">—</strong></div>
        <div class="vp-v169-grid">
          <div><label>Data</label><input id="vpRealizedEditDate" type="date"></div>
          <div><label>Horário</label><input id="vpRealizedEditTime" type="time" step="1200"></div>
          <div class="full"><label>Veículo / placa</label><input id="vpRealizedEditVehicle" type="text" autocomplete="off"></div>
          <div><label>Serviço</label><select id="vpRealizedEditService"></select></div>
          <div><label>Equipe / colaborador</label><select id="vpRealizedEditCollaborator"></select></div>
          <div class="full"><label>Valor</label><input id="vpRealizedEditValue" type="number" min="0" step="0.01"></div>
          <div class="full"><label>Observações</label><textarea id="vpRealizedEditNotes" rows="3"></textarea></div>
        </div>
        <div id="vpRealizedEditMsg"></div>
        <div class="vp-v169-actions">
          <button type="button" class="btn-ghost" data-v169-close>Cancelar</button>
          <button id="vpRealizedEditSave" type="button" class="btn-primary">Salvar alterações</button>
        </div>
      </div>`;
    document.body.appendChild(d);
    d.addEventListener('click',function(ev){
      if(ev.target===d || ev.target.closest?.('[data-v169-close]'))window.vpCloseRealizedEdit?.();
    });
    d.querySelector('#vpRealizedEditSave')?.addEventListener('click',()=>window.vpSaveRealizedEdit?.());
  }

  let editingHistoryId='';

  function fillSelects(h){
    const service=document.getElementById('vpRealizedEditService');
    if(service){
      const rows=(typeof getServiceCatalog==='function'?getServiceCatalog():[]).filter(s=>!s.disabled);
      service.innerHTML=rows.map(s=>`<option value="${safe(s.name||'')}">${safe(s.name||'')}</option>`).join('');
      service.value=h.service||'';
      if(h.service&&!service.value){
        service.insertAdjacentHTML('afterbegin',`<option value="${safe(h.service)}">${safe(h.service)}</option>`);
        service.value=h.service;
      }
    }
    const coll=document.getElementById('vpRealizedEditCollaborator');
    if(coll){
      const rows=(typeof getCollaborators==='function'?getCollaborators():[]).filter(c=>!c.status||norm(c.status)==='ativo');
      coll.innerHTML='<option value="">Sem colaborador</option>'+rows.map(c=>`<option value="${safe(c.name||'')}">${safe(c.name||'')}</option>`).join('');
      coll.value=h.collaborator||'';
      if(h.collaborator&&!coll.value){
        coll.insertAdjacentHTML('beforeend',`<option value="${safe(h.collaborator)}">${safe(h.collaborator)}</option>`);
        coll.value=h.collaborator;
      }
    }
  }

  function editMsg(text,ok=false){
    const e=document.getElementById('vpRealizedEditMsg');if(!e)return;
    e.textContent=text||'';e.className=ok?'ok':'err';e.style.display=text?'block':'none';
  }

  window.vpOpenRealizedEdit=function(id){
    if(!isManager()){
      if(typeof showToast==='function')showToast('Somente proprietário ou administrador pode editar serviços realizados.','error');
      return;
    }
    const h=history().find(x=>String(x.id||'')===String(id));
    if(!h){
      if(typeof showToast==='function')showToast('Serviço realizado não encontrado.','error');
      return;
    }
    editingHistoryId=String(h.id||id);
    injectStyle();injectModal();
    document.getElementById('vpRealizedEditClient').textContent=h.client||'Cliente';
    document.getElementById('vpRealizedEditDate').value=h.date||'';
    document.getElementById('vpRealizedEditTime').value=String(h.time||'').slice(0,5);
    document.getElementById('vpRealizedEditVehicle').value=h.vehicle||'';
    document.getElementById('vpRealizedEditValue').value=Number(h.value||0);
    document.getElementById('vpRealizedEditNotes').value=h.notes||'';
    fillSelects(h);
    editMsg('');
    const m=document.getElementById('vpRealizedEditModal');
    m?.classList.add('show');m?.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
  };

  window.vpCloseRealizedEdit=function(){
    const m=document.getElementById('vpRealizedEditModal');
    m?.classList.remove('show');m?.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
    editingHistoryId='';
  };

  window.vpSaveRealizedEdit=async function(){
    if(!isManager()){editMsg('Somente proprietário ou administrador pode salvar esta alteração.');return}
    const hs=history();
    const hi=hs.findIndex(x=>String(x.id||'')===String(editingHistoryId));
    if(hi<0){editMsg('Serviço realizado não encontrado.');return}
    const oldH=hs[hi], linked=findLinkedAppointment(oldH);
    const date=document.getElementById('vpRealizedEditDate')?.value||'';
    const time=document.getElementById('vpRealizedEditTime')?.value||'';
    const vehicle=document.getElementById('vpRealizedEditVehicle')?.value.trim()||'';
    const service=document.getElementById('vpRealizedEditService')?.value||'';
    const collaborator=document.getElementById('vpRealizedEditCollaborator')?.value||'';
    const notes=document.getElementById('vpRealizedEditNotes')?.value||'';
    const value=Number(document.getElementById('vpRealizedEditValue')?.value||0);
    if(!date||!time||!vehicle||!service||!Number.isFinite(value)||value<0){
      editMsg('Preencha data, horário, veículo, serviço e um valor válido.');return;
    }

    const btn=document.getElementById('vpRealizedEditSave');
    if(btn){btn.disabled=true;btn.textContent='Salvando…'}
    try{
      // Primeiro confirma a alteração estrutural na nuvem quando existe vínculo cloud.
      if(linked?.cloudId && typeof window.vpSecureBridge==='function'){
        await window.vpSecureBridge('appointment_update',{
          method:'POST',
          body:{
            cloud_id:linked.cloudId,
            date,
            time:String(time).slice(0,5),
            vehicle,
            service,
            collaborator,
            status:'Concluído',
            notes
          }
        });
      }

      // Atualiza o agendamento local sem retirar o status de concluído.
      if(linked){
        const list=appointments();
        const ai=list.findIndex(a=>String(a.id||'')===String(linked.id||''));
        if(ai>=0){
          list[ai]={
            ...list[ai],
            date,
            time:String(time).slice(0,5),
            vehicle,
            service,
            collaborator,
            notes,
            value,
            finalValue:value,
            status:'Concluído',
            completedAt:list[ai].completedAt||oldH.completedAt||new Date().toISOString(),
            updatedAt:new Date().toISOString()
          };
          if(typeof setAppointments==='function')setAppointments(list);
        }
      }

      // Atualiza o histórico realizado preservando o vínculo original.
      hs[hi]={
        ...oldH,
        date,
        time:String(time).slice(0,5),
        vehicle,
        service,
        collaborator,
        notes,
        value,
        completedAt:oldH.completedAt||new Date().toISOString()
      };
      if(typeof setServiceHistory==='function')setServiceHistory(hs);

      // Atualiza o lançamento financeiro automático sem mexer no estado de pagamento.
      if(typeof setFinanceTransactions==='function'){
        const fs=finance();
        let changed=false;
        for(let i=0;i<fs.length;i++){
          const f=fs[i]||{};
          const linkedById=oldH.appointmentId && String(f.appointmentId||'')===String(oldH.appointmentId);
          const linkedByLogic=f.source==='appointment' && sameLogicalRecord(f,oldH);
          if(f.source==='appointment' && (linkedById||linkedByLogic)){
            fs[i]={
              ...f,
              date,
              description:[service,oldH.client||'',vehicle].filter(Boolean).join(' • '),
              value,
              client:oldH.client||f.client||'',
              vehicle,
              service
            };
            changed=true;
          }
        }
        if(changed)setFinanceTransactions(fs);
      }

      // O sync seguro envia inclusive os valores base/final.
      try{window.vpSecureSchedule?.()}catch(_){}
      try{if(typeof renderAppointments==='function')renderAppointments()}catch(_){}
      try{if(typeof renderFinanceiro==='function')renderFinanceiro()}catch(_){}
      try{if(typeof renderManagementDashboard==='function')renderManagementDashboard()}catch(_){}
      try{window.renderRealizedServices?.()}catch(_){}

      editMsg('Alterações salvas.',true);
      if(typeof showToast==='function')showToast('Serviço realizado atualizado.','success');
      setTimeout(()=>window.vpCloseRealizedEdit?.(),450);
    }catch(e){
      let m=String(e?.message||e||'Erro ao salvar');
      if(m.includes('schedule_conflict'))m='Este horário entra em conflito com outro atendimento da mesma equipe.';
      else if(m.includes('collaborator_not_found'))m='Equipe/colaborador não encontrado.';
      else if(m.includes('service_not_found'))m='Serviço não encontrado.';
      else if(m.includes('vehicle_not_found'))m='Este veículo não pertence ao cliente deste serviço.';
      editMsg(m);
    }finally{
      if(btn){btn.disabled=false;btn.textContent='Salvar alterações'}
    }
  };

  function patchedRenderRealizedServices(){
    const list=document.getElementById('realizedServicesList');
    const summary=document.getElementById('realizedServicesSummary');
    if(!list)return;
    const q=norm(document.getElementById('realizedServicesSearch')?.value||'');
    const rows=history().slice()
      .filter(h=>!q||norm([h.client,h.vehicle,h.service,h.collaborator].join(' ')).includes(q))
      .sort((a,b)=>String(b.completedAt||b.date||'').localeCompare(String(a.completedAt||a.date||'')));
    const total=rows.reduce((n,h)=>n+(Number(h.value)||0),0);
    if(summary)summary.innerHTML='<b>'+rows.length+' serviço(s) realizado(s)</b> • '+money(total);
    const canEdit=isManager();
    list.innerHTML=rows.length?rows.map(h=>
      '<div class="realized-service-card">'+
        '<div class="top"><div><strong>'+safe(h.client||'Cliente')+'</strong><small>'+
        safe(h.service||'Serviço')+(h.vehicle?' • '+safe(h.vehicle):'')+'<br>'+
        safe((h.date||'').split('-').reverse().join('/'))+(h.time?' às '+safe(h.time):'')+
        (h.collaborator?' • '+safe(h.collaborator):'')+
        '</small></div><div class="value">'+money(h.value||0)+'</div></div>'+
        (canEdit?'<div class="vp-v169-realized-actions"><button type="button" class="vp-v169-edit-btn" data-v169-edit="'+safe(h.id||'')+'">Editar</button></div>':'')+
      '</div>'
    ).join(''):'<div class="no-result">Nenhum serviço realizado encontrado.</div>';
  }

  function installRealizedEdit(){
    injectStyle();injectModal();
    window.renderRealizedServices=patchedRenderRealizedServices;
    try{renderRealizedServices=patchedRenderRealizedServices}catch(_){}
    try{
      if(document.getElementById('realizedServicesPanel') && !document.getElementById('realizedServicesPanel').classList.contains('hidden')){
        patchedRenderRealizedServices();
      }
    }catch(_){}
  }

  document.addEventListener('click',function(ev){
    const b=ev.target.closest?.('[data-v169-edit]');
    if(!b)return;
    ev.preventDefault();ev.stopPropagation();
    window.vpOpenRealizedEdit?.(b.getAttribute('data-v169-edit')||'');
  },true);

  document.addEventListener('keydown',function(ev){
    if(ev.key==='Escape'&&document.getElementById('vpRealizedEditModal')?.classList.contains('show')){
      window.vpCloseRealizedEdit?.();
    }
  });

  // Exclusão definitiva: o registro sai da nuvem antes de qualquer sincronização
  // posterior conseguir reimportá-lo. O tombstone é preservado como proteção local.
  const previousDelete=window.deleteAppointment;
  async function v169DeleteAppointment(id){
    const list=appointments();
    const a=list.find(x=>String(x.id||'')===String(id)||String(x.cloudId||'')===String(id));
    if(!a){
      if(typeof showToast==='function')showToast('Agendamento não encontrado.','error');
      return;
    }
    const when=[a.date,String(a.time||'').slice(0,5)].filter(Boolean).join(' ');
    if(!confirm(
      'Excluir definitivamente este agendamento?\n\n'+
      (a.client||'Cliente')+' • '+(a.vehicle||a.plate||'Veículo não informado')+' • '+when+
      '\n\nEsta ação remove o registro da agenda e da nuvem.'
    ))return;

    const deletedAt=new Date().toISOString();
    try{
      try{if(typeof addAppointmentTombstone==='function')addAppointmentTombstone(a,a.cloudId||'')}catch(_){}

      let remoteResult=null;
      if(typeof window.vpSecureBridge==='function'){
        remoteResult=await window.vpSecureBridge('appointment_delete',{
          method:'POST',
          body:{
            cloudId:a.cloudId||'',
            localId:a.id||'',
            client:a.client||'',
            plate:a.vehicle||a.plate||'',
            date:a.date||'',
            time:String(a.time||'').slice(0,5),
            deletedAt
          }
        });
      }else if(typeof previousDelete==='function'){
        // Em instalações antigas sem a ponte segura, usa a rotina anterior.
        // O tombstone já foi gravado para impedir retorno por pull local.
        return await previousDelete(id);
      }else{
        throw new Error('Conexão segura indisponível.');
      }

      if(remoteResult && remoteResult.ok===false)throw new Error(remoteResult.error||'Falha ao excluir na nuvem');

      if(typeof setAppointments==='function'){
        setAppointments(list.filter(x=>String(x.id||'')!==String(a.id||'')));
      }

      // Se era concluído, remove também os espelhos automáticos de histórico/financeiro.
      if(typeof setServiceHistory==='function'){
        const hs=history();
        const next=hs.filter(h=>{
          const byId=String(h.appointmentId||'')===String(a.id||'') ||
                     (!!a.cloudId && String(h.appointmentId||'')===String(a.cloudId));
          const byLogic=h.source==='appointment' && sameLogicalRecord(h,a);
          return !(byId||byLogic);
        });
        if(next.length!==hs.length)setServiceHistory(next);
      }
      if(typeof setFinanceTransactions==='function'){
        const fs=finance();
        const next=fs.filter(f=>{
          const byId=String(f.appointmentId||'')===String(a.id||'') ||
                     (!!a.cloudId && String(f.appointmentId||'')===String(a.cloudId));
          const byLogic=f.source==='appointment' && sameLogicalRecord(f,a);
          return !(f.source==='appointment' && (byId||byLogic));
        });
        if(next.length!==fs.length)setFinanceTransactions(next);
      }

      try{if(typeof window.vpSecurePullNow==='function')await window.vpSecurePullNow(false)}catch(_){}
      try{if(typeof renderAppointments==='function')renderAppointments()}catch(_){}
      try{if(typeof renderAgendaTimeline==='function')renderAgendaTimeline()}catch(_){}
      try{window.renderRealizedServices?.()}catch(_){}
      try{if(typeof renderFinanceiro==='function')renderFinanceiro()}catch(_){}
      try{if(typeof renderManagementDashboard==='function')renderManagementDashboard()}catch(_){}

      if(typeof showToast==='function')showToast('Agendamento excluído definitivamente.','success');
    }catch(e){
      console.error('V169 appointment delete',e);
      if(typeof showToast==='function')showToast(
        'Não foi possível confirmar a exclusão na nuvem. O agendamento ficou protegido contra retorno neste aparelho.',
        'error'
      );
    }
  }

  function installDelete(){
    window.deleteAppointment=v169DeleteAppointment;
    try{deleteAppointment=v169DeleteAppointment}catch(_){}
  }

  installRealizedEdit();
  installDelete();
  [400,1200,2600].forEach(ms=>setTimeout(function(){
    installRealizedEdit();
    installDelete();
  },ms));

  console.info('Vaporeasy patch ativo:',V169_BUILD);
})();
