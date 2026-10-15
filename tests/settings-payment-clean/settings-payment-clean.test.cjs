const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('settings-payment-clean.css','utf8');
const a=html.indexOf('<form id="setpayf"');
const b=html.indexOf('</form>',a);
assert.ok(a>=0&&b>a);
const form=html.slice(a,b+7);

test('configurações bancárias conservam IDs, tipos e botão Salvar originais',()=>{
 for(const id of ['setpayf','setbiz','setholder','setbank','setbranch','setaccount','setpix','setpixtype','setfooter','setpayadvanced']){
  assert.equal((form.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(form,/<input id="setholder" required>/);
 assert.match(form,/<button class="primary settings-payment-save">Salvar dados de pagamento<\/button>/);
 assert.equal((form.match(/<button\b/g)||[]).length,1);
 assert.match(html,/\$\("setpayf"\)\.onsubmit=savePaymentSettings/);
});

test('identificação, favorecido, banco e chave Pix ficam sempre visíveis',()=>{
 const advanced=form.indexOf('<details id="setpayadvanced"');
 const visible=form.slice(0,advanced);
 assert.ok(advanced>0);
 for(const id of ['setbiz','setholder','setbank','setpixtype','setpix']){
  assert.match(visible,new RegExp('id="'+id+'"'),id);
 }
 assert.match(visible,/settings-payment-bank-row/);
 assert.match(form,/CNPJ, CPF, e-mail/);
});

test('agência, conta e rodapé continuam editáveis no grupo avançado recolhido',()=>{
 const from=form.indexOf('<details id="setpayadvanced"');
 const to=form.indexOf('</details>',from);
 assert.ok(from>0&&to>from);
 const header=form.slice(from,form.indexOf('>',from)+1);
 const advanced=form.slice(from,to);
 assert.doesNotMatch(header,/\bopen\b/);
 for(const id of ['setbranch','setaccount','setfooter']){
  assert.match(advanced,new RegExp('id="'+id+'"'),id);
 }
 assert.match(advanced,/Configurações avançadas/);
 assert.match(advanced,/settings-payment-account-row/);
 assert.match(advanced,/<textarea id="setfooter"><\/textarea>/);
});

test('salvamento mantém contrato exato e favorecido obrigatório',()=>{
 const p=html.indexOf('async function savePaymentSettings(e){');
 const q=html.indexOf('let currentManagementReport=null;',p);
 assert.ok(p>=0&&q>p);
 const s=html.slice(p,q);
 for(const fragment of [
 'currentRole!=="owner"',
 'business_name:$("setbiz").value.trim()||"Vaporeasy"',
 'account_holder:$("setholder").value.trim()',
 'bank_name:$("setbank").value.trim()',
 'branch:$("setbranch").value.trim()',
 'account_number:$("setaccount").value.trim()',
 'pix_key:$("setpix").value.trim()',
 'pix_key_type:$("setpixtype").value.trim()',
 'receipt_footer:$("setfooter").value.trim()',
 'if(!p.account_holder)',
 '.from("business_payment_settings").update(p).eq("id",1)'
 ])assert.ok(s.includes(fragment),fragment);
 assert.doesNotMatch(s,/setpayadvanced|\.insert\(|\.delete\(|confirm_payment/);
});

test('CSS mantém controles legíveis no mobile sem ocultar campos principais',()=>{
 assert.match(css,/#set #setpayf \.settings-payment-bank-row,[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/#set #setpayf \.settings-payment-advanced>summary\{[^}]*min-height:44px/s);
 assert.match(css,/#set #setpayf \.settings-payment-save\{[^}]*min-height:44px/s);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(html,/<link rel="stylesheet" href="\/settings-payment-clean\.css\?v=20261015-1">/);
});

test('demais áreas, recibos e operações financeiras preservados',()=>{
 for(const id of ['setservices','setaddons','setschedulef','setservicef','setaddonf','rsummary','fsummary','apf','payf']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(html,/function settingsScheduleWeekRow\(w\)/);
 assert.match(html,/function settingsAddonCard\(a\)/);
 assert.match(html,/confirm_payment_with_discount/);
 assert.match(html,/generateMonthlyFinanceReportPdf/);
 assert.match(html,/function receiptHtml\(d\)/);
});
