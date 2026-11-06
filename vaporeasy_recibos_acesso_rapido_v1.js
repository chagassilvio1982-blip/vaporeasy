/* Vaporeasy V2 — Acesso rápido a recibos (homologação).
 * Não altera lançamentos, valores, pagamentos ou recibos já emitidos.
 * Usa a navegação e os documentos mensais por cliente existentes.
 */
(function(){
  'use strict';
  var SEARCH_ID='vpQuickReceiptsClientSearch';
  var CENTER_ID='vpQuickReceiptsCenter';

  function authorized(){
    var profile=typeof window.vpGetCurrentProfile==='function'?window.vpGetCurrentProfile():null;
    var role=String(profile&&profile.role||'');
    return role!=='collaborator'&&role!=='operator';
  }
  function norm(value){
    return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  }
  function groupRows(){
    return Array.prototype.slice.call(document.querySelectorAll('#financeTransactionList .vp171-client-group'));
  }
  function updateFilter(){
    var input=document.getElementById(SEARCH_ID);
    if(!input)return;
    var q=norm(input.value),groups=groupRows(),visible=0;
    groups.forEach(function(group){
      var title=group.querySelector('.vp171-client-main strong');
      var show=!q||norm(title&&title.textContent).includes(q);
      group.hidden=!show;
      if(show)visible++;
    });
    var count=document.getElementById('vpQuickReceiptsCount');
    if(count){
      if(!groups.length){count.textContent='Use os filtros do Financeiro para localizar os documentos disponíveis.';}
      else count.textContent=visible+' de '+groups.length+' cliente(s) exibido(s).';
    }
  }
  function openCenter(){
    if(!authorized()){
      if(typeof window.showToast==='function')window.showToast('Recibos disponíveis somente para perfis com acesso financeiro.','error');
      return;
    }
    if(typeof window.go!=='function')return;
    var nav=Array.prototype.slice.call(document.querySelectorAll('nav button')).find(function(b){
      return /go\(['"]financeiro['"]/.test(b.getAttribute('onclick')||'');
    })||null;
    window.go('financeiro',nav);
    var all=document.querySelector('#financeiro [data-fin-filter="all"]');
    if(all&&!all.classList.contains('active'))all.click();
    var center=document.getElementById(CENTER_ID);
    if(center)center.scrollIntoView({behavior:'smooth',block:'start'});
    window.setTimeout(function(){
      updateFilter();
      var input=document.getElementById(SEARCH_ID);
      if(input&&window.innerWidth>=600)input.focus({preventScroll:true});
    },100);
  }
  window.vpOpenReceiptCenter=openCenter;
  function button(id,label,description){
    var b=document.createElement('button');
    b.type='button';
    b.id=id;
    b.className='vp-doc-quick-action';
    b.setAttribute('aria-label',description);
    b.innerHTML='<span class="vp-doc-quick-icon" aria-hidden="true">▤</span><span>'+label+'</span>';
    b.addEventListener('click',openCenter);
    return b;
  }
  function install(){
    var top=document.querySelector('#agenda .agenda-topbar');
    if(top&&!document.getElementById('vpAgendaReceiptShortcut')){
      top.appendChild(button('vpAgendaReceiptShortcut','Recibos','Abrir central de recibos por cliente e mês'));
    }
    var heading=document.querySelector('#home .summary-dashboard .summary-heading');
    if(heading&&!document.getElementById('vpHomeReceiptShortcut')){
      var holder=document.createElement('div');
      holder.className='vp-doc-home-actions';
      holder.appendChild(button('vpHomeReceiptShortcut','Recibos e cobranças','Abrir recibos e cobranças por cliente'));
      heading.insertAdjacentElement('afterend',holder);
    }
    var list=document.getElementById('financeTransactionList');
    if(list&&!document.getElementById(CENTER_ID)){
      var section=document.createElement('section');
      section.id=CENTER_ID;
      section.className='vp-quick-receipt-center';
      section.setAttribute('aria-label','Central de recibos');
      section.innerHTML='<div class="vp-quick-receipt-heading">'+
        '<div><strong>Recibos por cliente</strong><p>Selecione o mês, encontre o cliente e abra os documentos disponíveis.</p></div>'+
        '</div>'+
        '<label for="'+SEARCH_ID+'">Buscar cliente</label>'+
        '<input id="'+SEARCH_ID+'" type="search" autocomplete="off" placeholder="Nome do cliente..." aria-describedby="vpQuickReceiptsCount">'+
        '<small id="vpQuickReceiptsCount" role="status" aria-live="polite"></small>'+
        '<p class="vp-quick-receipt-note">Pacotes e serviços avulsos ainda possuem registros distintos. Não use este painel como confirmação de pagamento de pacotes: o documento unificado será uma etapa separada.</p>';
      list.insertAdjacentElement('beforebegin',section);
      var input=document.getElementById(SEARCH_ID);
      input.addEventListener('input',updateFilter);
      var month=document.getElementById('vp171FinanceMonth');
      if(month)month.addEventListener('change',function(){window.setTimeout(updateFilter,0)});
      var observer=new MutationObserver(function(){updateFilter()});
      observer.observe(list,{childList:true});
      updateFilter();
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  document.addEventListener('click',function(e){
    if(e.target&&e.target.closest&&e.target.closest('nav button'))window.setTimeout(install,0);
  },false);
})();
