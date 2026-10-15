const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('agenda-quick.css','utf8');
const nav=fs.readFileSync('main-menu.js','utf8');
const a=html.indexOf('<section id="age"');
const z=html.indexOf('<section id="fin"',a);
const agenda=html.slice(a,z);
const menuStart=agenda.indexOf('<details id="agenda-more-actions"');
const menuEnd=agenda.indexOf('</details>',menuStart);
const menu=agenda.slice(menuStart,menuEnd);

test('agenda mantém caminho rápido para agendar e ações secundárias acessíveis via ⋯',()=>{
 assert.ok(a>0&&z>a);
 assert.match(agenda,/id="na"[^>]*>\+ Agendamento<\/button>/);
 assert.match(agenda,/<details id="agenda-more-actions" class="agenda-more-actions">/);
 assert.match(agenda,/<summary aria-label="Mais opções da agenda"/);
 assert.doesNotMatch(menu,/<details[^>]*\bopen(?:\s|>|=)/);
 assert.match(menu,/id="gl"[^>]*>Gerar link público<\/button>/);
 assert.match(menu,/id="recorddone"[^>]*>Registrar serviço realizado<\/button>/);
 for(const id of ['gl','recorddone','na'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.doesNotMatch(agenda,/Ações da agenda/);
 assert.match(html,/\$\("na"\)\.onclick=openAppt/);
 assert.match(html,/\$\("gl"\)\.onclick=/);
 assert.match(html,/\$\("recorddone"\)\.onclick=openRealizedService/);
});

test('telas Mês, Dia, Lista, navegação de datas e calendário mantêm mesmos handlers',()=>{
 for(const [id,mode] of [['agendaViewMonth','month'],['agendaViewDay','day'],['agendaViewList','list']]){
  assert.match(agenda,new RegExp('id="'+id+'"'));
  assert.ok(html.includes('$("'+id+'").onclick=()=>setAgendaView("'+mode+'")'));
 }
 for(const id of ['date','agendaToday','monthcal','calgrid','agendaDayView','agendaListView','apps'])
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/id="date" type="date"/);
 assert.match(html,/\$\("agendaToday"\)\.onclick=/);
 assert.match(html,/function setAgendaView\(mode\)/);
 assert.match(html,/function loadMonthCalendar\(/);
 assert.match(html,/async function loadApps\(/);
 assert.match(html,/cancel_appointment_with_scope/);
 assert.match(html,/manager_month_counts/);
});

test('layout mobile tem controles compactos e alvos táteis de 44px',()=>{
 assert.match(agenda,/class="agenda-view-switch"/);
 assert.match(agenda,/class="agenda-date-picker"/);
 assert.doesNotMatch(agenda,/class="compact-tools"/);
 assert.match(css,/#age \.agenda-head-actions #na\{[^}]*min-height:44px/s);
 assert.match(css,/#age \.agenda-more-actions>summary\{[^}]*min-height:44px/s);
 assert.match(css,/#age \.agenda-view-switch button\{[^}]*min-height:44px/s);
 assert.match(css,/#age #agendaToday\{[^}]*min-height:44px/s);
 assert.match(css,/#age \.agenda-date-picker input\{[^}]*min-height:44px/s);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:350px\)/);
 assert.match(css,/#age \.agenda-more-panel\{[^}]*position:absolute/s);
});

test('mensagens da agenda vazia diferenciam dia sem registros e dia concluído ou cancelado',()=>{
 const start=html.indexOf('function agendaEmptyStateText(');
 const end=html.indexOf('async function loadApps(){',start);
 assert.ok(start>=0&&end>start);
 const get=vm.runInNewContext(html.slice(start,end)+'; agendaEmptyStateText;', {});
 assert.equal(get('2026-10-15',0,0),'Nenhum atendimento agendado para 15/10.');
 assert.equal(get('2026-10-15',1,0),'Nenhum atendimento pendente nesta data.');
 assert.equal(get('2026-10-15',0,1),'Nenhum atendimento pendente nesta data.');
 assert.equal(get('',0,0),'Nenhum atendimento para a data selecionada.');
 assert.match(html,/activeRows\.length\?activeRows\.map\(card\)\.join\(""\):'<div class="empty">'\+esc\(agendaEmptyStateText/);
 assert.match(html,/if\(completedRows\.length\)out\+=/);
 assert.match(html,/if\(cancelledRows\.length\)out\+=/);
});

test('menu recolhe após escolha, toque fora e Escape, preservando o handler principal',()=>{
 assert.match(nav,/const agendaExtra=document\.getElementById\('agenda-more-actions'\)/);
 assert.match(nav,/\.closest\('\.agenda-more-panel button'\)/);
 assert.match(nav,/event\.key==='Escape'/);
 assert.match(nav,/agendaExtra\.contains\(event\.target\)/);
 const events={};const listeners={};
 const menuMock={open:true,contains:()=>false,addEventListener:(name,cb)=>{listeners[name]=cb},querySelector:()=>({focus(){events.focus=true}})};
 const shell={};const settings={classList:{contains:()=>false},removeAttribute(){}};
 const primary={querySelectorAll:()=>[]};
 class Observer{constructor(cb){}observe(){}}
 vm.runInNewContext(nav,{document:{
  getElementById:k=>({'main-primary-nav':primary,'main-nav-shell':shell,'tset':settings,'agenda-more-actions':menuMock})[k]||null,
  addEventListener:(name,cb)=>{events[name]=cb}
 },MutationObserver:Observer});
 assert.equal(typeof listeners.click,'function');
 assert.equal(typeof events.pointerdown,'function');
 listeners.click({target:{closest:()=>({})}});
 assert.equal(menuMock.open,false);
 menuMock.open=true;
 listeners.keydown({key:'Escape'});
 assert.equal(menuMock.open,false);
 assert.equal(events.focus,true);
 menuMock.open=true;events.pointerdown({target:{}});
 assert.equal(menuMock.open,false);
});

test('financeiro, recibos e salvamento de agendamento não foram removidos',()=>{
 for(const id of ['fin','rcharge','rprint','apf','apdiscountvalue','rshare'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/\$\("apf"\)\.onsubmit=saveAppt/);
 assert.match(html,/\$\("rcharge"\)\.onclick=shareChargePix/);
 assert.match(html,/public\.|sb\.rpc\("cancel_appointment_with_scope"/);
});
