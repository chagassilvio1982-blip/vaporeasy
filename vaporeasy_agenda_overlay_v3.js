/* Vaporeasy — Agenda Overlay V3: camada superior de toque */
(function(){
  'use strict';

  const LAYER_ID='vpAgendaTouchOverlayV3';
  let lastActionAt=0;

  function toast(msg,type='success'){
    try{
      if(typeof window.showToast==='function') window.showToast(msg,type);
      else alert(msg);
    }catch(_){}
  }

  function getApps(){
    try{return typeof window.getAppointments==='function'?window.getAppointments():[]}
    catch(_){return []}
  }

  function findApp(id){
    return getApps().find(a=>String(a?.id)===String(id))||null;
  }

  function actionInfo(btn){
    const actions=btn.closest('.timeline-actions');
    if(!actions)return null;
    const id=btn.getAttribute('data-id') ||
      actions.querySelector('[data-id]')?.getAttribute('data-id') || '';
    if(!id)return null;

    const txt=String(btn.textContent||'').trim().toLowerCase();
    if(txt.includes('confirmar'))return {id,kind:'status',status:'Confirmado',label:'Confirmar'};
    if(txt.includes('concluir'))return {id,kind:'status',status:'Concluído',label:'Concluir'};
    if(txt.includes('editar'))return {id,kind:'edit',label:'Editar'};
    if(txt.includes('cancelar'))return {id,kind:'cancel',label:'Cancelar'};
    if(txt.includes('excluir'))return {id,kind:'delete',label:'Excluir'};
    return null;
  }

  async function mirror(a,status){
    try{
      if(typeof window.vpBridge==='function'){
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
      }
    }catch(e){console.warn('V3 mirror',e)}
  }

  function setStatus(a,status){
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
      }else{
        const list=getApps();
        const i=list.findIndex(x=>String(x?.id)===String(a.id));
        if(i<0){toast('Agendamento não encontrado.','error');return}
        list[i]={...list[i],status,updatedAt:new Date().toISOString()};
        if(typeof window.setAppointments==='function')window.setAppointments(list);
        if(typeof window.renderAppointments==='function')window.renderAppointments();
      }
      mirror({...a,status},status);
      toast(status==='Confirmado'?'Agendamento confirmado.':'Status atualizado: '+status,'success');
    }catch(e){
      console.error(e);
      toast('Não foi possível atualizar o atendimento.','error');
    }
  }

  function run(info){
    const now=Date.now();
    if(now-lastActionAt<500)return;
    lastActionAt=now;

    const a=findApp(info.id);
    if(!a){toast('Agendamento não encontrado.','error');return}

    if(info.kind==='status'){
      setStatus(a,info.status);
      return;
    }

    if(info.kind==='edit'){
      try{
        if(typeof window.vpOpenEditAppointment==='function') window.vpOpenEditAppointment(String(a.id));
        else toast('A edição não está disponível.','error');
      }catch(e){
        console.error(e);
        toast('Não foi possível abrir a edição.','error');
      }
      return;
    }

    if(info.kind==='cancel'){
      if(confirm('Cancelar este agendamento?\n\n'+(a.client||'Cliente')+' • '+String(a.time||'').slice(0,5))){
        setStatus(a,'Cancelado');
      }
      return;
    }

    if(info.kind==='delete'){
      try{
        if(typeof window.deleteAppointment==='function')window.deleteAppointment(a.id);
        else toast('A exclusão não está disponível.','error');
      }catch(e){
        console.error(e);
        toast('Não foi possível excluir o agendamento.','error');
      }
    }
  }

  function layer(){
    let el=document.getElementById(LAYER_ID);
    if(el)return el;
    el=document.createElement('div');
    el.id=LAYER_ID;
    el.setAttribute('aria-hidden','false');
    el.style.cssText=[
      'position:fixed',
      'inset:0',
      'z-index:2147483000',
      'pointer-events:none',
      'overflow:visible'
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  function sourceButtons(){
    const all=[...document.querySelectorAll('.timeline-actions button')];
    const best=[];
    const seen=new Set();

    for(const b of all){
      const r=b.getBoundingClientRect();
      const cs=getComputedStyle(b);
      if(r.width<20||r.height<20||cs.display==='none'||cs.visibility==='hidden')continue;
      const info=actionInfo(b);
      if(!info)continue;
      const key=info.id+'|'+info.label;
      if(seen.has(key))continue;
      seen.add(key);
      best.push({b,r,info});
    }
    return best;
  }

  function sync(){
    const host=layer();
    host.innerHTML='';

    for(const {b,r,info} of sourceButtons()){
      if(r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)continue;

      const hit=document.createElement('button');
      hit.type='button';
      hit.setAttribute('aria-label',info.label);
      hit.dataset.vpOverlayAction=info.label;
      hit.style.cssText=[
        'position:fixed',
        'left:'+Math.round(r.left)+'px',
        'top:'+Math.round(r.top)+'px',
        'width:'+Math.round(r.width)+'px',
        'height:'+Math.round(r.height)+'px',
        'z-index:2147483001',
        'pointer-events:auto',
        'border:0',
        'margin:0',
        'padding:0',
        'background:rgba(0,0,0,0.001)',
        'color:transparent',
        'touch-action:manipulation',
        '-webkit-tap-highlight-color:rgba(17,184,255,.18)',
        'cursor:pointer'
      ].join(';');

      if(b.disabled && info.label==='Concluir'){
        hit.disabled=true;
        hit.style.pointerEvents='none';
      }

      hit.addEventListener('pointerup',function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        run(info);
        setTimeout(sync,250);
      },true);

      hit.addEventListener('click',function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
      },true);

      host.appendChild(hit);
    }
  }

  function readyBadge(){
    let d=document.getElementById('vpAgendaV3Badge');
    if(d)return;
    d=document.createElement('div');
    d.id='vpAgendaV3Badge';
    d.textContent='Agenda V3 pronta';
    d.style.cssText='position:fixed;left:10px;bottom:92px;z-index:2147483646;background:#08334a;color:#dff8ff;border:1px solid #1ebbf0;border-radius:999px;padding:7px 10px;font:800 10px Arial;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.35)';
    document.body.appendChild(d);
    setTimeout(()=>d.remove(),6000);
  }

  function start(){
    readyBadge();
    sync();

    addEventListener('scroll',()=>requestAnimationFrame(sync),true);
    addEventListener('resize',()=>requestAnimationFrame(sync),true);

    const root=document.getElementById('appointmentsList')||document.body;
    new MutationObserver(()=>requestAnimationFrame(sync))
      .observe(root,{childList:true,subtree:true,attributes:true});

    setInterval(sync,700);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1200),{once:true});
  }else{
    setTimeout(start,500);
  }
})();
