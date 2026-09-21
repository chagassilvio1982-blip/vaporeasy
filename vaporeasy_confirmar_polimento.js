/* Vaporeasy — confirmar solicitação de serviço longo e criar agendamento */
(function(){
  'use strict';

  let requestCollaborators=[];

  function esc(v){
    try{
      if(typeof escapeHtmlText==='function') return escapeHtmlText(v);
    }catch(_){}
    return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function attr(v){ return esc(v); }

  function collaboratorOptions(selected=''){
    return '<option value="">Selecione a equipe…</option>'+
      requestCollaborators.map(c=>
        '<option value="'+attr(c.id)+'" '+(String(c.id)===String(selected)?'selected':'')+'>'+
        esc(c.name||'Equipe')+'</option>'
      ).join('');
  }

  function render(){
    const box=document.getElementById('onlineBookingRequestsList');
    if(!box)return;

    if(!vpBookingRequests.length){
      box.innerHTML='<div class="muted">Nenhuma solicitação de serviço longo encontrada.</div>';
      return;
    }

    box.innerHTML=vpBookingRequests.map(r=>{
      const badge=r.status||'Pendente';
      const canSchedule=badge==='Pendente'||badge==='Em análise';
      const date=r.preferred_date||'';
      return '<div class="item" style="margin-top:10px">'+
        '<div class="result-head"><div><div class="result-title">'+esc(r.service_name||'Serviço')+'</div>'+
        '<div class="result-meta">'+esc(r.client_name||'Cliente')+' • '+esc(r.vehicle_label||'Veículo')+' • '+esc(r.plate||'')+'</div></div>'+
        '<span class="tag">'+esc(badge)+'</span></div>'+
        '<div class="opportunity"><b>Data preferida:</b> '+esc(bookingRequestDate(r.preferred_date))+
        (r.alternate_date?' • <b>2ª opção:</b> '+esc(bookingRequestDate(r.alternate_date)):'')+
        '<br><b>WhatsApp:</b> '+esc(r.phone||'')+
        (r.condominium?'<br><b>Local:</b> '+esc(r.condominium):'')+
        (r.notes?'<br><b>Obs.:</b> '+esc(r.notes):'')+'</div>'+
        (canSchedule?
          '<div class="vp-request-confirm" data-request="'+attr(r.id)+'" style="margin-top:14px;padding:13px;border:1px solid rgba(20,181,238,.22);border-radius:15px;background:rgba(20,181,238,.05)">'+
            '<b style="display:block;margin-bottom:10px">Confirmar atendimento</b>'+
            '<label style="display:block;margin:7px 0 5px">Data</label>'+
            '<input class="vp-request-date" type="date" value="'+attr(date)+'" style="width:100%;box-sizing:border-box">'+
            '<label style="display:block;margin:9px 0 5px">Horário de início</label>'+
            '<input class="vp-request-time" type="time" value="08:00" step="1200" style="width:100%;box-sizing:border-box">'+
            '<label style="display:block;margin:9px 0 5px">Equipe / colaborador</label>'+
            '<select class="vp-request-collab" style="width:100%;box-sizing:border-box">'+collaboratorOptions()+'</select>'+
            '<div class="muted" style="margin-top:7px">O sistema confere automaticamente a duração do serviço, conflitos e deslocamento antes de confirmar.</div>'+
            '<button class="btn-primary vp-request-confirm-btn" type="button" style="width:100%;margin-top:11px" onclick="vpConfirmBookingRequest(\''+attr(r.id)+'\')">Confirmar e agendar</button>'+
          '</div>'
        :'')+
        '<div class="actions" style="margin-top:12px">'+
          '<button class="btn-primary" type="button" onclick="bookingRequestWhatsApp(\''+attr(r.phone||'')+'\')">WhatsApp</button>'+
          (badge==='Pendente'?'<button class="btn-ghost" type="button" onclick="setBookingRequestStatus(\''+attr(r.id)+'\',\'Em análise\')">Em análise</button>':'')+
          (badge!=='Recusado'&&badge!=='Confirmado'?'<button class="btn-ghost" type="button" onclick="setBookingRequestStatus(\''+attr(r.id)+'\',\'Recusado\')">Recusar</button>':'')+
        '</div>'+
      '</div>';
    }).join('');
  }

  async function load(){
    const box=document.getElementById('onlineBookingRequestsList');
    if(!box)return;
    if(typeof window.vpBridge!=='function'){
      box.innerHTML='<div class="muted">Conectando à sessão segura…</div>';
      setTimeout(load,700);
      return;
    }
    box.innerHTML='<div class="muted">Carregando solicitações…</div>';
    try{
      const d=await window.vpBridge('booking_requests');
      vpBookingRequests=d.requests||[];
      requestCollaborators=d.collaborators||[];
      render();
    }catch(e){
      box.innerHTML='<div class="notice err">Não foi possível carregar as solicitações: '+esc(e.message||String(e))+'</div>';
    }
  }

  window.vpConfirmBookingRequest=async function(id){
    const card=document.querySelector('.vp-request-confirm[data-request="'+CSS.escape(String(id))+'"]');
    if(!card)return;
    const date=card.querySelector('.vp-request-date')?.value||'';
    const time=card.querySelector('.vp-request-time')?.value||'';
    const collaborator_id=card.querySelector('.vp-request-collab')?.value||'';
    const btn=card.querySelector('.vp-request-confirm-btn');

    if(!date||!time||!collaborator_id){
      showToast?.('Selecione data, horário e equipe.','error');
      return;
    }

    if(btn){btn.disabled=true;btn.textContent='Confirmando…';}
    try{
      const d=await window.vpBridge('booking_request_confirm',{
        method:'POST',
        body:{id,date,time,collaborator_id}
      });
      showToast?.('Agendamento criado e solicitação confirmada.','success');
      await load();
      setTimeout(()=>{
        try{ if(typeof renderAppointments==='function') renderAppointments(); }catch(_){}
      },500);
    }catch(e){
      showToast?.(e.message||'Não foi possível confirmar o atendimento.','error');
      if(btn){btn.disabled=false;btn.textContent='Confirmar e agendar';}
    }
  };

  function install(){
    window.renderBookingRequestsAdmin=render;
    window.loadBookingRequestsAdmin=load;
    const screen=document.getElementById('agendaonline');
    if(screen?.classList.contains('active')) load();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(install,300);
    setTimeout(install,1200);
  });
  window.addEventListener('load',()=>setTimeout(install,500));
})();
