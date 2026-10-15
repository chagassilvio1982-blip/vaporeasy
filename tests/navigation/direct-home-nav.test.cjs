const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const navScript=fs.readFileSync('main-menu.js','utf8');
const css=fs.readFileSync('main-menu.css','utf8');
const begin=html.indexOf('<section id="main"');
const end=html.indexOf('<div id="msg"',begin);
const shell=html.slice(begin,end);

test('áreas principais visíveis sem menu hambúrguer ou modal',()=>{
 assert.ok(begin>=0&&end>begin);
 assert.match(shell,/<nav id="main-primary-nav"[^>]*aria-label="Áreas principais"/);
 assert.doesNotMatch(shell,/main-menu-dialog|main-menu-toggle|main-menu-current|☰|<dialog/);
 for(const id of ['top','tc','ta','tf','tr','tset','out'])
  assert.equal((shell.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 for(const label of ['Cadastros','Agenda','Financeiro','Relatórios'])
  assert.match(shell,new RegExp('>[^<]*'+label+'<\\/button>'));
 assert.match(shell,/main-nav-utility/);
});

test('navegação reutiliza páginas e botões originais',()=>{
 for(const [id,section] of [['top','ops'],['tc','cad'],['ta','age'],['tf','fin'],['tr','rep'],['tset','set']]){
  assert.ok(html.includes('$("'+id+'").onclick=()=>tab("'+section+'")'),id);
  assert.ok(html.includes('$("'+section+'").classList.toggle("hidden",x!=="'+section+'")'),section);
 }
 assert.match(html,/if\(operator\)x="ops"/);
 assert.match(html,/if\(x==="set"&&currentRole!=="owner"\)/);
 assert.match(html,/id="na" class="primary section-primary"/);
 assert.match(html,/id="collabsbtn"/);
});

test('permissões existentes preservadas para proprietário, gerente e colaborador',()=>{
 for(const [id,condition] of [
  ['top','!operator'],['tc','operator'],['ta','operator'],
  ['tf','!manager'],['tr','!manager'],['tset','currentRole!=="owner"']
 ])assert.ok(html.includes('$("'+id+'").classList.toggle("hidden",'+condition+')'),id);
 assert.match(html,/\$\("main-primary-nav"\)\.dataset\.role=currentRole/);
 assert.match(css,/#main-primary-nav\[data-role="operator"\]/);
});

test('grade acessível e responsiva; nenhuma rolagem horizontal para o menu',()=>{
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(min-width:520px\)/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/min-height:50px/);
 assert.match(css,/focus-visible/);
 assert.match(css,/overflow:visible/);
 assert.ok(!css.includes('overflow-x:auto'));
});

test('seção ativa recebe aria-current e outra perde o indicador',()=>{
 const callbacks=[];
 function button(active=false,hidden=false){
  const classes=new Set([...(active?['active']:[]),...(hidden?['hidden']:[])]);
  const attrs=new Map();
  return {
   classList:{contains:k=>classes.has(k),toggle:(k,v)=>v?classes.add(k):classes.delete(k)},
   setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),
   getAttribute:k=>attrs.get(k)
  };
 }
 const a=button(true),b=button(),settings=button(false,true);
 const elements={'main-primary-nav':{querySelectorAll:()=>[a,b]},'main-nav-shell':{},'tset':settings};
 class MockObserver{
  constructor(cb){callbacks.push(cb)}
  observe(){}
 }
 vm.runInNewContext(navScript,{document:{getElementById:id=>elements[id]},MutationObserver:MockObserver});
 assert.equal(a.getAttribute('aria-current'),'page');
 assert.equal(b.getAttribute('aria-current'),undefined);
 assert.equal(callbacks.length,1);
 a.classList.toggle('active',false);
 b.classList.toggle('active',true);
 callbacks[0]();
 assert.equal(a.getAttribute('aria-current'),undefined);
 assert.equal(b.getAttribute('aria-current'),'page');
 b.classList.toggle('hidden',true);
 callbacks[0]();
 assert.equal(b.getAttribute('aria-current'),undefined);
});

test('indicador de água fica recolhido e conserva os IDs originais de leitura',()=>{
 const start=html.indexOf('<details id="watercard"');
 const end=html.indexOf('<section id="ops"',start);
 assert.ok(start>0&&end>start);
 const water=html.slice(start,end);
 assert.match(water,/<details id="watercard" class="water-compact">/);
 assert.doesNotMatch(water,/<details[^>]*\sopen(?:\s|>|=)/);
 assert.match(water,/<summary>/);
 assert.match(water,/id="watertotal"/);
 assert.match(water,/id="waterdetail"/);
 assert.equal((html.match(/id="watertotal"/g)||[]).length,1);
 assert.equal((html.match(/id="waterdetail"/g)||[]).length,1);
 assert.match(css,/#watercard\.water-compact>summary/);
 assert.match(css,/#watercard\.water-compact #waterdetail/);
 assert.match(html,/\$\("watertotal"\)\.textContent=/);
 assert.match(html,/\$\("waterdetail"\)\.textContent=/);
});

test('ações secundárias ficam dentro de Cadastros, sem segunda faixa abaixo da busca',()=>{
 const start=html.indexOf('<section id="cad"');
 const end=html.indexOf('<section id="age"',start);
 assert.ok(start>0&&end>start);
 const cad=html.slice(start,end);
 assert.match(cad,/<details id="cad-more-actions" class="cad-more-actions">/);
 assert.match(cad,/<summary aria-label="Mais opções de cadastro"/);
 assert.doesNotMatch(cad,/<details[^>]*\sopen(?:\s|>|=)/);
 assert.match(cad,/<button id="nc" class="primary section-primary">/);
 for(const id of ['importcontacts','collabsbtn','teamsbtn','rc']){
  assert.equal((cad.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  assert.ok(cad.indexOf('id="'+id+'"')<cad.indexOf('id="q"'),id+' must remain within cadastro header overflow');
 }
 assert.match(cad,/id="q" class="section-search"/);
 assert.doesNotMatch(cad,/Ações de cadastro/);
 assert.ok(!cad.includes('<details class="section-tools">'));
 assert.match(css,/#cad \.cad-more-panel/);
 assert.match(navScript,/event\.target\.closest\('\.tool-grid button'\)/);
 assert.match(navScript,/event\.key==='Escape'/);
 assert.match(navScript,/event\.type|pointerdown/);
});

test('não alteramos conteúdo de cobrança/recibo ou formulário da agenda',()=>{
 assert.match(html,/<dialog id="rd">/);
 assert.match(html,/<button id="rprint"/);
 assert.match(html,/<button id="na" class="primary section-primary">\+ Agendamento<\/button>/);
 assert.match(html,/id="rcharge"/);
});
