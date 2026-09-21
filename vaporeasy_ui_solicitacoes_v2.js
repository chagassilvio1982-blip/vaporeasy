/* Vaporeasy — UI v2: sino alinhado + Pendentes/Histórico */
(function(){
  'use strict';

  let uiRequests=[];
  let uiCollaborators=[];

  function esc(v){
    return String(v??'').replace(/[&<>"']/g,m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }
  function attr(v){ return esc(v); }
  function normStatus(v){ return String(v||'Pendente').trim().toLowerCase(); }
  function isPending(v){
    const s=normStatus(v);
    return s==='pendente'||s==='em análise'||s==='em analise';
  }
  function fmtDate(v){
    try{
      if(typeof bookingRequestDate==='function') return bookingRequestDate(v);
    }catch(_){}
    const s=String(v||'');
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
      const [y,m,d]=s.split('-'); return d+'/'+m+'/'+y;
    }
    return s||'—';
  }

  function addStyles(){
    if(document.getElementById('vpRequestsUIV2Style'))return;
    const s=document.createElement('style');
    s.id='vpRequestsUIV2Style';
    s.textContent=`
      .app-header-right{
        grid-template-columns:minmax(0,auto) 36px 36px!important;
        column-gap:7px!important;
      }
      #vpRequestBell{
        position:relative!important;
        right:auto!important;top:auto!important;
        grid-column:2!important;grid-row:1/3!important;
        justify-self:center!important;align-self:center!important;
        width:36px!important;height:36px!important;
        margin:0!important;
      }
      .app-header-right .profile-dot{
        grid-column:3!important;grid-row:1/3!important;
      }
      #vpUserChip{
        grid-column:1/4!important;
      }

      .vp-requests-section-head{
        display:flex;align-items:center;justify-content:space-between;
        gap:12px;margin:4px 0 10px
      }
      .vp-requests-section-head strong{font-size:16px}
      .vp-requests-count{
        min-width:28px;height:28px;padding:0 8px;border-radius:999px;
        display:inline-flex;align-items:center;justify-content:center;
        background:rgba(22,184,240,.12);
        border:1px solid rgba(22,184,240,.35);
        font-weight:900
      }
      #vpPendingRequestsBlock{scroll-margin-top:120px}
      #vpRequestHistory{
        margin-top:18px;padding-top:14px;
        border-top:1px solid rgba(148,184,202,.16)
      }
      #vpRequestHistory>summary{
        cursor:pointer;font-weight:850;font-size:16px;
        list-style:none;display:flex;align-items:center;justify-content:space-between;
        gap:10px
      }
      #vpRequestHistory>summary::-webkit-details-marker{display:none}
      #vpRequestHistory>summary:after{content:'▾';opacity:.75}
      #vpRequestHistory[open]>summary:after{content:'▴'}

      @media(max-width:480px){
        .app-header-right{
          grid-template-columns:minmax(0,auto) 32px 32px!important;
          column-gap:5px!important;
        }
        #vpRequestBell{
          width:32px!important;height:32px!important;font-size:16px!important;
        }
      }
    `;
    document.head.appendChild(s);
  }

  function alignBell(){
    addStyles();
    const bell=document.getElementById('vpRequestBell');
    const right=document.querySelector('.app-header-right');
    if(!bell||!right)return false;
    const dot=right.querySelector('.profile-dot');
    if(bell.parentElement!==right){
      if(dot)right.insertBefore(bell,dot);
      else right.appendChild(bell);
    }
    return true;
  }

  function collabOptions(){
    return '<option value="">Selecione a equipe…</option>'+
      uiCollaborators.map(c=>
        '<option value="'+attr(c.id)+'">'+esc(c.name||'Equipe')+'</option>'
      ).join('');
  }

  function requestCard(r,history){
    const badge=r.status||'Pendente';
    const canSchedule=isPending(badge);

    return '<div class="item" style="margin-top:10px">'+
      '<div class="result-head"><div>'+
        '<div class="result-title">'+esc(r.service_name||'Serviço')+'</div>'+
        '<div class="result-meta">'+
          esc(r.client_name||'Cliente')+' • '+esc(r.vehicle_label||'Veículo')+
          (r.plate?' • '+esc(r.plate):'')+
        '</div>'+
      '</div><span class="tag">'+esc(badge)+'</span></div>'+

      '<div class="opportunity">'+
        '<b>Data preferida:</b> '+esc(fmtDate(r.preferred_date))+
        (r.alternate_date?' • <b>2ª opção:</b> '+esc(fmtDate(r.alternate_date)):'')+
        '<br><b>WhatsApp:</b> '+esc(r.phone||'')+
        (r.condominium?'<br><b>Local:</b> '+esc(r.condominium):'')+
        (r.notes?'<br><b>Obs.:</b> '+esc(r.notes):'')+
      '</div>'+

      (canSchedule?
        '<div class="vp-request-confirm" data-request="'+attr(r.id)+'" '+
             'style="margin-top:14px;padding:13px;border:1px solid rgba(20,181,238,.22);border-radius:15px;background:rgba(20,181,238,.05)">'+
          '<b style="display:block;margin-bottom:10px">Confirmar atendimento</b>'+
          '<label style="display:block;margin:7px 0 5px">Data</label>'+
          '<input class="vp-request-date" type="date" value="'+attr(r.preferred_date||'')+'" style="width:100%;box-sizing:border-box">'+
          '<label style="display:block;margin:9px 0 5px">Horário de início</label>'+
          '<input class="vp-request-time" type="time" value="08:00" step="1200" style="width:100%;box-sizing:border-box">'+
          '<label style="display:block;margin:9px 0 5px">Equipe / colaborador</label>'+
          '<select class="vp-request-collab" style="width:100%;box-sizing:border-box">'+collabOptions()+'</select>'+
          '<div class="muted" style="margin-top:7px">O sistema confere duração, conflitos e deslocamento antes de confirmar.</div>'+
          '<button class="btn-primary vp-request-confirm-btn" type="button" '+
                  'style="width:100%;margin-top:11px" '+
                  'onclick="vpConfirmBookingRequest(\''+attr(r.id)+'\')">'+
            'Confirmar e agendar'+
          '</button>'+
        '</div>'
      :'')+

      '<div class="actions" style="margin-top:12px">'+
        '<button class="btn-primary" type="button" onclick="bookingRequestWhatsApp(\''+attr(r.phone||'')+'\')">WhatsApp</button>'+
        (badge==='Pendente'
          ?'<button class="btn-ghost" type="button" onclick="setBookingRequestStatus(\''+attr(r.id)+'\',\'Em análise\')">Em análise</button>'
          :'')+
        (!history && badge!=='Recusado' && badge!=='Confirmado'
          ?'<button class="btn-ghost" type="button" onclick="setBookingRequestStatus(\''+attr(r.id)+'\',\'Recusado\')">Recusar</button>'
          :'')+
      '</div>'+
    '</div>';
  }

  function renderGrouped(){
    const box=document.getElementById('onlineBookingRequestsList');
    if(!box)return;

    const pending=uiRequests.filter(r=>isPending(r.status));
    const history=uiRequests.filter(r=>!isPending(r.status));

    box.innerHTML=
      '<section id="vpPendingRequestsBlock">'+
        '<div class="vp-requests-section-head">'+
          '<div><strong>Pendentes</strong><div class="muted">Solicitações que ainda precisam de decisão.</div></div>'+
          '<span class="vp-requests-count">'+pending.length+'</span>'+
        '</div>'+
        (pending.length
          ? pending.map(r=>requestCard(r,false)).join('')
          : '<div class="muted" style="padding:12px 0">Nenhuma solicitação pendente.</div>')+
      '</section>'+

      '<details id="vpRequestHistory">'+
        '<summary><span>Histórico</span><span class="vp-requests-count">'+history.length+'</span></summary>'+
        '<div class="muted" style="margin:7px 0 10px">Confirmadas e recusadas ficam guardadas aqui.</div>'+
        (history.length
          ? history.map(r=>requestCard(r,true)).join('')
          : '<div class="muted" style="padding:10px 0">Nenhum item no histórico.</div>')+
      '</details>';

    try{ window.vpRefreshRequestNotifications?.(); }catch(_){}
  }

  async function loadGrouped(){
    const box=document.getElementById('onlineBookingRequestsList');
    if(!box)return;
    if(typeof window.vpBridge!=='function'){
      box.innerHTML='<div class="muted">Conectando à sessão segura…</div>';
      setTimeout(loadGrouped,700);
      return;
    }

    box.innerHTML='<div class="muted">Carregando solicitações…</div>';
    try{
      const d=await window.vpBridge('booking_requests');
      uiRequests=d.requests||[];
      uiCollaborators=d.collaborators||[];
      renderGrouped();
    }catch(e){
      box.innerHTML='<div class="notice err">Não foi possível carregar as solicitações: '+esc(e.message||String(e))+'</div>';
    }
  }

  async function confirmRequest(id){
    const card=document.querySelector('.vp-request-confirm[data-request="'+CSS.escape(String(id))+'"]');
    if(!card)return;

    const date=card.querySelector('.vp-request-date')?.value||'';
    const time=card.querySelector('.vp-request-time')?.value||'';
    const collaborator_id=card.querySelector('.vp-request-collab')?.value||'';
    const btn=card.querySelector('.vp-request-confirm-btn');

    if(!date||!time||!collaborator_id){
      try{ showToast?.('Selecione data, horário e equipe.','error'); }catch(_){}
      return;
    }

    if(btn){btn.disabled=true;btn.textContent='Confirmando…';}
    try{
      await window.vpBridge('booking_request_confirm',{
        method:'POST',
        body:{id,date,time,collaborator_id}
      });
      try{ showToast?.('Agendamento criado e solicitação confirmada.','success'); }catch(_){}
      await loadGrouped();
      try{ window.vpRefreshRequestNotifications?.(); }catch(_){}
      setTimeout(()=>{
        try{ if(typeof renderAppointments==='function') renderAppointments(); }catch(_){}
      },400);
    }catch(e){
      try{ showToast?.(e.message||'Não foi possível confirmar o atendimento.','error'); }catch(_){}
      if(btn){btn.disabled=false;btn.textContent='Confirmar e agendar';}
    }
  }

  function install(){
    addStyles();
    alignBell();

    // Mantém o sino no local correto mesmo após o cabeçalho ser atualizado.
    let tries=0;
    const bellTimer=setInterval(()=>{
      alignBell();
      tries++;
      if(tries>20)clearInterval(bellTimer);
    },500);

    // Substitui somente a apresentação da lista.
    window.renderBookingRequestsAdmin=renderGrouped;
    window.loadBookingRequestsAdmin=loadGrouped;
    window.vpConfirmBookingRequest=confirmRequest;

    const screen=document.getElementById('agendaonline');
    if(screen?.classList.contains('active'))loadGrouped();
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(install,1900));
  window.addEventListener('load',()=>setTimeout(install,2200));
})();
