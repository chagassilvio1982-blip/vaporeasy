/* Vaporeasy — central de avisos de novas solicitações */
(function(){
  'use strict';

  const SEEN_KEY='vaporeasy_booking_request_seen_v1';
  const POLL_MS=20000;
  let lastPendingIds=null;
  let busy=false;
  let timer=null;

  function pendingRequests(rows){
    return (Array.isArray(rows)?rows:[]).filter(r=>{
      const s=String(r?.status||'Pendente').trim().toLowerCase();
      return s==='pendente' || s==='em análise' || s==='em analise';
    });
  }

  function getSeen(){
    try{
      const v=JSON.parse(localStorage.getItem(SEEN_KEY)||'[]');
      return new Set(Array.isArray(v)?v.map(String):[]);
    }catch(_){ return new Set(); }
  }

  function setSeen(ids){
    try{ localStorage.setItem(SEEN_KEY,JSON.stringify([...new Set(ids.map(String))])); }catch(_){}
  }

  function ensureStyles(){
    if(document.getElementById('vpRequestBellStyle'))return;
    const s=document.createElement('style');
    s.id='vpRequestBellStyle';
    s.textContent=`
      .app-header{position:relative!important}
      #vpRequestBell{
        position:absolute;right:54px;top:13px;z-index:30;
        width:36px;height:36px;border-radius:50%;
        border:1.5px solid rgba(7,174,241,.75);
        background:#082a3e;color:#fff;
        display:flex;align-items:center;justify-content:center;
        font-size:18px;line-height:1;cursor:pointer;
        box-shadow:0 3px 10px rgba(3,44,68,.18)
      }
      #vpRequestBell:active{transform:scale(.96)}
      #vpRequestBellBadge{
        position:absolute;right:-5px;top:-5px;
        min-width:18px;height:18px;padding:0 4px;
        border-radius:999px;background:#e53935;color:#fff;
        border:2px solid #f4f8fa;
        font-size:10px;font-weight:900;line-height:14px;
        display:none;align-items:center;justify-content:center;
        box-sizing:border-box
      }
      #vpRequestBellBadge.show{display:flex}
      #vpRequestAlert{
        position:fixed;left:14px;right:14px;top:112px;z-index:10000;
        max-width:560px;margin:0 auto;
        background:#0c3146;color:#fff;
        border:1px solid rgba(27,183,240,.65);
        border-radius:15px;padding:13px 46px 13px 14px;
        box-shadow:0 12px 35px rgba(0,0,0,.28);
        display:none;cursor:pointer
      }
      #vpRequestAlert.show{display:block}
      #vpRequestAlert b{display:block;margin-bottom:4px}
      #vpRequestAlert small{color:#c1dce9;line-height:1.35}
      #vpRequestAlertClose{
        position:absolute;right:10px;top:9px;width:30px;height:30px;
        border:0;background:transparent;color:#fff;font-size:22px
      }
      @media(max-width:480px){
        #vpRequestBell{right:48px;top:10px;width:32px;height:32px;font-size:16px}
        #vpRequestAlert{top:104px}
      }
    `;
    document.head.appendChild(s);
  }

  function ensureBell(){
    ensureStyles();
    let bell=document.getElementById('vpRequestBell');
    if(bell)return bell;

    const header=document.querySelector('.app-header');
    if(!header)return null;

    bell=document.createElement('button');
    bell.id='vpRequestBell';
    bell.type='button';
    bell.setAttribute('aria-label','Solicitações pendentes');
    bell.title='Solicitações pendentes';
    bell.innerHTML='🔔<span id="vpRequestBellBadge"></span>';
    bell.addEventListener('click',openRequests);
    header.appendChild(bell);
    return bell;
  }

  function updateBadge(count){
    ensureBell();
    const badge=document.getElementById('vpRequestBellBadge');
    if(!badge)return;
    badge.textContent=count>99?'99+':String(count);
    badge.classList.toggle('show',count>0);
  }

  function showNewAlert(requests){
    if(!requests.length)return;
    let box=document.getElementById('vpRequestAlert');
    if(!box){
      box=document.createElement('div');
      box.id='vpRequestAlert';
      box.innerHTML='<b></b><small></small><button id="vpRequestAlertClose" type="button" aria-label="Fechar">×</button>';
      document.body.appendChild(box);
      box.addEventListener('click',e=>{
        if(e.target?.id==='vpRequestAlertClose'){
          box.classList.remove('show');
          e.stopPropagation();
          return;
        }
        openRequests();
      });
    }

    const r=requests[0]||{};
    const extra=requests.length>1?' + '+(requests.length-1)+' outra(s)':'';
    const title=box.querySelector('b');
    const detail=box.querySelector('small');
    if(title)title.textContent='Nova solicitação de serviço'+extra;
    if(detail)detail.textContent=[
      r.service_name||'Serviço',
      r.client_name||'Cliente',
      r.vehicle_label||'Veículo',
      r.preferred_date?String(r.preferred_date).split('-').reverse().join('/'):''
    ].filter(Boolean).join(' • ');
    box.classList.add('show');

    try{ navigator.vibrate?.(120); }catch(_){}
    setTimeout(()=>box.classList.remove('show'),9000);
  }

  async function openRequests(){
    document.getElementById('vpRequestAlert')?.classList.remove('show');

    try{
      if(typeof window.go==='function'){
        window.go('agendaonline',null);
      }else{
        const homeCard=document.getElementById('vpOnlineHomeCard');
        if(homeCard)homeCard.click();
      }
    }catch(_){}

    setTimeout(async()=>{
      try{ await window.loadBookingRequestsAdmin?.(); }catch(_){}
      const target=document.getElementById('onlineBookingRequestsList');
      target?.scrollIntoView({behavior:'smooth',block:'start'});
    },350);
  }

  async function poll(){
    if(busy || document.body.classList.contains('vp-auth-locked'))return;
    if(typeof window.vpBridge!=='function')return;

    busy=true;
    try{
      const data=await window.vpBridge('booking_requests');
      const pending=pendingRequests(data?.requests||[]);
      const ids=pending.map(r=>String(r.id||'')).filter(Boolean);
      updateBadge(ids.length);

      const seen=getSeen();

      if(lastPendingIds===null){
        // Primeira leitura: mostra a quantidade, mas não dispara alerta antigo.
        lastPendingIds=new Set(ids);
        setSeen([...new Set([...seen,...ids])]);
        return;
      }

      const newItems=pending.filter(r=>{
        const id=String(r.id||'');
        return id && !lastPendingIds.has(id) && !seen.has(id);
      });

      if(newItems.length){
        showNewAlert(newItems);
        setSeen([...new Set([...seen,...newItems.map(r=>String(r.id))])]);
      }

      lastPendingIds=new Set(ids);
    }catch(_){
      // Não interrompe o app se a sessão estiver atualizando.
    }finally{
      busy=false;
    }
  }

  function start(){
    ensureBell();
    poll();
    clearInterval(timer);
    timer=setInterval(poll,POLL_MS);

    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')poll();
    });

    window.addEventListener('focus',poll);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(start,1200);
  });
  window.addEventListener('load',()=>setTimeout(start,1600));

  window.vpRefreshRequestNotifications=poll;
  window.vpOpenRequestNotifications=openRequests;
})();
