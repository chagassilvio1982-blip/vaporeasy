const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('settings-service-editor.css','utf8');
const first=html.indexOf('<dialog id="setserviced">');
const last=html.indexOf('</dialog>',first);
const form=html.slice(first,last+9);

test('editor conserva os mesmos campos, nomes e exatamente Salvar/Cancelar',()=>{
 const ids=['setservicef','setserviceid','setservicetitle','setservicemsg','setservicename','setservicecat',
 'setserviceduration','setservicesizepricing','setservicebasewrap','setserviceprice',
 'setservicesizeprices','setservicepricepm','setservicepriceg','setserviceadvanced',
 'setservicemode','setservicefirst','setserviceactive','setservicenotes'];
 for(const id of ids){
  assert.equal((form.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(form,/<button type="button" class="ghost" data-close>Cancelar<\/button>/);
 assert.match(form,/<button class="primary">Salvar serviço<\/button>/);
 assert.equal((form.match(/<button\b/g)||[]).length,2);
 assert.match(form,/<details id="setserviceadvanced" class="settings-service-advanced">/);
 assert.doesNotMatch(form,/<details id="setserviceadvanced"[^>]*\sopen/);
 assert.match(form,/<label id="setservicebasewrap">Preço base/);
 assert.match(form,/<div id="setservicesizeprices" class="row hidden">/);
});

test('preço base obrigatório apenas se preço por porte estiver desligado',()=>{
 const a=html.indexOf('function toggleServiceSizePricingFields(){');
 const b=html.indexOf('function openServiceSetting(',a);
 const els=new Map([
  ['setservicesizepricing',{checked:false}],
  ['setservicesizeprices',{classList:{toggle:(k,b)=>{els.get('setservicesizeprices').isHidden=b}}}],
  ['setservicebasewrap',{hidden:false}],
  ['setserviceprice',{required:true,value:'600'}],
  ['setservicepricepm',{required:false,value:'390'}],
  ['setservicepriceg',{required:false,value:'410'}]
 ]);
 const toggle=vm.runInNewContext(html.slice(a,b)+';toggleServiceSizePricingFields;',{$:id=>els.get(id)});
 toggle();
 assert.equal(els.get('setservicebasewrap').hidden,false);
 assert.equal(els.get('setserviceprice').required,true);
 assert.equal(els.get('setservicepricepm').required,false);
 assert.equal(els.get('setservicepriceg').required,false);
 assert.equal(els.get('setservicesizeprices').isHidden,true);
 els.get('setservicesizepricing').checked=true;
 toggle();
 assert.equal(els.get('setservicebasewrap').hidden,true);
 assert.equal(els.get('setserviceprice').required,false);
 assert.equal(els.get('setservicepricepm').required,true);
 assert.equal(els.get('setservicepriceg').required,true);
 assert.equal(els.get('setservicesizeprices').isHidden,false);
 els.get('setservicesizepricing').checked=false;
 toggle();
 assert.equal(els.get('setserviceprice').required,true);
 assert.equal(els.get('setservicebasewrap').hidden,false);
 assert.equal(els.get('setserviceprice').value,'600');
 assert.equal(els.get('setservicepricepm').value,'390');
 assert.equal(els.get('setservicepriceg').value,'410');
});

test('preço armazenado permanece o preço P/M quando há preço por porte',()=>{
 const saveStart=html.indexOf('async function saveServiceSetting(e){');
 const saveEnd=html.indexOf('function toggleAddonServiceScope()',saveStart);
 const save=html.slice(saveStart,saveEnd);
 assert.match(save,/price:sizePricing\?pricePm:price/);
 assert.match(save,/price_pm:sizePricing\?pricePm:null/);
 assert.match(save,/price_g:sizePricing\?priceG:null/);
 assert.match(save,/duration_minutes:Number\(\$\("setserviceduration"\)\.value\|\|0\)/);
 assert.match(save,/\.from\("services"\)\.update\(p\)/);
 assert.match(save,/\.from\("services"\)\.insert\(p\)/);
 assert.match(html,/\$\("setservicef"\)\.onsubmit=saveServiceSetting/);
 assert.match(html,/\$\("setservicesizepricing"\)\.onchange=toggleServiceSizePricingFields/);
});

test('edição reinicia aba avançada sem apagar nome, preço ou observações',()=>{
 const a=html.indexOf('function openServiceSetting(s=null){');
 const b=html.indexOf('async function saveServiceSetting(e){',a);
 const source=html.slice(a,b);
 assert.match(source,/\$\("setserviceadvanced"\)\.open=false/);
 for(const field of ['name','category','price','price_pm','price_g','duration_minutes','booking_mode','first_slot_time','active','notes']){
  assert.ok(source.includes('s?.'+field),field);
 }
 assert.match(source,/\$\("setserviced"\)\.showModal\(\)/);
 assert.doesNotMatch(source,/\.update\(|\.insert\(|\.delete\(/);
});

test('área Salvar/Cancelar acessível mesmo em formulários longos',()=>{
 assert.match(css,/#setserviced \.settings-service-footer\{[^}]*position:sticky/s);
 assert.match(css,/#setserviced \.settings-service-footer button\{[^}]*min-height:44px/s);
 assert.match(css,/#setserviced #setservicebasewrap\[hidden\]\{display:none!important\}/);
 assert.match(css,/#setserviced \.settings-service-advanced>summary\{[^}]*min-height:44px/s);
 assert.match(html,/<link rel="stylesheet" href="\/settings-service-editor\.css\?v=20261015-1">/);
});

test('outros formulários, Extras, Agenda e Financeiro não perdem identificadores',()=>{
 for(const id of ['setaddonf','setaddons','setschedulef','setpayf','apf','rcharge','paysubmit','setnewservice'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/function settingsServiceCard\(s\)/);
 assert.match(html,/function financePlanDisplayName\(name\)/);
});
