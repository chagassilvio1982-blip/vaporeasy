/* Vaporeasy — ações diretas e robustas na agenda principal */
(function(){
  'use strict';

  function show(msg,type='success'){
    try{
      if(typeof window.showToast==='function') window.showToast(msg,type);
      else alert(msg);
    }catch(_){}
  }

  function getAppointmentsSafe(){
    try{return typeof window.getAppointments==='function'?window.getAppointments():[]}
    catch(_){return []}
  }

  function findAppointment(id){
    return getAppointmentsSafe().find(a=>String(a?.id)===String(id))||null;
  }

  async function secureMirror(a,status){
    try{
      if(typeof window.vpBridge!=='function') return;
      await window.vpBridge('appointment_update',{
        method:'POST',
        body:{
          cloud_id:a.cloudId||'',
          client:a.client||'',
          original_date:a.date||'',
          original_time:String(a.time||'').slice(0,5),
          date:a.date||'',
          time:String(a.time||'').slice(0,5),
          service:a.service||'',
          collaborator:a.collaborator||'',
          status:status,
          notes:a.notes||''
        }
      });
    }catch(e){
      console.warn('Vaporeasy direct agenda sync:',e);
    }
  }

  function directStatus(id,status){
    const a=findAppointment(id);
    if(!a){
      show('Agendamento não encontrado. Atualize a página e tente novamente.','error');
      return;
    }

    if(status==='Concluído' && typeof window.appointmentCanBeCompleted==='function'){
      try{
        if(!window.appointmentCanBeCompleted(a)){
          const end=typeof window.appointmentEndClock==='function'?window.appointmentEndClock(a):'o horário previsto';
          show('Este serviço só poderá ser concluído após '+end+'.','error');
          return;
        }
      }catch(_){}
    }

    try{
      if(typeof window.updateAppointmentStatus==='function'){
        /* usa o ID ORIGINAL do objeto, evitando diferença string/número */
        window.updateAppointmentStatus(a.id,status);
      }else{
        const list=getAppointmentsSafe();
        const i=list.findIndex(x=>String(x?.id)===String(id));
        if(i<0)return;
        list[i]={...list[i],status,updatedAt:new Date().toISOString()};
        if(typeof window.setAppointments==='function')window.setAppointments(list);
        if(typeof window.renderAppointments==='function')window.renderAppointments();
      }

      /* espelha de forma segura na nuvem */
      secureMirror({...a,status},status);
    }catch(e){
      show('Não foi possível atualizar o atendimento.','error');
      console.error(e);
    }
  }

  function directEdit(id){
    const a=findAppointment(id);
    if(!a){
      show('Agendamento não encontrado.','error');
      return;
    }
    try{
      if(typeof window.vpOpenEditAppointment==='function'){
        window.vpOpenEditAppointment(String(a.id));
      }else{
        show('A edição ainda não terminou de carregar. Atualize a página.','error');
      }
    }catch(e){
      show('Não foi possível abrir a edição.','error');
      console.error(e);
    }
  }

  function directCancel(id){
    const a=findAppointment(id);
    if(!a){
      show('Agendamento não encontrado.','error');
      return;
    }
    const ok=confirm(
      'Cancelar este agendamento?\n\n'+
      (a.client||'Cliente')+' • '+(a.vehicle||'Veículo')+' • '+
      (a.date||'')+' '+String(a.time||'').slice(0,5)+
      '\n\nO registro será mantido com status Cancelado.'
    );
    if(!ok)return;
    directStatus(a.id,'Cancelado');
  }

  function directDelete(id){
    const a=findAppointment(id);
    if(!a){
      show('Agendamento não encontrado.','error');
      return;
    }
    try{
      if(typeof window.deleteAppointment==='function'){
        /* usa o ID ORIGINAL do objeto */
        window.deleteAppointment(a.id);
      }else{
        show('A função de exclusão ainda não terminou de carregar.','error');
      }
    }catch(e){
      show('Não foi possível excluir o agendamento.','error');
      console.error(e);
    }
  }

  function makeButton(text,cls,handler){
    const b=document.createElement('button');
    b.type='button';
    b.className='btn-ghost vp-direct-agenda-btn '+cls;
    b.textContent=text;
    b.onclick=function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      handler();
    };
    return b;
  }

  function bindActionBlock(actions){
    if(!actions || actions.dataset.vpDirectAgenda==='1')return;

    const confirmOld=actions.querySelector('.timeline-status-action[data-status="Confirmado"]');
    const concludeOld=actions.querySelector('.timeline-status-action[data-status="Concluído"]');
    const editOld=actions.querySelector('.vp-edit-appointment');
    const cancelOld=actions.querySelector('.timeline-cancel-action');
    const deleteOld=actions.querySelector('.timeline-delete-action');

    const source=confirmOld||concludeOld||editOld||cancelOld||deleteOld;
    const id=source?.getAttribute('data-id')||'';
    if(!id)return;

    /* Mantém marcadores antigos no DOM para não deixar patches anteriores recriarem botões,
       mas tira todos eles da área clicável. */
    [confirmOld,concludeOld,editOld,cancelOld,deleteOld].forEach(b=>{
      if(b){
        b.style.setProperty('display','none','important');
        b.style.pointerEvents='none';
        b.tabIndex=-1;
      }
    });

    const confirmBtn=makeButton('Confirmar','vp-direct-confirm',()=>directStatus(id,'Confirmado'));
    const concludeBtn=makeButton('Concluir','vp-direct-conclude',()=>directStatus(id,'Concluído'));
    const editBtn=makeButton('Editar','vp-direct-edit',()=>directEdit(id));
    const cancelBtn=makeButton('Cancelar','vp-direct-cancel',()=>directCancel(id));
    const deleteBtn=makeButton('Excluir','vp-direct-delete',()=>directDelete(id));

    try{
      const a=findAppointment(id);
      if(a && typeof window.appointmentCanBeCompleted==='function'){
        const can=window.appointmentCanBeCompleted(a);
        concludeBtn.disabled=!can;
        if(!can && typeof window.appointmentEndClock==='function'){
          concludeBtn.title='Disponível após '+window.appointmentEndClock(a);
        }
      }
    }catch(_){}

    actions.append(confirmBtn,concludeBtn,editBtn,cancelBtn,deleteBtn);
    actions.dataset.vpDirectAgenda='1';
  }

  function bindAll(){
    document.querySelectorAll('.timeline-actions').forEach(bindActionBlock);
  }

  function installStyle(){
    if(document.getElementById('vpDirectAgendaStyle'))return;
    const s=document.createElement('style');
    s.id='vpDirectAgendaStyle';
    s.textContent=`
      .timeline-card{
        position:relative!important;
        z-index:5!important;
        pointer-events:auto!important
      }
      .timeline-actions{
        position:relative!important;
        z-index:50!important;
        pointer-events:auto!important;
        isolation:isolate!important
      }
      .timeline-actions .vp-direct-agenda-btn{
        position:relative!important;
        z-index:51!important;
        pointer-events:auto!important;
        touch-action:manipulation!important;
        -webkit-tap-highlight-color:rgba(17,184,255,.18)!important
      }
      .timeline-item::after,.timeline-travel::after,
      .timeline-line-dot{pointer-events:none!important}
      .vp-direct-edit{
        border-color:rgba(17,184,255,.45)!important;
        color:#9be4ff!important;
        background:rgba(17,184,255,.07)!important
      }
      .vp-direct-cancel{
        border-color:rgba(255,184,77,.42)!important;
        color:#ffd18b!important;
        background:rgba(255,184,77,.06)!important
      }
      .vp-direct-delete{
        border-color:rgba(255,88,88,.48)!important;
        color:#ffaaaa!important;
        background:rgba(255,88,88,.06)!important
      }
      .vp-direct-agenda-btn:disabled{
        opacity:.42!important;
        pointer-events:none!important
      }
    `;
    document.head.appendChild(s);
  }

  function start(){
    installStyle();
    bindAll();

    const target=document.getElementById('appointmentsList')||document.body;
    const obs=new MutationObserver(()=>setTimeout(bindAll,0));
    obs.observe(target,{childList:true,subtree:true});

    /* proteção para Android e para re-renderizações tardias */
    setInterval(bindAll,700);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>setTimeout(start,900),{once:true});
  }else{
    setTimeout(start,300);
  }
  window.addEventListener('load',()=>setTimeout(bindAll,1200));
})();
