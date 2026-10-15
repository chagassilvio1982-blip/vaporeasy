const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('settings-addons-clean.css','utf8');
const a=html.indexOf('function settingsAddonCard(a){');
const b=html.indexOf('function renderOperationalSettings(){',a);
assert.ok(a>=0&&b>a);
const source=html.slice(a,b);
const {settingsAddonCard}=vm.runInNewContext(source+';({settingsAddonCard})',{
 esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
 money:n=>'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})
});

test('extra ativo e público preserva preço, duração e identificador de edição',()=>{
 const addon={id:'a1',name:'Cera extra',price:15,duration_minutes:10,active:true,public_enabled:true};
 const before=JSON.stringify(addon),card=settingsAddonCard(addon);
 assert.match(card,/>Cera extra<\/b>/);
 assert.match(card,/R\$ 15,00 • 10 min/);
 assert.match(card,/is-active">Ativo/);
 assert.match(card,/is-public">Público/);
 assert.match(card,/data-set-addon="a1">Editar<\/button>/);
 assert.equal(JSON.stringify(addon),before);
});

test('extra inativo e interno aparece corretamente sem modificar compatibilidade',()=>{
 const card=settingsAddonCard({id:'inativo',name:'Limpeza profunda',price:200,duration_minutes:50,active:false,public_enabled:false});
 assert.match(card,/R\$ 200,00 • 50 min/);
 assert.match(card,/is-inactive">Inativo/);
 assert.match(card,/is-internal">Somente interno/);
 assert.doesNotMatch(card,/is-public">Público/);
 assert.match(card,/data-set-addon="inativo"/);
 assert.doesNotMatch(source,/service_addon_compatibility|\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});

test('títulos longos e caracteres especiais não alteram estrutura',()=>{
 const card=settingsAddonCard({id:'x"1',name:'Hidratação dos bancos <couro>',price:350,duration_minutes:90,active:true,public_enabled:true});
 assert.match(card,/Hidratação dos bancos &lt;couro>/);
 assert.match(card,/data-set-addon="x&quot;1"/);
 assert.match(card,/R\$ 350,00 • 90 min/);
 assert.match(css,/overflow-wrap:anywhere/);
});

test('a tela preserva Novo extra e os handlers originais',()=>{
 const start=html.indexOf('<section id="set"');
 const end=html.indexOf('</section>',start);
 const settings=html.slice(start,end);
 for(const id of ['setnewaddon','setaddons','setservices','setschedulef','setpayf','setaddonf','setaddond']){
  if(id==='setaddonf'||id==='setaddond')continue;
  assert.equal((settings.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/\$\("setaddons"\)\.innerHTML=settingAddons\.length\?settingAddons\.map\(settingsAddonCard\)/);
 assert.match(html,/\$\("setaddons"\)\.querySelectorAll\("\[data-set-addon\]"\)\.forEach\(b=>b\.onclick=\(\)=>openAddonSetting\(settingAddons\.find\(x=>x\.id===b\.dataset\.setAddon\)\)\)/);
 assert.match(html,/function openAddonSetting\(a=null\)/);
 assert.match(html,/async function saveAddonSetting\(e\)/);
 assert.match(html,/\$\("setaddonf"\)\.onsubmit=saveAddonSetting/);
});

test('preços, visibilidade e relações com serviços mantêm persistência preexistente',()=>{
 const open=html.slice(html.indexOf('function openAddonSetting(a=null){'),html.indexOf('async function saveAddonSetting(e){'));
 const save=html.slice(html.indexOf('async function saveAddonSetting(e){'),html.indexOf('async function saveScheduleSettings(e){'));
 assert.match(open,/\$\("setaddonprice"\)\.value=a\?\.price\?\?""/);
 assert.match(open,/\$\("setaddonpublic"\)\.checked=a\?!!a\.public_enabled:false/);
 assert.match(save,/price:Number\(\$\("setaddonprice"\)\.value\|\|0\)/);
 assert.match(save,/duration_minutes:Number\(\$\("setaddonduration"\)\.value\|\|0\)/);
 assert.match(save,/public_enabled:\$\("setaddonpublic"\)\.checked/);
 assert.match(save,/\.from\("service_addons"\)\.update\(p\)/);
 assert.match(save,/\.from\("service_addons"\)\.insert\(p\)/);
 assert.match(save,/\.from\("service_addon_compatibility"\)\.delete\(\)/);
 assert.match(save,/\.from\("service_addon_compatibility"\)\.insert\(/);
 assert.match(html,/<link rel="stylesheet" href="\/settings-addons-clean\.css\?v=20261015-1">/);
});

test('visual mobile compacto preserva zona de toque em Editar',()=>{
 assert.match(css,/#set #setaddons \.setting-addon-edit\{[^}]*min-width:70px;[^}]*max-width:83px;[^}]*min-height:44px;/s);
 assert.match(css,/#set #setaddons \.setting-addon-card-main\{[^}]*grid-template-columns:minmax\(0,1fr\) auto;/s);
 assert.match(css,/@media\(max-width:350px\)/);
 assert.match(css,/#set #setaddons \.setting-addon-badges\{/);
 assert.match(css,/#set #setaddons \.setting-addon-status\.is-inactive/);
 assert.match(css,/#set #setaddons \.setting-addon-status\.is-internal/);
});
