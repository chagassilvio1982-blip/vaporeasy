const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('reports-clean.css','utf8');
const nav=fs.readFileSync('main-menu.js','utf8');
const a=html.indexOf('<section id="rep"');
const b=html.indexOf('<section id="set"',a);
const rep=html.slice(a,b);

test('Relatórios mantêm período e PDF acessíveis sem expor Atualizar no corpo',()=>{
 assert.ok(a>0&&b>a);
 for(const id of ['rstart','rend','rrefresh','rpdf']){
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(rep,/id="rpdf"[^>]*aria-label="Compartilhar relatório em PDF">PDF<\/button>/);
 assert.match(rep,/<details id="reports-more-actions" class="reports-more-actions">/);
 assert.match(rep,/<button id="rrefresh" type="button" class="ghost">Atualizar relatório<\/button>/);
 assert.doesNotMatch(rep,/<details id="reports-more-actions"[^>]* open/);
 assert.match(html,/\$\("rrefresh"\)\.onclick=loadManagementReport/);
 assert.match(html,/\$\("rpdf"\)\.onclick=generateManagementReportPdf/);
 assert.match(css,/#rep \.reports-more-panel\{[^}]*position:absolute/s);
 assert.match(css,/#rep \.reports-more-panel button\{[^}]*min-height:44px/s);
});

test('Datas ficam lado a lado, sem mudar validação nem consulta do período',()=>{
 assert.match(rep,/class="reports-dates" role="group" aria-label="Período do relatório"/);
 assert.match(rep,/<label for="rstart">De<input id="rstart" type="date"><\/label>/);
 assert.match(rep,/<label for="rend">Até<input id="rend" type="date"><\/label>/);
 assert.match(rep,/Atualize em ⋯ após mudar as datas/);
 assert.match(css,/#rep \.reports-dates\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);
 assert.match(css,/#rep \.reports-dates input\{[^}]*min-height:44px/s);
 assert.match(html,/function reportRange\(\)/);
 assert.match(html,/if\(!start\|\|!end\|\|start>end\)throw Error\("Informe um período válido\."\)/);
 assert.match(html,/\.gte\("starts_at",range.startIso\)\.lt\("starts_at",range.nextIso\)/);
});

test('Seis indicadores preservados, receita distinta de pagamento recebido',()=>{
 const ids=['rcompleted','rvehicles','rclients','rrevenue','rticket','rcancelled'];
 for(const id of ids)assert.equal((rep.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(rep,/Faturamento = serviços concluídos no período, não pagamentos recebidos/);
 assert.match(html,/const revenue=completed.reduce\(\(s,x\)=>s\+Number\(x.final_value\|\|0\),0\)/);
 assert.match(html,/ticket=completed.length\?revenue\/completed.length:0/);
 assert.match(html,/completed=all.filter\(x=>x.status==="completed"\)/);
 assert.match(html,/\$\("rrevenue"\)\.textContent=money\(revenue\)/);
 assert.match(css,/#rep #rsummary\{[^}]*gap:7px!important/s);
});

test('Faturamento e produtividade abertos; clientes e recorrências recolhidos com totais',()=>{
 const ids=['reports-by-service','reports-productivity','reports-clients','reports-recurrence'];
 const opens=[true,true,false,false];
 let last=-1;
 ids.forEach((id,i)=>{
  const at=rep.indexOf('id="'+id+'"');
  assert.ok(at>last,'ordem de seções '+id);
  last=at;
  const tag=rep.slice(rep.lastIndexOf('<details',at),rep.indexOf('>',at)+1);
  assert.equal(/\sopen(?:\s|>)/.test(tag),opens[i],id);
 });
 for(const id of ['rservices','rcollabs','rclientlist','rrecurrence','rclientcount','rrecurrencecount']){
  assert.equal((rep.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(rep,/Todas as recorrências ativas, independentemente do período selecionado/);
 assert.match(html,/\$\("rclientcount"\)\.textContent="\("\+uniqueClients\+"\)"/);
 assert.match(html,/\$\("rrecurrencecount"\)\.textContent="\("\+\(rr.data\|\|\[\]\)\.length\+"\)"/);
 assert.match(html,/\.from\("recurring_plans"\).*?\.eq\("active",true\)/);
 assert.match(html,/Total de recorrências ativas/);
});

test('Nomenclatura de Plano altera apenas o texto exibido no relatório e no PDF',()=>{
 const blockStart=html.indexOf('async function loadManagementReport()');
 const blockEnd=html.indexOf('async function generateManagementReportPdf()',blockStart);
 const renderer=html.slice(blockStart,blockEnd);
 assert.match(renderer,/\$\("rservices"\)\.innerHTML=byService.length\?byService.map/);
 assert.match(renderer,/esc\(financePlanDisplayName\(x.name\)\)/);
 assert.match(html,/doc.text\(financePlanDisplayName\(x.name\),m,y\)/);
 assert.match(html,/function financePlanDisplayName\(name\)/);
 assert.match(html,/\.replace\(\/\^Pacote\(\?=\\s\|\$\)\/i,"Plano"\)/);
 assert.match(html,/const byService=aggregateBy\(completed,x=>x.service_id\)/);
});

test('Menu secundário fecha ao clicar ação, tocar fora ou pressionar Escape',()=>{
 assert.match(nav,/const reportsExtra=document.getElementById\('reports-more-actions'\)/);
 const events={},listeners={};
 const reports={open:true,contains:()=>false,addEventListener:(key,fn)=>listeners[key]=fn,querySelector:()=>({focus(){events.focus=true}})};
 class MutationObserver{constructor(){} observe(){}}
 const els={'main-primary-nav':{querySelectorAll:()=>[]},'main-nav-shell':{},tset:{classList:{contains:()=>false},removeAttribute(){}},'reports-more-actions':reports};
 vm.runInNewContext(nav,{document:{getElementById:k=>els[k]||null,addEventListener:(key,fn)=>{events[key]=fn}},MutationObserver});
 assert.equal(typeof listeners.click,'function');
 listeners.click({target:{closest:()=>({})}});
 assert.equal(reports.open,false);
 reports.open=true;
 listeners.keydown({key:'Escape'});
 assert.equal(reports.open,false);
 assert.equal(events.focus,true);
 reports.open=true;events.pointerdown({target:{}});
 assert.equal(reports.open,false);
});

test('Demais áreas e cálculos financeiros seguem preservados',()=>{
 for(const id of ['fsummary','ffaturado','frecebido','fareceber','fdespesas','fsaldo','finance-pending','na','agendaViewDay'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/<link rel="stylesheet" href="\/reports-clean\.css\?v=20261015-1">/);
 assert.match(html,/<script src="\/main-menu\.js\?v=20261015-report1"><\/script>/);
 assert.match(html,/confirm_payment_with_discount/);
 assert.match(html,/confirm_package_charge/);
 assert.match(html,/generateManagementReportPdf/);
});
