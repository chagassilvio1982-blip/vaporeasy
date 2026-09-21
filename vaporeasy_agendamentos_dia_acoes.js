/* Vaporeasy — ativa Editar/Cancelar nos Agendamentos do dia */
(function(){
  'use strict';

  function esc(v){
    return String(v??'').replace(/[&<>"']/g,m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  function todayServices(){
    try{
      return typeof taskTodayServices==='function' ? taskTodayServices() : [];
    }catch(_){ return []; }
  }

  function normalizeDayCards(){
    const host=document.getElementById('tasksDayList');
    if(!host)return;

    const services=todayServices();
    const serviceCards=[...host.querySelectorAll('.task-card')].filter(card=>{
      const badge=card.querySelector('.task-badge');
      return /servi[cç]o/i.test(badge?.textContent||'');
    });

    serviceCards.forEach((card,index)=>{
      const a=services[index];
      if(!a?.id)return;

      card.dataset.appointmentId=String(a.id);
      let actions=card.querySelector('.task-actions');
      if(!actions){
        actions=document.createElement('div');
        actions.className='task-actions';
        card.appendChild(actions);
      }

      let edit=[...actions.querySelectorAll('button,a')].find(b=>/editar/i.test(b.textContent||''));
      if(!edit){
        edit=document.createElement('button');
        edit.type='button';
        edit.className='btn-ghost';
        edit.textContent='Editar';
        actions.appendChild(edit);
      }
      edit.removeAttribute('onclick');
      edit.setAttribute('href','#');
      edit.dataset.dayAction='edit';
      edit.dataset.id=String(a.id);

      let cancel=[...actions.querySelectorAll('button,a')].find(b=>/cancelar/i.test(b.textContent||''));
      if(!cancel){
        cancel=document.createElement('button');
        cancel.type='button';
        cancel.className='btn-ghost';
        cancel.textContent='Cancelar';
        actions.appendChild(cancel);
      }
      cancel.removeAttribute('onclick');
      cancel.setAttribute('href','#');
      cancel.dataset.dayAction='cancel';
      cancel.dataset.id=String(a.id);
    });
  }

  async function cancelDayAppointment(id){
    const list=typeof getAppointments==='function'?getAppointments():[];
    const a=list.find(x=>String(x.id)===String(id));
    if(!a)return;

    const ok=confirm(
      'Cancelar este agendamento?\n\n'+
      (a.client||'Cliente')+' • '+(a.vehicle||'Veículo')+' • '+(a.date||'')+' '+String(a.time||'').slice(0,5)+
      '\n\nO registro ficará com status Cancelado.'
    );
    if(!ok)return;

    try{
      if(typeof window.vpBridge!=='function'){
        throw new Error('Sessão segura ainda não está pronta.');
      }

      const d=await window.vpBridge('appointment_update',{
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
          status:'Cancelado',
          notes:a.notes||''
        }
      });

      const i=list.findIndex(x=>String(x.id)===String(id));
      if(i>=0){
        list[i]={
          ...list[i],
          status:'Cancelado',
          cloudId:d?.appointment?.id||list[i].cloudId||'',
          updatedAt:new Date().toISOString()
        };
        if(typeof setAppointments==='function')setAppointments(list);
      }

      try{ renderTasksDay?.(); }catch(_){}
      try{ renderAppointments?.(); }catch(_){}
      try{ renderManagementDashboard?.(); }catch(_){}
      try{ showToast?.('Agendamento cancelado.','success'); }catch(_){}
    }catch(e){
      try{
        showToast?.('Não foi possível cancelar: '+String(e?.message||e),'error');
      }catch(_){}
    }
  }

  function attachHandlers(){
    document.addEventListener('click',function(e){
      const btn=e.target.closest?.('[data-day-action]');
      if(!btn)return;

      const id=btn.dataset.id||btn.closest('.task-card')?.dataset.appointmentId||'';
      if(!id)return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if(btn.dataset.dayAction==='edit'){
        if(typeof window.vpOpenEditAppointment==='function'){
          window.vpOpenEditAppointment(id);
        }else{
          try{ showToast?.('A edição ainda não terminou de carregar. Tente novamente.','error'); }catch(_){}
        }
        return;
      }

      if(btn.dataset.dayAction==='cancel'){
        cancelDayAppointment(id);
      }
    },true);
  }

  function wrapRenderTasks(){
    if(typeof window.renderTasksDay!=='function' || window.renderTasksDay.__vpDayActionsWrapped)return;
    const original=window.renderTasksDay;
    function wrapped(){
      const out=original.apply(this,arguments);
      setTimeout(normalizeDayCards,0);
      setTimeout(normalizeDayCards,120);
      return out;
    }
    wrapped.__vpDayActionsWrapped=true;
    window.renderTasksDay=wrapped;
  }

  function wrapEditSaveRefresh(){
    if(typeof window.vpSaveEditAppointment!=='function' || window.vpSaveEditAppointment.__vpDayRefreshWrapped)return;
    const original=window.vpSaveEditAppointment;
    async function wrapped(){
      const out=await original.apply(this,arguments);
      setTimeout(()=>{
        try{ renderTasksDay?.(); }catch(_){}
        try{ renderManagementDashboard?.(); }catch(_){}
      },250);
      return out;
    }
    wrapped.__vpDayRefreshWrapped=true;
    window.vpSaveEditAppointment=wrapped;
  }

  function start(){
    attachHandlers();

    let tries=0;
    const timer=setInterval(()=>{
      wrapRenderTasks();
      wrapEditSaveRefresh();
      normalizeDayCards();
      tries++;
      if(tries>30)clearInterval(timer);
    },300);

    const host=document.getElementById('tasksDayList');
    if(host){
      const observer=new MutationObserver(()=>setTimeout(normalizeDayCards,0));
      observer.observe(host,{childList:true,subtree:true});
    }
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1800));
  window.addEventListener('load',()=>setTimeout(start,2200));
})();
