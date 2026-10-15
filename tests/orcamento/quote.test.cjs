'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261015_rg_service_budget.sql'),'utf8');
const scripts=[...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)].map(m=>m[1]).filter(Boolean);
const main=scripts.find(s=>s.includes('const SUPABASE_URL='));

test('V2: JavaScript inline principal tem sintaxe valida',()=>{
  assert.ok(main,'script principal indisponivel');
  assert.doesNotThrow(()=>new vm.Script(main,{filename:'index.inline.js'}));
});
test('Campo de orcamento integrado no RG ja existente',()=>{
  assert.match(html,/id="rgibudget" type="number" min="0"/);
  assert.match(html,/id="rgishowvalue"/);
  assert.match(main,/async function saveRGIssue\(e\)/);
  assert.match(main,/currentRGQuotes\.set\(String\(id\),amount\)/);
  assert.match(main,/select\("issue_id,amount"\)\.eq\("vehicle_id",v\.id\)/);
});
test('Orcamento nao cria agendamento ou cobranca',()=>{
  const save=main.slice(main.indexOf('async function saveRGIssue(e)'),main.indexOf('function captureRGIssuePhoto'));
  assert.ok(save.includes('.from("vehicle_service_quotes").upsert('));
  assert.doesNotMatch(save,/(?:from\(["'](?:appointments|appointment_payments|package_charges)["']\)|rpc\(["'](?:confirm_payment|sync_recurring))/);
});
test('Valores nao aparecem a colaboradores e PDF depende de autorizacao',()=>{
  assert.match(main,/\$\("rgibudget"\),\$\("rgiinclude"\)/);
  assert.match(main,/if\(\["owner","admin"\]\.includes\(currentRole\)\)\{/);
  assert.match(main,/if\(issue\.show_value&&currentRGQuotes\.has\(String\(issue\.id\)\)/);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/private\.current_app_role\(\) in \('owner','admin'\)/);
  assert.match(sql,/revoke all on table public\.vehicle_service_quotes from public, anon, authenticated/i);
  assert.doesNotMatch(sql,/grant [^;]* to anon/i);
});
