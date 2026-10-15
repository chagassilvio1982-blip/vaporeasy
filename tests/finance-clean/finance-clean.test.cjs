const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('finance-clean.css','utf8');
const nav=fs.readFileSync('main-menu.js','utf8');
const a=html.indexOf('<section id="fin"');
const b=html.indexOf('<section id="rep"',a);
const fin=html.slice(a,b);

test('Financeiro apresenta quatro KPIs originais sem alterar seus identificadores',()=>{
 assert.ok(a>0&&b>a);
 for(const id of ['ffaturado','frecebido','fareceber','fdespesas','fsaldo']){
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 const kpis=fin.slice(fin.indexOf('id="fsummary"'),fin.indexOf('finance-cashline'));
 assert.equal((kpis.match(/class="item"/g)||[]).length,4);
 assert.match(kpis,/Faturado no mês/);
 assert.match(kpis,/Recebido no mês/);
 assert.match(kpis,/>A receber</);
 assert.match(kpis,/Despesas do mês/);
 assert.match(fin,/id="fsaldo" class="time"/);
 assert.match(fin,/Recebido − despesas registradas/);
});

test('Cobranças a receber vêm primeiro; outras seções começam recolhidas',()=>{
 const ids=['finance-pending','finance-month-docs','finance-paid','finance-expenses'];
 let last=-1;
 for(const id of ids){
   const at=fin.indexOf('id="'+id+'"');
   assert.ok(at>last,id+' deve manter ordem operacional');last=at;
   assert.equal((fin.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
 assert.match(fin,/<details id="finance-pending"[^>]* open>/);
 for(const id of ids.slice(1))assert.match(fin,new RegExp('<details id="'+id+'"[^>]*>'));
 for(const id of ['fpendingcount','fpending','fmonthdoccount','fmonthdocs','fpaidcount','fpaid','fexpensecount','fexpenses'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(fin,/O documento usa somente os serviços concluídos no mês selecionado/);
});

test('Atualizar e Relatório do mês permanecem disponíveis, mas não ocupam duas linhas',()=>{
 const menu=fin.slice(fin.indexOf('id="finance-more-actions"'),fin.indexOf('</details>',fin.indexOf('id="finance-more-actions"')));
 assert.match(fin,/id="fnewexp"[^>]*>\+ Despesa<\/button>/);
 assert.match(fin,/id="fmonth" type="month"/);
 assert.match(menu,/id="frefresh"[^>]*>Atualizar<\/button>/);
 assert.match(menu,/id="fmonthreport"[^>]*>Relatório do mês<\/button>/);
 assert.doesNotMatch(menu,/<details[^>]*\bopen(?:\s|=|>)/);
 assert.match(html,/\$\("fnewexp"\)\.onclick=\(\)=>openExpense\(\)/);
 assert.match(html,/\$\("frefresh"\)\.onclick=loadFinance/);
 assert.match(html,/\$\("fmonth"\)\.onchange=loadFinance/);
 assert.match(html,/\$\("fmonthreport"\)\.onclick=generateMonthlyFinanceReportPdf/);
 assert.match(css,/#fin \.finance-more-panel\{[^}]*width:min\(218px/s);
 assert.match(css,/#fin \.finance-more-panel button\{[^}]*min-height:44px/s);
});

test('Saldo do caixa é compacto e cálculo mantém implementação existente',()=>{
 assert.match(css,/#fin \.finance-cashline\{/);
 assert.match(css,/#fin #fsummary\{/);
 assert.match(html,/const sync=await sb\.rpc\("ensure_current_package_charges"\)/);
 assert.match(html,/async function loadFinance\(\)/);
 assert.match(html,/\$\("fsaldo"\)\.textContent=/);
 assert.match(html,/\$\("fareceber"\)\.textContent=/);
 assert.match(html,/\$\("ffaturado"\)\.textContent=/);
 assert.match(html,/\$\("frecebido"\)\.textContent=/);
 assert.match(html,/\$\("fdespesas"\)\.textContent=/);
 assert.match(html,/generateMonthlyFinanceReportPdf/);
});

test('Menu ⋯ fecha ao selecionar ação, tocar fora e Escape',()=>{
 assert.match(nav,/const financeExtra=document\.getElementById\('finance-more-actions'\)/);
 const actions={};const listeners={};
 const extra={open:true,contains:()=>false,addEventListener:(e,cb)=>listeners[e]=cb,querySelector:()=>({focus(){actions.focus=true}})};
 const shell={};const settings={classList:{contains:()=>false},removeAttribute(){}};
 class Observer{constructor(cb){} observe(){}}
 vm.runInNewContext(nav,{document:{
  getElementById:id=>({'main-primary-nav':{querySelectorAll:()=>[]},'main-nav-shell':shell,'tset':settings,'finance-more-actions':extra})[id]||null,
  addEventListener:(name,cb)=>actions[name]=cb
 },MutationObserver:Observer});
 assert.equal(typeof listeners.click,'function');
 listeners.click({target:{closest:()=>true}});
 assert.equal(extra.open,false);
 extra.open=true;
 listeners.keydown({key:'Escape'});
 assert.equal(extra.open,false);
 assert.equal(actions.focus,true);
 extra.open=true;
 actions.pointerdown({target:{}});
 assert.equal(extra.open,false);
});

test('A etapa Financeiro não remove agendamento, recibos e tela de planos',()=>{
 for(const id of ['na','apf','rshare','rcharge','rprint','finishf','agendaViewDay','agendaViewList'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/<link rel="stylesheet" href="\/finance-clean\.css\?v=20261015-2">/);
 assert.match(html,/<script src="\/main-menu\.js\?v=20261015-fin1"><\/script>/);
 assert.match(html,/cancel_appointment_with_scope/);
 assert.match(html,/complete_appointment_with_cares/);
});

test('rótulo Plano e cartões compactos não afetam dados financeiros',()=>{
 const start=html.indexOf('function financePlanDisplayName('),end=html.indexOf('async function getPackageChargeShareData(',start);
 assert.ok(start>0&&end>start);
 const context={
  esc:x=>String(x??''),
  money:n=>'R$ '+Number(n||0).toFixed(2),
  packageFrequencyMeta:()=>({label:'Semanal',visits:4}),
  packageChargeCommercialDiscount:()=>0,
  financePackageDate:()=> '14/10/2026'
 };
 const code=html.slice(start,end)+';({financePlanDisplayName,financePackageChargeCard});';
 const model=vm.runInNewContext(code,context);
 assert.equal(model.financePlanDisplayName('Pacote Premium'),'Plano Premium');
 assert.equal(model.financePlanDisplayName('Pacote'),'Plano');
 assert.equal(model.financePlanDisplayName('Plano Plus'),'Plano Plus');
 const ids={
  cm:new Map([['c',{name:'Silvio'}]]),
  vm:new Map([['v',{brand:'BMW',model:'M4',plate:'DDD7177'}]]),
  sm:new Map([['s',{name:'Pacote Premium'}]])
 };
 const row={id:'charge',client_id:'c',vehicle_id:'v',service_id:'s',
  frequency:'weekly',visits_per_month:4,amount:780,due_date:'2026-10-14',status:'pending'};
 const unpaid=model.financePackageChargeCard(row,ids,false);
 assert.match(unpaid,/class="item finance-pending-card"/);
 assert.match(unpaid,/Plano Premium/);
 assert.doesNotMatch(unpaid,/Pacote Premium/);
 assert.match(unpaid,/R\$ 780\.00/);
 assert.match(unpaid,/Vencimento 14\/10\/2026/);
 assert.match(unpaid,/data-pkg-pay="charge"/);
 assert.match(unpaid,/data-pkg-charge-share="charge"/);
 const paid=model.financePackageChargeCard({...row,status:'paid'},ids,true);
 assert.doesNotMatch(paid,/finance-pending-card/);
 assert.doesNotMatch(paid,/data-pkg-pay=/);
 assert.match(paid,/Recibo de pagamento/);
});

test('comprovante em atendimento a receber é claramente nomeado Atendimento / Pix',()=>{
 const start=html.indexOf('function financeApptCard(');
 const end=html.indexOf('function financePackageDate(',start);
 assert.ok(start>0&&end>start);
 const fn=vm.runInNewContext(html.slice(start,end)+';financeApptCard;',{
  esc:x=>String(x??''),
  money:n=>'R$ '+Number(n||0).toFixed(2),
  receiptDate:()=> '07/10/2026'
 });
 const maps={
  cm:new Map([['c',{name:'Enrico piccioto'}]]),
  vm:new Map([['v',{brand:'Porsche',model:'Panamera',plate:'SRQ1H67'}]]),
  sm:new Map([['s',{name:'Polimento técnico'}]])
 };
 const row={id:'appointment',client_id:'c',vehicle_id:'v',service_id:'s',
  completed_at:'2026-10-07T09:04:00Z',final_value:1500};
 const unpaid=fn(row,{status:'pending',amount:1500},maps,false);
 assert.match(unpaid,/finance-pending-card/);
 assert.match(unpaid,/data-fin-pay="appointment"/);
 assert.match(unpaid,/data-fin-receipt="appointment">Atendimento \/ Pix<\/button>/);
 assert.doesNotMatch(unpaid,/>Recibo<\/button>/);
 assert.match(unpaid,/Porsche Panamera/);
 const paid=fn(row,{status:'paid',amount:1500},maps,true);
 assert.doesNotMatch(paid,/finance-pending-card/);
 assert.match(paid,/data-fin-receipt="appointment">Recibo<\/button>/);
 assert.doesNotMatch(paid,/data-fin-pay=/);
});

test('documento do atendimento pendente não finge quitação nem realiza baixa',()=>{
 const begin=html.indexOf('async function openReceipt(id){'),end=html.indexOf('async function openSameClientReceiptGroup()',begin);
 assert.ok(begin>0&&end>begin);
 const opener=html.slice(begin,end);
 assert.match(opener,/const paid=currentReceipt\.payment\?\.status==="paid"/);
 assert.match(opener,/paid\?"Compartilhar recibo":"Compartilhar comprovante"/);
 assert.match(opener,/receiptHtml\(currentReceipt\)/);
 assert.doesNotMatch(opener,/confirm_payment_with_discount|confirm_package_charge|savePayment/);
 const receiptStart=html.indexOf('function receiptHtml(d){');
 const receiptEnd=html.indexOf('async function getReceiptGroupData(',receiptStart);
 const receipt=html.slice(receiptStart,receiptEnd);
 assert.match(receipt,/if\(!paid\)\{/);
 assert.match(receipt,/PAGAMENTO PENDENTE/);
 assert.match(receipt,/PAGAMENTO RECEBIDO/);
 assert.match(html,/data-fin-receipt/);
 assert.match(html,/\.onclick=\(\)=>openReceipt\(b\.dataset\.finReceipt\)/);
});

test('baixa financeira permanece no formulário de confirmação preexistente',()=>{
 assert.match(html,/<dialog id="pd">/);
 assert.match(html,/id="paysubmit"[^>]*>Confirmar recebimento/);
 assert.match(html,/async function openPayment\(id,mode="receive"\)/);
 assert.match(html,/async function openPackagePayment\(id\)/);
 assert.match(html,/async function savePayment\(e\)/);
 assert.match(html,/sb\.rpc\("confirm_package_charge"/);
 assert.match(html,/sb\.rpc\("confirm_payment_with_discount"/);
 assert.match(html,/\$\("paytitle"\)\.textContent="Confirmar mensalidade do plano"/);
});

test('CSS compacto mantém dois botões operacionais com alvo mínimo de 44px',()=>{
 assert.match(css,/#fin #fpending \.finance-pending-card\{/);
 assert.match(css,/#fin #fpending \.finance-pending-card>\.actions:last-child\{/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/#fin #fpending \.finance-pending-card>\.actions:last-child button\{[^}]*min-height:44px/s);
 assert.match(html,/<link rel="stylesheet" href="\/finance-clean\.css\?v=20261015-2">/);
});
