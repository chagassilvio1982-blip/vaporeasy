'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261015_rg_service_budget.sql'),'utf8');
const scripts=html.split('<script').slice(1).map(block=>block.slice(block.indexOf('>')+1).split('</script>')[0]).filter(Boolean);
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
  assert.match(main,/if\(!isQuote&&issue\.show_value&&currentRGQuotes\.has\(String\(issue\.id\)\)/);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/private\.current_app_role\(\) in \('owner','admin'\)/);
  assert.match(sql,/revoke all on table public\.vehicle_service_quotes from public, anon, authenticated/i);
  assert.doesNotMatch(sql,/grant [^;]* to anon/i);
});

test('Orçamento PDF é acessível em um botão próprio no RG',()=>{
  assert.match(html,/id="rgquote" type="button"/);
  assert.match(main,/\$\("rgquote"\)\.onclick=\(\)=>generateVehicleNeedsReport\("quote"\)/);
  assert.match(main,/const isQuote=kind==="quote"/);
  assert.match(main,/if\(isQuote&&!\["owner","admin"\]\.includes\(currentRole\)\)/);
});
test('Orçamento contém valores e total mesmo sem seleção do relatório técnico',()=>{
  const pdf=main.slice(main.indexOf('async function generateVehicleNeedsReport('),main.indexOf('function recurrenceLabel(',main.indexOf('async function generateVehicleNeedsReport(')));
  assert.match(pdf,/totalCents=isQuote\?selected\.reduce/);
  assert.match(pdf,/Orçamento de serviços/);
  assert.match(pdf,/if\(isQuote\)\{doc\.setFont\("helvetica","normal"\);doc\.setTextColor\(50,70,82\);doc\.setFontSize\(10\);doc\.text\("CNPJ: 31\.120\.467\/0001-07",margin,y\);y\+=7;\}/);
  assert.equal(pdf.match(/CNPJ: 31\.120\.467\/0001-07/g)?.length,1);
  assert.match(pdf,/VALOR TOTAL ORÇADO/);
  assert.equal(pdf.match(/VALOR TOTAL ORÇADO/g)?.length,1);
  assert.ok(pdf.indexOf("VALOR TOTAL ORÇADO")>pdf.indexOf("for(let n=0;n<selected.length;n++)"));
  assert.ok(pdf.indexOf("VALOR TOTAL ORÇADO")<pdf.indexOf("const foot="));
  assert.doesNotMatch(pdf,/doc\.text\("Valor orçado: "\+money\(/);
  assert.match(pdf,/if\(!isQuote&&issue\.show_value/);
  assert.match(pdf,/orcamento-vaporeasy-/);
  assert.match(pdf,/Este documento não constitui cobrança nem comprovante de pagamento/);
  assert.doesNotMatch(pdf,/\.from\(["'](?:appointment_payments|package_charges)["']\)/);
});

test('O orçamento utiliza o logotipo original do aplicativo, não um título textual',()=>{
  const pdf=main.slice(main.indexOf('async function generateVehicleNeedsReport('),main.indexOf('function recurrenceLabel(',main.indexOf('async function generateVehicleNeedsReport(')));
  assert.match(main,/const BRAND_LOGO="\/vaporeasy-logo-original\.svg\?v=20261006-01",brandLogoImg=new Image\(\);brandLogoImg\.src=BRAND_LOGO/);
  assert.ok(fs.existsSync(path.join(root,'vaporeasy-logo-original.svg')));
  const logo=fs.readFileSync(path.join(root,'vaporeasy-logo-original.svg'),'utf8');
  assert.match(logo,/<svg[^>]*viewBox="0 0 514 156"/);
  assert.match(pdf,/await brandLogoImg\.decode\(\)/);
  assert.match(pdf,/brandLogoImg\.naturalWidth\/brandLogoImg\.naturalWidth|brandLogoImg\.naturalHeight\/brandLogoImg\.naturalWidth/);
  assert.match(pdf,/logoCtx\.drawImage\(brandLogoImg,0,0,logoCanvas\.width,logoCanvas\.height\)/);
  assert.match(pdf,/doc\.addImage\(logoCanvas\.toDataURL\("image\/png"\),"PNG",margin,y,logoWidth,logoHeight\)/);
  assert.doesNotMatch(pdf,/doc\.text\("VAPOREASY",margin,y\)/);
  assert.ok(pdf.indexOf('doc.addImage(logoCanvas')<pdf.indexOf('CNPJ: 31.120.467/0001-07'));
  assert.match(pdf,/logotipo da Vaporeasy não carregou/i);
});
