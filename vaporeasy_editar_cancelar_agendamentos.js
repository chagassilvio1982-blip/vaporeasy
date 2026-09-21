/* Vaporeasy — edição e cancelamento seguro de agendamentos */
(function(){
  'use strict';

  let editId='';

  function esc(v){
    return String(v??'').replace(/[&<>"']/g,m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  function activeServices(){
    try{
      return (typeof getServiceCatalog==='function'?getServiceCatalog():[])
        .filter(s=>!s.disabled && String(s.name||'').trim());
    }catch(_){ return []; }
  }

  function activeCollaborators(){
    try{
      const list=typeof getCollaborators==='function'?getCollaborators():[];
      return list.filter(c=>{
        const st=String(c.status||'Ativo').trim().toLowerCase();
        return st!=='inativo' && st!=='inactive';
      });
    }catch(_){ return []; }
  }

  function ensureUI(){
    if(document.getElementById('vpEditAppointmentModal'))return;

    const style=document.createElement('style');
    style.id='vpEditAppointmentStyle';
    style.textContent=`
      .timeline-actions .vp-edit-appointment{
        border-color:rgba(17,184,255,.38)!important;
        color:#9be4ff!important;
        background:rgba(17,184,255,.07)!important
      }
      #vpEditAppointmentModal{
        position:fixed;inset:0;z-index:12000;
        background:rgba(0,7,12,.78);
        display:none;align-items:flex-end;justify-content:center;
        padding:14px
      }
      #vpEditAppointmentModal.show{display:flex}
      .vp-edit-sheet{
        width:min(560px,100%);max-height:92vh;overflow:auto;
        background:#092131;border:1px solid rgba(17,184,255,.28);
        border-radius:20px 20px 14px 14px;
        box-shadow:0 -16px 50px rgba(0,0,0,.38);
        padding:18px
      }
      .vp-edit-head{
        display:flex;justify-content:space-between;gap:12px;align-items:flex-start;
        margin-bottom:12px
      }
      .vp-edit-head h3{margin:0;font-size:19px}
      .vp-edit-head small{display:block;color:#8ca8b8;margin-top:4px}
      .vp-edit-close{
        border:0;background:rgba(255,255,255,.06);color:#fff;
        width:36px;height:36px;border-radius:11px;font-size:22px
      }
      .vp-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .vp-edit-grid .full{grid-column:1/-1}
      .vp-edit-sheet label{
        display:block;margin:10px 0 5px;color:#9cb8c8;
        font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em
      }
      .vp-edit-sheet input,.vp-edit-sheet select,.vp-edit-sheet textarea{
        width:100%;box-sizing:border-box
      }
      .vp-edit-readonly{
        padding:11px 12px;border-radius:12px;
        border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.035);
        color:#d9edf6;font-size:13px
      }
      .vp-edit-actions{display:flex;gap:9px;margin-top:16px}
      .vp-edit-actions button{flex:1}
      @media(max-width:420px){
        .vp-edit-grid{grid-template-columns:1fr}
        .vp-edit-grid .full{grid-column:auto}
      }
    `;
    document.head.appendChild(style);

    const modal=document.createElement('div');
    modal.id='vpEditAppointmentModal';
    modal.innerHTML=`
      <div class="vp-edit-sheet">
        <div class="vp-edit-head">
          <div>
            <h3>Editar agendamento</h3>
            <small id="vpEditAppointmentSubtitle">—</small>
          </div>
          <button class="vp-edit-close" type="button" onclick="vpCloseEditAppointment()">×</button>
        </div>

        <div class="vp-edit-grid">
          <div class="full">
            <label>Cliente / veículo</label>
            <div id="vpEditAppointmentIdentity" class="vp-edit-readonly">—</div>
          </div>

          <div>
            <label>Data</label>
            <input id="vpEditAppointmentDate" type="date">
          </div>
          <div>
            <label>Horário</label>
            <input id="vpEditAppointmentTime" type="time" step="1200">
          </div>

          <div class="full">
            <label>Serviço</label>
            <select id="vpEditAppointmentService"></select>
          </div>

          <div class="full">
            <label>Equipe / colaborador</label>
            <select id="vpEditAppointmentCollaborator"></select>
          </div>

          <div class="full">
            <label>Status</label>
            <select id="vpEditAppointmentStatus">
              <option value="Agendado">Agendado</option>
              <option value="Confirmado">Confirmado</option>
              <option value="Em atendimento">Em atendimento</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </div>

          <div class="full">
            <label>Observações</label>
            <textarea id="vpEditAppointmentNotes" rows="4" placeholder="Observações do atendimento"></textarea>
          </div>
        </div>

        <div id="vpEditAppointmentMessage" class="notice hidden" style="margin-top:12px"></div>

        <div class="vp-edit-actions">
          <button type="button" class="btn-ghost" onclick="vpCloseEditAppointment()">Voltar</button>
          <button id="vpEditAppointmentSave" type="button" class="btn-primary" onclick="vpSaveEditAppointment()">Salvar alterações</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click',e=>{
      if(e.target===modal)window.vpCloseEditAppointment();
    });
  }

  function setMessage(text,type=''){
    const el=document.getElementById('vpEditAppointmentMessage');
    if(!el)return;
    if(!text){
      el.textContent='';
      el.classList.add('hidden');
      return;
    }
    el.textContent=text;
    el.classList.remove('hidden');
    el.classList.toggle('err',type==='err');
  }

  function installEditButtons(){
    document.querySelectorAll('.timeline-actions').forEach(actions=>{
      if(actions.querySelector('.vp-edit-appointment'))return;
      const cancel=actions.querySelector('.timeline-cancel-action');
      if(!cancel)return;

      const id=cancel.getAttribute('data-id')||'';
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn-ghost vp-edit-appointment';
      btn.setAttribute('data-id',id);
      btn.textContent='Editar';
      actions.insertBefore(btn,cancel);
    });
  }

  window.vpOpenEditAppointment=function(id){
    ensureUI();
    const list=typeof getAppointments==='function'?getAppointments():[];
    const a=list.find(x=>String(x.id)===String(id));
    if(!a){
      try{showToast?.('Agendamento não encontrado.','error')}catch(_){}
      return;
    }

    editId=String(id);
    setMessage('');

    document.getElementById('vpEditAppointmentSubtitle').textContent=
      [a.date||'',String(a.time||'').slice(0,5)].filter(Boolean).join(' • ');
    document.getElementById('vpEditAppointmentIdentity').textContent=
      (a.client||'Cliente')+' • '+(a.vehicle||'Veículo não informado');

    const date=document.getElementById('vpEditAppointmentDate');
    date.value=a.date||'';
    const today=new Date();
    const localToday=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    date.min=localToday;

    document.getElementById('vpEditAppointmentTime').value=String(a.time||'').slice(0,5);

    const svc=document.getElementById('vpEditAppointmentService');
    const services=activeServices();
    svc.innerHTML=services.map(s=>
      '<option value="'+esc(s.name)+'">'+esc(s.name)+'</option>'
    ).join('');
    if(a.service && !services.some(s=>String(s.name)===String(a.service))){
      svc.insertAdjacentHTML('afterbegin','<option value="'+esc(a.service)+'">'+esc(a.service)+'</option>');
    }
    svc.value=a.service||'';

    const col=document.getElementById('vpEditAppointmentCollaborator');
    const collaborators=activeCollaborators();
    col.innerHTML='<option value="">Sem equipe definida</option>'+
      collaborators.map(c=>
        '<option value="'+esc(c.name)+'">'+esc(c.name)+'</option>'
      ).join('');
    if(a.collaborator && !collaborators.some(c=>String(c.name)===String(a.collaborator))){
      col.insertAdjacentHTML('beforeend','<option value="'+esc(a.collaborator)+'">'+esc(a.collaborator)+'</option>');
    }
    col.value=a.collaborator||'';

    document.getElementById('vpEditAppointmentStatus').value=
      ['Agendado','Confirmado','Em atendimento','Cancelado'].includes(a.status)?a.status:'Agendado';
    document.getElementById('vpEditAppointmentNotes').value=a.notes||'';

    document.getElementById('vpEditAppointmentModal').classList.add('show');
  };

  window.vpCloseEditAppointment=function(){
    document.getElementById('vpEditAppointmentModal')?.classList.remove('show');
    editId='';
  };

  async function secureUpdateAppointment(a,changes){
    if(typeof window.vpBridge!=='function'){
      throw new Error('Sessão segura ainda não está pronta.');
    }

    return await window.vpBridge('appointment_update',{
      method:'POST',
      body:{
        cloud_id:a.cloudId||'',
        client:a.client||'',
        original_date:a.date||'',
        original_time:String(a.time||'').slice(0,5),
        date:changes.date,
        time:changes.time,
        service:changes.service,
        collaborator:changes.collaborator,
        status:changes.status,
        notes:changes.notes
      }
    });
  }

  function applyLocalChanges(id,changes,cloudId=''){
    const list=typeof getAppointments==='function'?getAppointments():[];
    const i=list.findIndex(a=>String(a.id)===String(id));
    if(i<0)return;

    list[i]={
      ...list[i],
      ...changes,
      cloudId:cloudId||list[i].cloudId||'',
      updatedAt:new Date().toISOString()
    };
    if(typeof setAppointments==='function')setAppointments(list);

    try{
      if(typeof agendaFocusDate!=='undefined')agendaFocusDate=changes.date||agendaFocusDate;
      if(typeof agendaCalendarMonth!=='undefined' && changes.date){
        agendaCalendarMonth=String(changes.date).slice(0,7);
      }
    }catch(_){}

    try{renderAppointments?.()}catch(_){}
    try{renderAgendaTimeline?.()}catch(_){}
    try{renderManagementDashboard?.()}catch(_){}
  }

  window.vpSaveEditAppointment=async function(){
    const list=typeof getAppointments==='function'?getAppointments():[];
    const a=list.find(x=>String(x.id)===String(editId));
    if(!a)return;

    const changes={
      date:document.getElementById('vpEditAppointmentDate')?.value||'',
      time:document.getElementById('vpEditAppointmentTime')?.value||'',
      service:document.getElementById('vpEditAppointmentService')?.value||'',
      collaborator:document.getElementById('vpEditAppointmentCollaborator')?.value||'',
      status:document.getElementById('vpEditAppointmentStatus')?.value||'Agendado',
      notes:document.getElementById('vpEditAppointmentNotes')?.value||''
    };

    if(!changes.date||!changes.time||!changes.service){
      setMessage('Preencha data, horário e serviço.','err');
      return;
    }

    const btn=document.getElementById('vpEditAppointmentSave');
    if(btn){btn.disabled=true;btn.textContent='Salvando…'}
    setMessage('');

    try{
      const d=await secureUpdateAppointment(a,changes);
      const cloudId=d?.appointment?.id||a.cloudId||'';
      applyLocalChanges(editId,changes,cloudId);

      try{showToast?.('Agendamento atualizado.','success')}catch(_){}
      window.vpCloseEditAppointment();
    }catch(e){
      const raw=String(e?.message||e||'');
      const msg=raw.includes('schedule_conflict')
        ?'Esse horário entra em conflito com outro atendimento da mesma equipe.'
        :raw.includes('appointment_not_found')
          ?'Não encontrei esse agendamento na nuvem. Atualize os dados e tente novamente.'
          :('Não foi possível salvar: '+raw);
      setMessage(msg,'err');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='Salvar alterações'}
    }
  };

  async function cancelSecure(id){
    const list=typeof getAppointments==='function'?getAppointments():[];
    const a=list.find(x=>String(x.id)===String(id));
    if(!a)return;

    if(!confirm(
      'Cancelar este agendamento?\n\n'+
      (a.client||'Cliente')+' • '+(a.vehicle||'Veículo')+' • '+(a.date||'')+' '+String(a.time||'').slice(0,5)+
      '\n\nEle será mantido no sistema com status Cancelado.'
    ))return;

    try{
      const d=await secureUpdateAppointment(a,{
        date:a.date||'',
        time:String(a.time||'').slice(0,5),
        service:a.service||'',
        collaborator:a.collaborator||'',
        status:'Cancelado',
        notes:a.notes||''
      });

      applyLocalChanges(id,{
        date:a.date||'',
        time:String(a.time||'').slice(0,5),
        service:a.service||'',
        collaborator:a.collaborator||'',
        status:'Cancelado',
        notes:a.notes||''
      },d?.appointment?.id||a.cloudId||'');

      try{showToast?.('Agendamento cancelado.','success')}catch(_){}
    }catch(e){
      const raw=String(e?.message||e||'');
      try{showToast?.('Não foi possível cancelar: '+raw,'error')}catch(_){}
    }
  }

  document.addEventListener('click',function(e){
    const edit=e.target.closest?.('.vp-edit-appointment');
    if(edit){
      e.preventDefault();
      e.stopPropagation();
      const id=edit.getAttribute('data-id');
      if(id)window.vpOpenEditAppointment(id);
      return;
    }

    const cancel=e.target.closest?.('.timeline-cancel-action');
    if(cancel){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const id=cancel.getAttribute('data-id');
      if(id)cancelSecure(id);
    }
  },true);

  function start(){
    ensureUI();
    installEditButtons();

    const target=document.getElementById('appointmentsList')||document.body;
    const observer=new MutationObserver(()=>installEditButtons());
    observer.observe(target,{childList:true,subtree:true});

    setInterval(installEditButtons,1500);
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1800));
  window.addEventListener('load',()=>setTimeout(start,2200));
})();
