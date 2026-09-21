/* Vaporeasy — resgate de toque da agenda no Android */
(function(){
  'use strict';

  let lastTapAt=0;

  function toast(msg,type='success'){
    try{
      if(typeof window.showToast==='function') window.showToast(msg,type);
      else alert(msg);
    }catch(_){}
  }

  function apps(){
    try{return typeof window.getAppointments==='function'?window.getAppointments():[]}
    catch(_){return []}
  }

  function findById(id){
    return apps().find(a=>String(a?.id)===String(id))||null;
  }

  function getActionAtPoint(x,y,target){
    const chain=[];
    try{
      if(target)chain.push(target,...(target.closest?[]:[]));
      if(document.elementsFromPoint)chain.push(...document.elementsFromPoint(x,y));
    }catch(_){}

    let button=null;
    for(const el of chain){
      const b=el?.closest?.('.timeline-actions button');
      if(b){button=b;break}
    }
    if(!button)return null;

    const actions=button.closest('.timeline-actions');
    if(!actions)return null;

    const id=
      button.getAttribute('data-id') ||
      actions.querySelector('[data-id]')?.getAttribute('data-id') ||
      '';

    if(!id)return null;

    let action='';
    let status='';

    if(button.classList.contains('vp-direct-edit') || /editar/i.test(button.textContent||'')) action='edit';
    else if(button.classList.contains('vp-direct-cancel') || /cancelar/i.test(button.textContent||'')) action='cancel';
    else if(button.classList.contains('vp-direct-delete') || /excluir/i.test(button.textContent||'')) action='delete';
    else if(button.classList.contains('vp-direct-confirm') || /confirmar/i.test(button.textContent||'')){
      action='status'; status='Confirmado';
    }
    else if(button.classList.contains('vp-direct-conclude') || /concluir/i.test(button.textContent||'')){
      action='status'; status='Concluído';
    }
    else if(button.classList.contains('timeline-status-action')){
      action='status';
      status=button.getAttribute('data-status')||'';
    }

    return action?{button,actions,id,action,status}:null;
  }

  async function mirror(a,status){
    try{
      if(typeof window.vpBridge!=='function')return;
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
          status,
          notes:a.notes||''
        }
      });
    }catch(e){
      console.warn('Agenda touch mirror:',e);
    }
  }

  function statusAction(a,status){
    if(!a)return;
    if(status==='Concluído'){
      try{
        if(typeof window.appointmentCanBeCompleted==='function' && !window.appointmentCanBeCompleted(a)){
          const end=typeof window.appointmentEndClock==='function'?window.appointmentEndClock(a):'o horário previsto';
          toast('Conclusão disponível após '+end+'.','error');
          return;
        }
      }catch(_){}
    }

    try{
      if(typeof window.updateAppointmentStatus==='function'){
        window.updateAppointmentStatus(a.id,status);
        mirror({...a,status},status);
        return;
      }

      const list=apps();
      const i=list.findIndex(x=>String(x?.id)===String(a.id));
      if(i<0)return;
      list[i]={...list[i],status,updatedAt:new Date().toISOString()};
      if(typeof window.setAppointments==='function')window.setAppointments(list);
      if(typeof window.renderAppointments==='function')window.renderAppointments();
      mirror(list[i],status);
    }catch(e){
      console.error(e);
      toast('Não foi possível atualizar o atendimento.','error');
    }
  }

  function execute(hit){
    const a=findById(hit.id);
    if(!a){
      toast('Agendamento não encontrado. Atualize a página e tente novamente.','error');
      return;
    }

    if(hit.action==='edit'){
      try{
        if(typeof window.vpOpenEditAppointment==='function') window.vpOpenEditAppointment(String(a.id));
        else toast('A edição ainda não está disponível nesta tela.','error');
      }catch(e){
        console.error(e);
        toast('Não foi possível abrir a edição.','error');
      }
      return;
    }

    if(hit.action==='cancel'){
      const ok=confirm(
        'Cancelar este agendamento?\n\n'+
        (a.client||'Cliente')+' • '+(a.vehicle||'Veículo')+' • '+
        (a.date||'')+' '+String(a.time||'').slice(0,5)
      );
      if(ok)statusAction(a,'Cancelado');
      return;
    }

    if(hit.action==='delete'){
      try{
        if(typeof window.deleteAppointment==='function') window.deleteAppointment(a.id);
        else toast('A exclusão não está disponível.','error');
      }catch(e){
        console.error(e);
        toast('Não foi possível excluir o agendamento.','error');
      }
      return;
    }

    if(hit.action==='status' && hit.status){
      statusAction(a,hit.status);
    }
  }

  function handlePoint(x,y,target,ev){
    const now=Date.now();
    if(now-lastTapAt<450)return;
    const hit=getActionAtPoint(x,y,target);
    if(!hit)return;

    lastTapAt=now;
    try{
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      ev?.stopImmediatePropagation?.();
    }catch(_){}

    execute(hit);
  }

  document.addEventListener('pointerup',function(ev){
    if(ev.pointerType && ev.pointerType!=='touch' && ev.pointerType!=='pen')return;
    handlePoint(ev.clientX,ev.clientY,ev.target,ev);
  },true);

  document.addEventListener('touchend',function(ev){
    const t=ev.changedTouches?.[0];
    if(!t)return;
    handlePoint(t.clientX,t.clientY,ev.target,ev);
  },{capture:true,passive:false});

  function showLoaded(){
    if(document.getElementById('vpTouchRescueLoaded'))return;
    const b=document.createElement('div');
    b.id='vpTouchRescueLoaded';
    b.textContent='Agenda: toque corrigido';
    b.style.cssText='position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:999999;background:#0d3246;color:#dff8ff;border:1px solid #1ebbf0;border-radius:999px;padding:6px 11px;font:700 10px/1.2 Arial,sans-serif;box-shadow:0 5px 20px rgba(0,0,0,.35);pointer-events:none';
    document.body.appendChild(b);
    setTimeout(()=>b.remove(),3500);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>setTimeout(showLoaded,500),{once:true});
  }else{
    setTimeout(showLoaded,300);
  }
})();
