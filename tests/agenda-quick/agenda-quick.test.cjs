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
