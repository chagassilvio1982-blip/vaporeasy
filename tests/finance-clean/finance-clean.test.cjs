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
 assert.match(html,/<link rel="stylesheet" href="\/finance-clean\.css\?v=20261015-1">/);
 assert.match(html,/<script src="\/main-menu\.js\?v=20261015-fin1"><\/script>/);
 assert.match(html,/cancel_appointment_with_scope/);
 assert.match(html,/complete_appointment_with_cares/);
});
