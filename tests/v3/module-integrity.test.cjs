'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const original=read('index.html');
const v3=read('v3/index.html');
const modules=["v3/scripts/bootstrap.js","v3/scripts/team.js","v3/scripts/clients-vehicles.js","v3/scripts/settings.js","v3/scripts/reports.js","v3/scripts/finance.js","v3/scripts/calendar.js","v3/scripts/appointments.js","v3/scripts/completion-receipts.js","v3/scripts/agenda-render.js"];
const styles=["v3/styles/foundation.css","v3/styles/operations.css","v3/styles/commerce.css"];
test('os módulos mantêm exatamente o script V2, sem alterar regras de negócio',()=>{
 const originals=[...original.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.equal(originals.length,6);
 const combined=modules.map(read).join('');
 const renderStart=combined.indexOf('function renderAgendaListHtml(');
 const renderEnd=combined.indexOf('\nasync function loadAgendaList()',renderStart);
 assert.ok(renderStart>=0&&renderEnd>renderStart,'Função mensal extraída deve existir');
 const extracted=combined.slice(renderStart,renderEnd);
 const body=extracted.slice(extracted.indexOf('{')+1,extracted.lastIndexOf('  return html;')).replace(/^\n/,'');
 const normalized=combined.slice(0,renderStart)+combined.slice(renderEnd+1);
 const call='  const html=renderAgendaListHtml(rows,cm,vm,sm,tm,com);\n';
 assert.ok(normalized.includes(call),'Chamada da renderização isolada deve existir');
 const reconstructed=normalized.replace(call,body).replace('const action=isToday&&x.status!=="completed"&&x.status!=="cancelled"','const action=isToday').replace('const rg=isToday&&x.status!=="cancelled"?','const rg=isToday?');
 assert.equal(reconstructed,originals[3][1]);
 for(const mod of modules)assert.ok(v3.includes('src="/'+mod+'?v=20261027-1"'));
 assert.equal(v3.includes('const SUPABASE_URL='),false);
});
test('CSS de base conserva a cascata da V2',()=>{
 const originalStyles=[...original.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)].map(x=>x[1]);
 assert.equal(styles.map(read).join('\n'),originalStyles.join('\n'));
 for(const style of styles)assert.ok(v3.includes('href="/'+style+'?v=20261027-1"'));
 assert.match(v3,/href="\/v3\/styles\/premium\.css\?v=20261027-1"/);
});
test('V3 é isolada e não exige fotografia na conclusão',()=>{
 assert.match(v3,/data-vaporeasy-version="v3"/);
 assert.match(v3,/href="\/v3\/manifest\.webmanifest\?v=1"/);
 assert.match(v3,/Vaporeasy V3/);
 assert.doesNotMatch(v3,/id="finishphoto"/);
 const conclusion=read('v3/scripts/completion-receipts.js');
 assert.match(conclusion,/async function openCompletion\(id\)/);
 assert.match(conclusion,/completionInFlight\.add\(id\)/);
 assert.match(conclusion,/operator_complete_job/);
});
test('scripts V3 estão na mesma ordem de execução',()=>{
 let previous=-1;
 for(const mod of modules){const next=v3.indexOf('src="/'+mod);assert.ok(next>previous);previous=next}
 assert.ok(v3.indexOf('src="/api/vendor?lib=supabase')<previous);
 assert.ok(v3.indexOf('src="/main-menu.js')>previous);
});
test('não aponta diretamente para produção por descuido',()=>{
 const bootstrap=read('v3/scripts/bootstrap.js');
 assert.match(bootstrap,/https:\/\/asuppjeomaymzromgcrp\.supabase\.co/);
 assert.doesNotMatch(bootstrap,/jiimrpulcfoccxizqbac|wwivmyhlwqyzmaexkmnk/);
});

test('colaborador não recebe ação de iniciar para serviço encerrado',()=>{
 const calendar=read('v3/scripts/calendar.js');
 assert.match(calendar,/const action=isToday&&x\.status!=="completed"&&x\.status!=="cancelled"/);
});

test('RG do colaborador não aparece para atendimento cancelado',()=>{
 const calendar=read('v3/scripts/calendar.js');
 assert.match(calendar,/const rg=isToday&&x\.status!=="cancelled"\?/);
});
