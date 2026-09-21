/* Vaporeasy — agenda Android por coordenadas */
(function(){
  'use strict';
  let lastRun=0;

  function toast(msg,type='success'){
    try{
      if(typeof window.showToast==='function') window.showToast(msg,type);
      else alert(msg);
    }catch(_){}
  }

  function appointments(){
    try{return typeof window.getAppointments==='function'?window.getAppointments():[]}
    catch(_){return []}
  }

  function findAppointment(id){
    return appointments().find(a=>String(a?.id)===String(id))||null;
  }

  function visibleButtons(){
    return [...document.querySelectorAll('.timeline-actions button')].filter(b=>{
      const r=b.getBoundingClientRect();
      const cs=getComputedStyle(b);
      return r.width>1 && r.height>1 && cs.display!=='none' && cs.visibility!=='hidden';
    });
  }

  function buttonAt(x,y){
    const hits=visibleButtons().map(b=>{
      const r=b.getBoundingClientRect();
      const pad=10;
      const inside=x>=r.left-pad && x<=r.right+pad && y>=r.top-pad && y<=r.bottom+pad;
      if(!inside)return null;
      const cx=(r.left+r.right)/2, cy=(r.top+r.bottom)/2;
      return {b,dist:Math.hypot(x-cx,y-cy)};
    }).filter(Boolean).sort((a,b)=>a.dist-b.dist);
    return hits[0]?.b||null;
  }

  function actionFromButton(button){
    if(!button)return null;
    const actions=button.closest('.timeline-actions');
    if(!actions)return null;
    const id=button.getAttribute('data-id') || actions.querySelector('[data-id]')?.getAttribute('data-id') || '';
    if(!id)return null;

    const txt=String(button.textContent||'').trim().toLowerCase();
    if(button.classList.contains('vp-direct-edit') || txt.includes('editar')) return {id,kind:'edit',button};
    if(button.classList.contains('vp-direct-cancel') || txt.includes('cancelar')) return {id,kind:'cancel',button};
    if(button.classList.contains('vp-direct-delete') || txt.includes('excluir')) return {id,kind:'delete',button};
    if(button.classList.contains('vp-direct-confirm') || txt.includes('confirmar')) return {id,kind:'status',status:'Confirmado',button};
    if(button.classList.contains('vp-direct-conclude') || txt.includes('concluir')) return {id,kind:'status',status:'Concluído',button};
    if(button.classList.contains('timeline-status-action')) return {id,kind:'status',status:button.getAttribute('data-status')||'',button};
    return null;
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
    }catch(e){console.warn('Agenda coord sync:',e)}
  }

  function changeStatus(a,status){
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
      const list=appointments();
      const i=list.findIndex(x=>String(x?.id)===String(a.id));
      if(i<0){toast('Agendamento não encontrado.','error');return}
      list[i]={...list[i],status,updatedAt:new Date().toISOString()};
      if(typeof window.setAppointments==='function')window.setAppointments(list);
      if(typeof window.renderAppointments==='function')window.renderAppointments();
      mirror(list[i],status);
    }catch(e){
      console.error(e);
      toast('Não foi possível atualizar o atendimento.','error');
    }
  }

  function run(action){
    const a=findAppointment(action.id);
    if(!a){toast('Agendamento não encontrado.','error');return}

    if(action.kind==='edit'){
      if(typeof window.vpOpenEditAppointment==='function') window.vpOpenEditAppointment(String(a.id));
      else toast('A edição não está disponível.','error');
      return;
    }

    if(action.kind==='cancel'){
      if(confirm('Cancelar este agendamento?\n\n'+(a.client||'Cliente')+' • '+String(a.time||'').slice(0,5))){
        changeStatus(a,'Cancelado');
      }
      return;
    }

    if(action.kind==='delete'){
      if(typeof window.deleteAppointment==='function') window.deleteAppointment(a.id);
      else toast('A exclusão não está disponível.','error');
      return;
    }

    if(action.kind==='status' && action.status) changeStatus(a,action.status);
  }

  function dispatchPoint(x,y,ev){
    const now=Date.now();
    if(now-lastRun<650)return;
    const button=buttonAt(x,y);
    const action=actionFromButton(button);
    if(!action)return;

    lastRun=now;
    try{
      ev.preventDefault?.();
      ev.stopPropagation?.();
      ev.stopImmediatePropagation?.();
    }catch(_){}

    try{
      button.animate([{transform:'scale(1)'},{transform:'scale(.93)'},{transform:'scale(1)'}],{duration:180});
    }catch(_){}

    toast('Toque detectado: '+String(button.textContent||'Ação').trim(),'success');
    setTimeout(()=>run(action),80);
  }

  function pointFromEvent(ev){
    const t=ev.changedTouches?.[0] || ev.touches?.[0];
    if(t)return {x:t.clientX,y:t.clientY};
    if(Number.isFinite(ev.clientX)&&Number.isFinite(ev.clientY))return {x:ev.clientX,y:ev.clientY};
    return null;
  }

  function handler(ev){
    const p=pointFromEvent(ev);
    if(p)dispatchPoint(p.x,p.y,ev);
  }

  window.addEventListener('pointerup',handler,true);
  window.addEventListener('touchend',handler,{capture:true,passive:false});
  window.addEventListener('click',handler,true);

  function loaded(){
    const d=document.createElement('div');
    d.textContent='Agenda Android V2 ativa';
    d.style.cssText='position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:999999;background:#0d3246;color:#dff8ff;border:1px solid #1ebbf0;border-radius:999px;padding:6px 11px;font:700 10px Arial;pointer-events:none';
    document.body.appendChild(d);
    setTimeout(()=>d.remove(),3500);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(loaded,400),{once:true});
  else setTimeout(loaded,300);
})();