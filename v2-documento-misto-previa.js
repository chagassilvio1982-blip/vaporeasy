/* Vaporeasy V2 — Prévia consolidada somente leitura.
 * Lê exclusivamente o resumo financeiro já carregado no mês.
 * Não cria, confirma, corrige nem regrava pagamentos ou lançamentos.
 */
(function(){
'use strict';
var sheetId='vpMixedReceiptSheet',selected=new Set(),data=[],clientId='';
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function money(n){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0)}
function amount(n){var x=Number(n);return Number.isFinite(x)?Math.max(0,Math.round(x*100)/100):0}
function dateBr(s){if(!s)return '';var m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'/'+m[2]+'/'+m[1]:''}
function fullReport(){try{return typeof currentFinanceMonthReport==='undefined'?null:currentFinanceMonthReport}catch(e){return null}}
function isAllowed(){try{return typeof financeAllowed==='function'&&financeAllowed()}catch(e){return false}}
function build(r,cid){
 if(!r||!r.maps||!cid)return [];
 var vm=r.maps.vm||new Map(),sm=r.maps.sm||new Map(),list=[];
 var visitByPlan=new Map(),emittedVisitIds=new Set(),planBySubscription=r.subscriptionPlanById||new Map();
 var chargeList=Array.isArray(r.packageMonthRows)?r.packageMonthRows:[];
 var seenMonthlyCharges=new Set();
 var svc=Array.isArray(r.serviceApps)?r.serviceApps:[];
 var svcIds=new Set(svc.map(function(a){return String(a.id)}));
 (r.monthApps||[]).forEach(function(a){
   // Visitas incluídas devem corresponder ao plano, não apenas ao mesmo veículo.
   if(a.client_id!==cid||svcIds.has(String(a.id))||!a.recurring_plan_id)return;
   var planKey=String(a.recurring_plan_id),v=visitByPlan.get(planKey)||[];
   v.push({id:String(a.id),vehicleId:String(a.vehicle_id||''),name:sm.get(a.service_id)?.name||'Serviço do pacote',date:dateBr(a.starts_at||a.completed_at)});
   visitByPlan.set(planKey,v);
 });
 function vehicleName(id){
   var v=vm.get(id);return v?[v.brand,v.model,v.plate].filter(Boolean).join(' • '):'Veículo sem cadastro identificado';
 }
 chargeList.filter(function(c){return c.client_id===cid&&['pending','paid','covered'].includes(c.status)}).forEach(function(c){
   var identity=String(c.subscription_id||'')+'|'+String(c.competence_month||'').slice(0,7);
   var duplicate=!!c.subscription_id&&!!c.competence_month&&seenMonthlyCharges.has(identity);
   if(c.subscription_id&&c.competence_month)seenMonthlyCharges.add(identity);
   var covered=c.status==='covered',paid=c.status==='paid',value=covered?0:amount(c.amount);
   var planId=planBySubscription.get(String(c.subscription_id||''));
   var visits=(planId?visitByPlan.get(String(planId))||[]:[]).filter(function(v){return v.vehicleId===String(c.vehicle_id||'')});
   list.push({key:'package:'+String(c.id),kind:'Pacote',vehicle:vehicleName(c.vehicle_id),
      service:sm.get(c.service_id)?.name||'Mensalidade do pacote',
      date:dateBr(c.competence_month||c.created_at),status:covered?'Coberto por ajuste':paid?'Pago':'Pendente',
      value,received:paid?value:0,pending:paid?0:value,
      detail:(duplicate?'ALERTA: mesmo plano já aparece nesta competência. Conferir duplicidade. ': '')+(visits.length?visits.length+' visita(s) vinculada(s) ao plano nesta competência, sem cobrança avulsa.':'Sem visitas vinculadas nesta competência; cobrança do pacote independente da execução'),
      discount:amount(c.commercial_discount||0),covered,needsReview:duplicate,
      duplicateWarning:duplicate?'Possível cobrança duplicada do mesmo plano na competência. Não compartilhar até conciliar os registros.':''
   });
   // Cada serviço efetivamente realizado aparece como seleção independente,
   // mas com valor zero: o preço já foi cobrado pela mensalidade correspondente.
   visits.forEach(function(v){
     if(!v.id||emittedVisitIds.has(v.id))return;
     emittedVisitIds.add(v.id);
     list.push({key:'included_visit:'+v.id,kind:'Serviço incluído no pacote',
       vehicle:vehicleName(c.vehicle_id),service:v.name,date:v.date,
       status:'Incluído no pacote',value:0,received:0,pending:0,
       detail:'Coberto pela mensalidade '+dateBr(c.competence_month||c.created_at)+'. Nenhuma cobrança avulsa.',
       discount:0,included:true
     });
   });
 });
 svc.filter(function(a){return a.client_id===cid}).forEach(function(a){
   var p=r.payMap?.get(a.id),paid=p?.status==='paid',sourceValue=amount(a.final_value);
   var hasPaidAmount=paid&&p.amount!==null&&p.amount!==undefined&&Number.isFinite(Number(p.amount));
   // Valor pago deve vir da transação registrada, nunca ser inferido do preço do atendimento.
   var value=hasPaidAmount?amount(p.amount):sourceValue;
   var inconsistent=hasPaidAmount&&Math.abs(value-sourceValue)>0.009;
   var status=paid?(hasPaidAmount?'Pago':'Pagamento a conferir'):'Pendente';
   var extra=amount(a.addon_value)>0?'Contém adicionais: '+money(a.addon_value):'';
   var notes=inconsistent?'Valor do atendimento: '+money(sourceValue)+'; pagamento registrado: '+money(value)+'. Conferir divergência.':'';
   if(paid&&!hasPaidAmount)notes='O atendimento consta como pago, mas o valor recebido não está disponível. Conferir antes de compartilhar.';
   list.push({key:'service:'+String(a.id),kind:'Avulso / extra',vehicle:vehicleName(a.vehicle_id),
      service:sm.get(a.service_id)?.name||'Serviço não identificado',
      date:dateBr(a.starts_at||a.completed_at),status,
      value,received:hasPaidAmount?value:0,pending:hasPaidAmount?0:paid?0:value,
      detail:[extra,notes].filter(Boolean).join(' • '),
      discount:amount(a.discount_amount||0),needsReview:!!notes
   });
 });
 return list.sort(function(a,b){return a.vehicle.localeCompare(b.vehicle,'pt-BR')||a.kind.localeCompare(b.kind,'pt-BR')||a.date.localeCompare(b.date)});
}
window.vpV2BuildConsolidatedPreviewModel=build;
function availableClients(r){
 var ids=new Set();
 (r?.serviceApps||[]).forEach(function(a){if(a.client_id)ids.add(a.client_id)});
 (r?.packageMonthRows||[]).forEach(function(a){if(a.client_id&&a.status!=='cancelled')ids.add(a.client_id)});
 return [...ids].sort(function(a,b){return String(r.maps.cm.get(a)?.name||'').localeCompare(String(r.maps.cm.get(b)?.name||''),'pt-BR')})
}
function snapshot(){
 return data.filter(function(item){return selected.has(item.key)})
}
function totals(rows){
 return rows.reduce(function(z,x){z.value+=x.value;z.received+=x.received;z.pending+=x.pending;return z},{value:0,received:0,pending:0})
}
function documentHtml(rows,clientName,month){
 var t=totals(rows),title='DEMONSTRATIVO DE COBRANÇAS E PAGAMENTOS — PRÉVIA';
 var body=rows.map(function(row){
    return '<tr><td><b>'+esc(row.vehicle)+'</b><br><small>'+esc(row.kind)+' · '+esc(row.service)+' · '+esc(row.date)+'</small>'+
      (row.detail?'<br><small>'+esc(row.detail)+'</small>':'')+'</td>'+
      '<td>'+esc(row.status)+'</td><td class="num">'+esc(money(row.value))+'</td>'+
      '<td class="num">'+esc(money(row.received))+'</td><td class="num">'+esc(money(row.pending))+'</td></tr>';
 }).join('');
 return '<div class="vp-mixed-paper"><div class="vp-mixed-brand">VAPOREASY <small>Estética automotiva em domicílio</small></div>'+
  '<h2>'+title+'</h2><p>Prévia operacional · não fiscal · '+esc(month)+'</p>'+
  '<p><b>Cliente:</b> '+esc(clientName)+'</p>'+
  '<table><thead><tr><th>Veículo e serviço</th><th>Situação</th><th>Valor</th><th>Recebido</th><th>A receber</th></tr></thead><tbody>'+body+'</tbody></table>'+
  '<div class="vp-mixed-totals"><span>Total dos lançamentos: <b>'+money(t.value)+'</b></span>'+
  '<span>Recebido registrado: <b>'+money(t.received)+'</b></span>'+
  '<span>Saldo pendente: <b>'+money(t.pending)+'</b></span></div>'+
  '<p class="vp-mixed-warning">Este documento utiliza os registros existentes. Visitas incluídas em pacotes não geram cobranças adicionais. Não confirma pagamentos nem altera recibos emitidos. Se houver diferenças entre valores recebidos e cobranças, confira os lançamentos antes de compartilhar.</p></div>'
}
function selectedClientName(){
 var r=fullReport();return r?.maps?.cm?.get(clientId)?.name||'Cliente';
}
function monthLabel(){
 var value=document.getElementById('fmonth')?.value||'';return /^\d{4}-\d{2}$/.test(value)?value:'Competência selecionada';
}
function refreshPreview(){
 var p=document.getElementById('vpMixedReceiptPreview');if(!p)return;
 var rows=snapshot(),t=totals(rows),needsReview=rows.some(function(row){return row.needsReview});
 p.innerHTML=rows.length?documentHtml(rows,selectedClientName(),monthLabel()):'<div class="vp-mixed-empty">Selecione ao menos um serviço ou pacote para visualizar o documento.</div>';
 if(needsReview)p.insertAdjacentHTML('afterbegin','<p class="vp-mixed-review-warning" role="alert">Há diferença entre o valor do serviço e o pagamento registrado, ou um pagamento sem valor verificável. Confira os lançamentos. O compartilhamento está bloqueado.</p>');
 var summary=document.getElementById('vpMixedReceiptSummary');
 if(summary)summary.textContent=rows.length+' item(ns) · '+money(t.received)+' recebidos · '+money(t.pending)+' pendentes';
 var print=document.getElementById('vpMixedPrint');if(print)print.disabled=!rows.length||needsReview;
 var share=document.getElementById('vpMixedShare');if(share)share.disabled=!rows.length||needsReview;
}
function refreshItems(){
 var body=document.getElementById('vpMixedReceiptItems');if(!body)return;
 data=build(fullReport(),clientId);selected=new Set(data.map(function(x){return x.key}));
 var groups=new Map();
 data.forEach(function(item){
  var v=groups.get(item.vehicle)||[];
  v.push(item);groups.set(item.vehicle,v);
 });
 var controls='<div class="vp-mixed-pick-actions" aria-label="Selecionar serviços do documento">'+
   '<span>Marque os serviços de cada carro</span>'+
   '<button type="button" data-vp-action="all">Todos</button>'+
   '<button type="button" data-vp-action="none">Limpar</button></div>';
 var rows=[...groups.entries()].map(function(entry){
  var name=entry[0],items=entry[1],groupTotal=items.reduce(function(n,x){return n+x.value},0);
  return '<section class="vp-mixed-vehicle-group" aria-label="Lançamentos de '+esc(name)+'">'+
    '<div class="vp-mixed-vehicle-header"><strong>'+esc(name)+'</strong><span>'+items.length+' item(ns) · '+money(groupTotal)+'</span></div>'+
    items.map(function(x){
      var statusClass=x.needsReview?'review':x.pending>0?'pending':'paid';
      return '<label class="vp-mixed-line"><input type="checkbox" data-vp-mixed-key="'+esc(x.key)+'" checked>'+
      '<span class="vp-mixed-line-body"><strong>'+esc(x.service)+'</strong>'+
      '<small>'+esc(x.kind)+(x.date?' · '+esc(x.date):'')+'</small>'+
      (x.detail?'<small class="vp-mixed-detail">'+esc(x.detail)+'</small>':'')+
      (x.discount?'<small>Desconto já aplicado: '+money(x.discount)+'</small>':'')+
      '</span><span class="vp-mixed-line-side"><b>'+money(x.value)+'</b>'+
      '<small class="vp-mixed-chip '+statusClass+'">'+esc(x.status)+'</small></span></label>';
    }).join('')+'</section>';
 }).join('');
 body.innerHTML=data.length?controls+rows:'<div class="vp-mixed-empty">Este cliente não tem lançamentos nessa competência.</div>';
 refreshPreview();
}
function setupClients(){
 var r=fullReport(),select=document.getElementById('vpMixedReceiptClient');
 if(!select)return;
 var ids=availableClients(r);
 select.innerHTML='<option value="">Escolha o cliente</option>'+ids.map(function(id){return '<option value="'+esc(id)+'">'+esc(r.maps.cm.get(id)?.name||'Cliente')+'</option>'}).join('');
 clientId='';data=[];selected.clear();
 if(ids.length===1){select.value=ids[0];clientId=ids[0]}
 refreshItems();
}
function open(){
 if(!isAllowed())return;
 var r=fullReport();
 var month=document.getElementById('fmonth')?.value||'';
 if(!r||!r.keys||r.keys.month!==month){if(typeof show==='function')show('msg','Os dados deste mês ainda não terminaram de carregar. Atualize o Financeiro e tente novamente.','error');return}
 var sheet=document.getElementById(sheetId);
 if(!sheet)return;
 sheet.hidden=false;sheet.setAttribute('aria-hidden','false');
 setupClients();
 var focus=document.getElementById('vpMixedReceiptClient');if(focus)focus.focus();
}
function close(){
 var s=document.getElementById(sheetId);
 if(s){s.hidden=true;s.setAttribute('aria-hidden','true')}
}
function textDoc(){
 var rows=snapshot(),t=totals(rows),lines=['VAPOREASY — Demonstrativo consolidado',selectedClientName()+' · '+monthLabel(),''];
 rows.forEach(function(x){lines.push(x.vehicle+' | '+x.kind+' | '+x.service+' | '+x.status+' | '+money(x.value)+' | recebido '+money(x.received)+' | pendente '+money(x.pending))});
 lines.push('','Lançamentos: '+money(t.value),'Recebido: '+money(t.received),'A receber: '+money(t.pending),'Mensalidades podem ser pagas antecipadamente; pagamento não comprova execução dos serviços. Visitas incluídas em planos não são cobradas novamente.','Prévia não fiscal — consulte os registros originais.');
 return lines.join('\n');
}
function share(){
 if(!snapshot().length||snapshot().some(function(row){return row.needsReview}))return;
 var t=textDoc();
 if(navigator.share){navigator.share({title:'Vaporeasy — Demonstrativo',text:t}).catch(function(){});return}
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(t).then(function(){if(typeof show==='function')show('msg','Documento copiado para compartilhar.','ok')}).catch(function(){});
}
function printDoc(){
 var rows=snapshot();if(!rows.length||rows.some(function(row){return row.needsReview}))return;
 var markup=documentHtml(rows,selectedClientName(),monthLabel());
 var win=window.open('','_blank');if(!win){if(typeof show==='function')show('msg','O navegador bloqueou a prévia de impressão.','error');return}
 win.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Vaporeasy — demonstrativo</title><style>'+
  'body{font:14px system-ui;color:#183044;margin:32px;line-height:1.45}.vp-mixed-brand{font-size:27px;font-weight:850;color:#126e93}.vp-mixed-brand small{display:block;font-size:10px}h2{font-size:18px;margin-top:25px}table{width:100%;border-collapse:collapse;font-size:11px;margin:22px 0}th,td{padding:9px;border-bottom:1px solid #bfd4de;text-align:left;vertical-align:top}.num{text-align:right;white-space:nowrap}.vp-mixed-totals{display:flex;justify-content:space-between;gap:10px;font-size:11px}.vp-mixed-warning{font-size:10px;color:#607988;margin-top:25px}@media print{body{margin:10mm} @page{size:A4;margin:8mm}}'+
  '</style></head><body>'+markup+'<p style="margin-top:35px;font-size:11px">Use Imprimir → Salvar como PDF.</p><script>window.addEventListener("load",function(){window.print()})<\/script></body></html>');
 win.document.close();
}
window.vpV2OpenConsolidatedPreview=open;
function install(){
 if(document.getElementById(sheetId))return;
 var place=document.querySelector('.vp-receipts-search');
 if(!place)return;
 var btn=document.createElement('button');btn.type='button';btn.id='vpMixedReceiptOpen';btn.className='vp-receipts-shortcut';btn.textContent='Montar documento único (prévia)';btn.addEventListener('click',open);place.appendChild(btn);
 var sheet=document.createElement('div');sheet.id=sheetId;sheet.className='vp-mixed-backdrop';sheet.hidden=true;sheet.setAttribute('aria-hidden','true');
 sheet.innerHTML='<section class="vp-mixed-sheet" role="dialog" aria-modal="true" aria-label="Documento consolidado">'+
 '<header><div><strong>Documento único por cliente</strong><small>Selecionar pacote, avulso e serviço por veículo</small></div><button id="vpMixedClose" type="button" aria-label="Fechar">×</button></header>'+
 '<label for="vpMixedReceiptClient">Cliente</label><select id="vpMixedReceiptClient"></select>'+
 '<p class="vp-mixed-hint">Marque as linhas a incluir. Valores e situações vêm dos registros existentes; a seleção não altera cobranças.</p>'+
 '<div id="vpMixedReceiptItems"></div>'+
 '<div class="vp-mixed-controls"><span id="vpMixedReceiptSummary"></span><button id="vpMixedShare" type="button" disabled>Compartilhar</button><button id="vpMixedPrint" type="button" disabled>Imprimir / salvar PDF</button></div>'+
 '<div id="vpMixedReceiptPreview"></div></section>';
 document.body.appendChild(sheet);
 document.getElementById('vpMixedClose').addEventListener('click',close);
 var monthInput=document.getElementById('fmonth');if(monthInput)monthInput.addEventListener('change',close);
 sheet.addEventListener('click',function(e){if(e.target===sheet)close()});
 document.getElementById('vpMixedReceiptClient').addEventListener('change',function(e){clientId=e.target.value;refreshItems()});
 document.getElementById('vpMixedReceiptItems').addEventListener('click',function(e){
  var action=e.target?.closest?.('[data-vp-action]')?.getAttribute('data-vp-action');
  if(action!=='all'&&action!=='none')return;
  selected=action==='all'?new Set(data.map(function(x){return x.key})):new Set();
  document.querySelectorAll('#vpMixedReceiptItems input[data-vp-mixed-key]').forEach(function(input){
   input.checked=selected.has(input.getAttribute('data-vp-mixed-key'));
  });
  refreshPreview();
 });
 document.getElementById('vpMixedReceiptItems').addEventListener('change',function(e){
  var k=e.target?.getAttribute('data-vp-mixed-key');if(!k)return;
  if(e.target.checked)selected.add(k);else selected.delete(k);refreshPreview()
 });
 document.getElementById('vpMixedPrint').addEventListener('click',printDoc);
 document.getElementById('vpMixedShare').addEventListener('click',share);
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!sheet.hidden)close()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();
