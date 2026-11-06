// Caracterização do código disponível; não comprova o estado do banco remoto.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('vaporeasy_recorrencia_veiculo.js','utf8');
const fn=source.slice(source.indexOf('  function monthlyOccurrence('),source.indexOf('  function recurrenceDates('));
const ctx={};vm.runInNewContext(fn,ctx);
const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
test('algoritmo legado preserva quinta e ordinal: 01/10 -> 05/11',()=>{assert.equal(iso(ctx.monthlyOccurrence(new Date(2026,9,1,12),1)),'2026-11-05')});
test('quinta ocorrência usa última quinta quando novembro só tem quatro',()=>{assert.equal(iso(ctx.monthlyOccurrence(new Date(2026,9,29,12),1)),'2026-11-26')});
test('todas as quintas de outubro continuam quintas no algoritmo legado',()=>{for(const day of [1,8,15,22,29])assert.equal(ctx.monthlyOccurrence(new Date(2026,9,day,12),1).getDay(),4)});
test('somar mês mantendo número do dia leva quinta de outubro a domingo',()=>{for(const day of [1,8,15,22,29]){assert.equal(new Date(2026,9,day,12).getDay(),4);assert.equal(new Date(2026,10,day,12).getDay(),0)}});
test('caracterização: SQL disponível soma meses e RG redefine início',()=>{const sql=fs.readFileSync('supabase/migrations/20261005145500_fix_scheduled_downgrade_plan_materialization.sql','utf8'),html=fs.readFileSync('index.html','utf8');assert(sql.includes('d:=(p.start_date+make_interval(months=>n))::date;'));assert(html.includes('weekday,local_time:time,start_date:today()'));});
