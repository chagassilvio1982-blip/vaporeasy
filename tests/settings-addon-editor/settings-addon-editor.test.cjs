const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('settings-addon-editor.css','utf8');
const a=html.indexOf('<dialog id="setaddond">');
const b=html.indexOf('</dialog>',a);
assert.ok(a>=0&&b>a,'Extra editor dialog is present');
const form=html.slice(a,b+9);

test('formulário mantém campos existentes e apenas Salvar/Cancelar',()=>{
 const ids=['setaddonf','setaddonid','setaddontitle','setaddonmsg','setaddonname','setaddondesc',
  'setaddonprice','setaddonduration','setaddonsort','setaddonactive','setaddonpublic',
  'setaddonadvanced','setaddonall','setaddonserviceswrap','setaddonservices'];
 for(const id of ids)assert.equal((form.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(form,/<button type="button" class="ghost" data-close>Cancelar<\/button>/);
 assert.match(form,/<button class="primary">Salvar extra<\/button>/);
 assert.equal((form.match(/<button\b/g)||[]).length,2);
});

test('nome/preço/tempo/status ficam no corpo e descrição/compatibilidade recolhidas',()=>{
 const advancedStart=form.indexOf('<details id="setaddonadvanced"');
 const advancedEnd=form.indexOf('</details>',advancedStart);
 assert.ok(advancedStart>0&&advancedEnd>advancedStart);
 const primary=form.slice(0,advancedStart);
 const secondary=form.slice(advancedStart,advancedEnd);
 for(const id of ['setaddonname','setaddonprice','setaddonduration','setaddonactive','setaddonpublic'])
  assert.match(primary,new RegExp('id="'+id+'"'),id);
 for(const id of ['setaddondesc','setaddonsort','setaddonall','setaddonserviceswrap','setaddonservices'])
  assert.match(secondary,new RegExp('id="'+id+'"'),id);
 assert.doesNotMatch(form.slice(advancedStart,advancedStart+100),/\bopen\b/);
 assert.match(form,/Configurações avançadas/);
});

test('compatibilidade original habilita seletor apenas quando Todos é desmarcado',()=>{
 const i=html.indexOf('function toggleAddonServiceScope(){');
 const j=html.indexOf('function openAddonSetting(a=null){',i);
 assert.ok(i>=0&&j>i);
 let hidden=false;
 const lookup={
  setaddonall:{checked:true},
  setaddonserviceswrap:{classList:{toggle:(name,state)=>{
   assert.equal(name,'hidden');hidden=state;
  }}}
 };
 const toggle=vm.runInNewContext(html.slice(i,j)+';toggleAddonServiceScope;',{$:id=>lookup[id]});
 toggle();assert.equal(hidden,true);
 lookup.setaddonall.checked=false;
 toggle();assert.equal(hidden,false);
});

test('abrir edição apenas recolhe avançadas e preserva preenchimento existente',()=>{
 const i=html.indexOf('function openAddonSetting(a=null){');
 const j=html.indexOf('async function saveAddonSetting(e){',i);
 const source=html.slice(i,j);
 assert.match(source,/\$\("setaddonf"\)\.reset\(\);\$\("setaddonadvanced"\)\.open=false/);
 for(const field of ['name','description','price','duration_minutes','sort_order','active','public_enabled']){
  assert.ok(source.includes('a?.'+field)||source.includes('a?!!a.'+field),field);
 }
 assert.match(source,/settingAddonCompat\.filter\(x=>x\.addon_id===a\.id\)/);
 assert.match(source,/\$\("setaddonservices"\)\.innerHTML=settingServices\.map/);
 assert.match(source,/toggleAddonServiceScope\(\);\$\("setaddond"\)\.showModal\(\)/);
 assert.doesNotMatch(source,/\.insert\(|\.update\(|\.delete\(/);
});

test('Salvar preserva consulta e gravação, abre avançadas se faltar compatibilidade',()=>{
 const i=html.indexOf('async function saveAddonSetting(e){');
 const j=html.indexOf('async function saveScheduleSettings(e){',i);
 const source=html.slice(i,j);
 for(const text of [
 'price:Number($("setaddonprice").value||0)',
 'duration_minutes:Number($("setaddonduration").value||0)',
 'active:$("setaddonactive").checked',
 'public_enabled:$("setaddonpublic").checked',
 'sort_order:Number($("setaddonsort").value||0)',
 '$("setaddonall").checked',
 '.from("service_addons").update(p)',
 '.from("service_addons").insert(p)',
 '.from("service_addon_compatibility").delete()',
 '.from("service_addon_compatibility").insert('
 ])assert.ok(source.includes(text),text);
 assert.match(source,/if\(!all&&!selected\.length\)\{\s*\$\("setaddonadvanced"\)\.open=true;/);
 assert.match(source,/return show\("setaddonmsg","Selecione pelo menos um serviço compatível ou marque todos os serviços\.","error"\)/);
 assert.match(html,/\$\("setaddonf"\)\.onsubmit=saveAddonSetting/);
 assert.match(html,/\$\("setaddonall"\)\.onchange=toggleAddonServiceScope/);
});

test('layout mobile mantém edição acessível e outras áreas intactas',()=>{
 assert.match(css,/#setaddond \.settings-addon-pricing\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);
 assert.match(css,/#setaddond \.settings-addon-advanced>summary\{[^}]*min-height:44px/s);
 assert.match(css,/#setaddond \.settings-addon-footer\{[^}]*position:sticky/s);
 assert.match(css,/#setaddond \.settings-addon-footer button\{[^}]*min-height:44px/s);
 assert.match(html,/<link rel="stylesheet" href="\/settings-addon-editor\.css\?v=20261015-1">/);
 for(const id of ['setservicef','setservices','setaddons','setschedulef','setpayf','apf','payf'])
  assert.ok(html.includes('id="'+id+'"'),id);
});
