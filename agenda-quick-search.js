/* Busca local na lista de atendimentos já carregada; não consulta nem modifica dados. */
(function(root){
  'use strict';
  function normalizeSearch(value){
    return String(value == null ? '' : value)
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/\s+/g,' ').trim();
  }
  function matchesSearch(text,query){
    const needle=normalizeSearch(query);
    if(!needle)return true;
    const haystack=normalizeSearch(text);
    if(haystack.includes(needle))return true;
    const compact=value=>value.replace(/[^a-z0-9]/g,'');
    const normalizedNeedle=compact(needle);
    return normalizedNeedle.length>0&&compact(haystack).includes(normalizedNeedle);
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={normalizeSearch,matchesSearch};
  if(typeof document==='undefined')return;
  function init(){
    const list=document.getElementById('agendaListItems');
    const input=document.getElementById('agendaQuickSearch');
    const status=document.getElementById('agendaQuickSearchStatus');
    if(!list||!input||!status||list.dataset.agendaQuickSearchReady)return;
    list.dataset.agendaQuickSearchReady='1';
    function apply(){
      let total=0,visible=0,heading=null,groupVisible=0;
      const query=input.value;
      function finishGroup(){if(heading)heading.classList.toggle('hidden',groupVisible===0&&!!normalizeSearch(query))}
      for(const child of Array.from(list.children)){
        if(child.matches('.list-caption')){
          finishGroup();heading=child;groupVisible=0;
        }else if(child.matches('[data-agenda-list-day]')){
          total++;
          const match=matchesSearch(child.textContent,query);
          child.classList.toggle('hidden',!match);
          if(match){visible++;groupVisible++}
        }
      }
      finishGroup();
      status.textContent=total
        ?(normalizeSearch(query)?visible+' de '+total+' agendamentos encontrados':total+' agendamentos neste mês')
        :(normalizeSearch(query)?'Nenhum agendamento encontrado com esta busca.':'');
    }
    input.addEventListener('input',apply);
    new MutationObserver(apply).observe(list,{childList:true});
    apply();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})(typeof globalThis!=='undefined'?globalThis:this);
