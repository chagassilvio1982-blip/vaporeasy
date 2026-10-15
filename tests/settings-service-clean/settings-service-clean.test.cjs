const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('settings-service-clean.css','utf8');
const a=html.indexOf('function settingsServiceDisplayName(name){');
const b=html.indexOf('function renderOperationalSettings(){',a);
assert.ok(a>=0&&b>a);
const fragment=html.slice(a,b);
const helpers={
 esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
 money:n=>'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),
 durationLabel:m=>String(m)+' min'
};
const {settingsServiceCard,settingsServiceDisplayName}=vm.runInNewContext(
 fragment+';({settingsServiceCard,settingsServiceDisplayName})',helpers);

test('cartões compactos mostram nomes Plano sem alterar dados cadastrados',()=>{
 const service={id:'s1',name:'Pacote Premium',price:390,price_pm:390,price_g:410,
  size_pricing_enabled:true,duration_minutes:90,booking_mode:'auto',active:true};
 const initial=JSON.stringify(service);
 const card=settingsServiceCard(service);
 assert.equal(settingsServiceDisplayName('Pacote Plus'),'Plano Plus');
 assert.equal(settingsServiceDisplayName('Pacote Essencial'),'Plano Essencial');
 assert.equal(settingsServiceDisplayName('Pacote Premium'),'Plano Premium');
 assert.equal(settingsServiceDisplayName('Polimento técnico'),'Polimento técnico');
 assert.match(card,/>Plano Premium<\/b>/);
 assert.doesNotMatch(card,/Pacote Premium/);
 assert.equal(JSON.stringify(service),initial,'renderer must not mutate service rows');
});

test('render preserva precisamente preços distintos, duração e o modo de agendamento',()=>{
 const data={id:'s2',name:'Pacote Premium',price:390,price_pm:390,price_g:410,
   size_pricing_enabled:true,duration_minutes:90,booking_mode:'request',
   first_slot_time:'07:40:00',active:true};
 const card=settingsServiceCard(data);
 assert.match(card,/P\/M R\$ 390,00 • G R\$ 410,00/);
 assert.match(card,/90 min/);
 assert.match(card,/Confirmação manual • início 07:40/);
 assert.match(card,/data-set-service="s2"/);
 assert.match(card,/>Editar<\/button>/);
 assert.doesNotMatch(card,/R\$ 420,00/);
 const single=settingsServiceCard({id:'s3',name:'Enceramento técnico',price:600,
   size_pricing_enabled:false,duration_minutes:240,booking_mode:'auto',active:false});
 assert.match(single,/R\$ 600,00 • 240 min/);
 assert.match(single,/Automático/);
 assert.match(single,/is-inactive">Inativo/);
});

test('a alteração restringe-se à lista de Serviços sem afetar Extras ou formulários',()=>{
 const start=html.indexOf('<section id="set"');
 const end=html.indexOf('</section>',start);
 const settings=html.slice(start,end);
 for(const id of ['setnewservice','setservices','setaddons','setnewaddon','setschedulef','setpayf']){
  assert.equal((settings.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/\$\("setservices"\)\.innerHTML=settingServices\.length\?settingServices\.map\(settingsServiceCard\)/);
 assert.match(html,/\$\("setservices"\)\.querySelectorAll\("\[data-set-service\]"\)\.forEach\(b=>b\.onclick=\(\)=>openServiceSetting\(settingServices\.find\(x=>x\.id===b\.dataset\.setService\)\)\)/);
 assert.match(html,/\$\("setaddons"\)\.innerHTML=settingAddons\.length\?settingAddons\.map/);
 assert.match(html,/function openServiceSetting\(s=null\)/);
 assert.match(html,/async function saveServiceSetting\(e\)/);
 assert.match(html,/id="setservicepricepm"/);
 assert.match(html,/id="setservicepriceg"/);
 assert.match(html,/id="setserviceduration"/);
 assert.match(html,/id="setservicemode"/);
 assert.match(html,/id="setserviceactive"/);
});

test('cartões acessíveis no mobile mantêm botão Editar de 44px e largura limitada',()=>{
 assert.match(css,/#set #setservices \.setting-service-edit\{[^}]*min-width:70px;[^}]*max-width:83px;[^}]*min-height:44px;/s);
 assert.match(css,/#set #setservices \.setting-service-card-main\{[^}]*grid-template-columns:minmax\(0,1fr\) auto;/s);
 assert.match(css,/@media\(max-width:350px\)/);
 assert.match(css,/#set #setservices \.setting-service-status\.is-inactive/);
 assert.match(html,/<link rel="stylesheet" href="\/settings-service-clean\.css\?v=20261015-1">/);
});

test('não cria operações de banco ou altera regras de agenda na seção renderizada',()=>{
 assert.doesNotMatch(fragment,/sb\.|supabase|\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
 assert.match(html,/async function loadOperationalSettings\(\)/);
 assert.match(html,/async function saveScheduleSettings\(/);
 assert.match(html,/function settingsServiceDisplayName/);
 assert.match(html,/const price=s.size_pricing_enabled/);
});
