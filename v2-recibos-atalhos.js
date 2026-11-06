/* Vaporeasy V2 — Atalhos e busca de recibos por cliente.
 * Executado apenas pela navegação existente; sem modificar pagamentos ou valores.
 */
(function(){
'use strict';
var key='vpReceiptsClientFilter';
var quickIds=['vpReceiptsNav','vpReceiptsAgenda','vpReceiptsFinance'];

function norm(x){
 return String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function financeAllowedNow(){
 var financeTab=document.getElementById('tf');
 return !!financeTab && !financeTab.classList.contains('hidden') && !financeTab.disabled;
}
function updateRoleVisibility(){
 var allowed=financeAllowedNow();
 quickIds.forEach(function(id){
   var b=document.getElementById(id);
   if(b)b.hidden=!allowed;
 });
}
function filterMonthlyDocuments(){
 var input=document.getElementById(key),box=document.getElementById('fmonthdocs');
 if(!input||!box)return;
 var text=norm(input.value),items=Array.from(box.querySelectorAll(':scope > .item')),matched=0;
 items.forEach(function(item){
   var top=item.querySelector('.actions > div:first-child > div:first-child');
   var name=norm(top?top.textContent:item.textContent);
   var visible=!text||name.includes(text);
   item.hidden=!visible;
   if(visible)matched++;
 });
 var counter=document.getElementById('vpReceiptsFilterCount');
 if(counter)counter.textContent=items.length?matched+' de '+items.length+' cliente(s) neste mês.':'Sem documentos disponíveis no mês escolhido.';
}
function openReceipts(){
 if(!financeAllowedNow())return;
 var financeTab=document.getElementById('tf');
 // Reutilizar o fluxo de autenticação e carregamento atual do Financeiro.
 financeTab.click();
 var section=document.getElementById('finance-month-docs');
 if(section)section.open=true;
 window.setTimeout(function(){
   if(section)section.scrollIntoView({behavior:'smooth',block:'start'});
   filterMonthlyDocuments();
 },70);
}
window.vpV2OpenReceipts=openReceipts;
function newButton(id,label,cls){
 var b=document.createElement('button');
 b.id=id;b.type='button';
 b.className='vp-receipts-shortcut '+cls;
 b.textContent=label;
 b.setAttribute('aria-label','Abrir recibos por cliente e mês');
 b.addEventListener('click',openReceipts);
 return b;
}
function install(){
 var nav=document.getElementById('main-primary-nav'),agenda=document.querySelector('#age .agenda-head-actions');
 var finance=document.querySelector('#fin .finance-head-actions'),doc=document.getElementById('finance-month-docs');
 var tab=document.getElementById('ta'),finTab=document.getElementById('tf');
 if(nav&&tab&&!document.getElementById(quickIds[0])){
   tab.insertAdjacentElement('afterend',newButton(quickIds[0],'🧾 Recibos','vp-receipts-nav'));
 }
 if(agenda&&!document.getElementById(quickIds[1])){
   var add=document.getElementById('na');
   if(add)add.insertAdjacentElement('afterend',newButton(quickIds[1],'🧾 Recibos','vp-receipts-agenda'));
 }
 if(finance&&!document.getElementById(quickIds[2])){
   finance.insertBefore(newButton(quickIds[2],'🧾 Recibos','vp-receipts-finance'),finance.firstChild);
 }
 if(doc&&!document.getElementById(key)){
   var host=document.createElement('div');
   host.className='vp-receipts-search';
   host.innerHTML='<label for="'+key+'">Encontrar recibo pelo nome do cliente</label>'+
     '<input type="search" id="'+key+'" autocomplete="off" placeholder="Busque o cliente..." aria-describedby="vpReceiptsFilterCount">'+
     '<small id="vpReceiptsFilterCount" role="status" aria-live="polite"></small>'+
     '<p>Este painel reúne documentos mensais de serviços concluídos. Mensalidades de pacotes ainda são exibidas separadamente em A receber e Recebidos.</p>';
   var list=document.getElementById('fmonthdocs');
   if(list)list.insertAdjacentElement('beforebegin',host);
   var search=document.getElementById(key);
   if(search)search.addEventListener('input',filterMonthlyDocuments);
   if(list){
     var mutation=new MutationObserver(filterMonthlyDocuments);
     mutation.observe(list,{childList:true});
   }
   var month=document.getElementById('fmonth');
   if(month)month.addEventListener('change',function(){window.setTimeout(filterMonthlyDocuments,50)});
   filterMonthlyDocuments();
 }
 if(finTab){
   var roleObserver=new MutationObserver(updateRoleVisibility);
   roleObserver.observe(finTab,{attributes:true,attributeFilter:['class','disabled']});
 }
 updateRoleVisibility();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
