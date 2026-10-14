const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeSearch,matchesSearch}=require('../../agenda-quick-search.js');
test('busca aceita acentos, maiúsculas e espaços',()=>{
  assert.equal(normalizeSearch('  CÉSAR  NEGRÃO  '),'cesar negrao');
  assert.ok(matchesSearch('Cézar Negrão','cezar'));
  assert.ok(matchesSearch('Renato Santana','SANTANA'));
});
test('busca reconhece placa com ou sem hífen',()=>{
  assert.ok(matchesSearch('Toyota Corolla • ABC-1D23','abc1d23'));
  assert.ok(matchesSearch('Toyota Corolla • ABC1D23','ABC-1D23'));
});
test('não produz falsos positivos por consulta vazia ou pontuação',()=>{
  assert.ok(matchesSearch('BMW X5',''));
  assert.equal(matchesSearch('BMW X5','zzzzz'),false);
  assert.equal(matchesSearch('BMW X5','---'),false);
});
test('integração é somente leitura e acionada na lista do mês',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../agenda-quick-search.js'),'utf8');
  const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  assert.match(html,/id="agendaQuickSearch"/);
  assert.match(html,/id="agendaToday"/);
  assert.match(html,/agenda-quick-search\.js/);
  assert.match(html,/setAgendaView\("day"\)/);
  assert.match(src,/new MutationObserver\(apply\)/);
  assert.doesNotMatch(src,/\bsb\.(?:from|rpc)\(/);
});

test('filtro mensal oculta cartões sem correspondência e reavalia após recarregar',()=>{
  const modulePath=require.resolve('../../agenda-quick-search.js');
  const mkClassList=()=>{const classes=new Set();return {toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name)}};
  const node=(kind,text)=>({textContent:text,classList:mkClassList(),matches:selector=>
    selector==='.list-caption'?kind==='heading':selector==='[data-agenda-list-day]'&&kind==='appointment'});
  const day1=node('heading','Quarta-feira');
  const a=node('appointment','09:00 Cézar Negrão Toyota • ABC-1D23');
  const b=node('appointment','11:00 Marcelo Honda • XYZ9876');
  const day2=node('heading','Quinta-feira');
  const c=node('appointment','08:00 Joana BMW • GHI1234');
  const list={children:[day1,a,b,day2,c],dataset:{}};
  const input={value:'',addEventListener:(event,callback)=>{input.onInput=callback}};
  const status={textContent:''};
  const nodes={agendaListItems:list,agendaQuickSearch:input,agendaQuickSearchStatus:status};
  global.document={readyState:'complete',getElementById:id=>nodes[id]};
  global.MutationObserver=class {constructor(cb){this.cb=cb;global.__agendaObserver=this}observe(){}};
  try{
    delete require.cache[modulePath];
    require(modulePath);
    input.value='abc1d23';
    input.onInput();
    assert.equal(a.classList.contains('hidden'),false);
    assert.equal(b.classList.contains('hidden'),true);
    assert.equal(c.classList.contains('hidden'),true);
    assert.equal(day1.classList.contains('hidden'),false);
    assert.equal(day2.classList.contains('hidden'),true);
    assert.match(status.textContent,/1 de 3/);
    input.value='';
    input.onInput();
    assert.equal(c.classList.contains('hidden'),false);
    const d=node('appointment','12:00 Cézar Mercedes • ABC1D23');
    list.children=[day1,a,b,day2,c,d];
    input.value='ABC-1D23';
    global.__agendaObserver.cb();
    assert.match(status.textContent,/2 de 4/);
  }finally{
    delete global.document;
    delete global.MutationObserver;
    delete global.__agendaObserver;
    delete require.cache[modulePath];
  }
});
