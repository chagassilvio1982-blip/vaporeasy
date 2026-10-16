const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('settings-schedule-clean.css','utf8');
const a=html.indexOf('function settingsScheduleWeekRow(w){');
const b=html.indexOf('function renderOperationalSettings(){',a);
assert.ok(a>=0&&b>a);
const functionCode=html.slice(a,b);
const names=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const render=vm.runInNewContext(functionCode+';settingsScheduleWeekRow;',{
 WEEK_NAMES:names,
 esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')
});

test('expediente, intervalo, mesmo dia e botão salvar mantêm os IDs originais',()=>{
 const i=html.indexOf('<form id="setschedulef"');
 const j=html.indexOf('</form>',i);
 assert.ok(i>=0&&j>i);
 const form=html.slice(i,j);
 for(const id of ['setschedulef','setstart','setend','setinterval','setsameday','setweek']){
  assert.equal((form.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(form,/<input id="setstart" type="time" required>/);
 assert.match(form,/<input id="setend" type="time" required>/);
 assert.match(form,/<input id="setinterval" type="number" min="5" step="5" required>/);
 assert.match(form,/<input id="setsameday" type="checkbox">/);
 assert.match(form,/<button class="primary settings-schedule-save">Salvar horários e dias<\/button>/);
 assert.match(form,/Dias de atendimento/);
 assert.match(form,/Máx\. equipes/);
 assert.match(form,/não o número de carros/);
 assert.equal((form.match(/<button\b/g)||[]).length,1);
});

test('cada dia conserva checkbox e campo numérico para os mesmos seletores de gravação',()=>{
 const sunday=render({weekday:0,enabled:false,max_teams:0});
 const monday=render({weekday:1,enabled:true,max_teams:2});
 const saturday=render({weekday:6,enabled:true,max_teams:1});
 assert.match(sunday,/data-week-enabled="0"/);
 assert.doesNotMatch(sunday,/data-week-enabled="0" checked/);
 assert.match(sunday,/data-week-max="0" value="0"/);
 assert.match(sunday,/>Domingo<\/span>/);
 assert.match(monday,/data-week-enabled="1" checked/);
 assert.match(monday,/data-week-max="1" value="2"/);
 assert.match(monday,/>Segunda<\/span>/);
 assert.match(saturday,/data-week-enabled="6" checked/);
 assert.match(saturday,/data-week-max="6" value="1"/);
 assert.match(saturday,/>Sábado<\/span>/);
 assert.match(monday,/type="number" min="0" step="1"/);
});

test('sete dias preservam suas posições e não modificam valores de origem',()=>{
 const data=names.map((name,weekday)=>({
  weekday,enabled:weekday>0,max_teams:weekday===0?0:weekday===6?1:2
 }));
 const before=JSON.stringify(data);
 const rows=data.map(render);
 assert.equal(rows.length,7);
 assert.equal(JSON.stringify(data),before);
 for(let day=0;day<7;day++){
  assert.match(rows[day],new RegExp('data-week-enabled="'+day+'"'));
  assert.match(rows[day],new RegExp('data-week-max="'+day+'"'));
  assert.match(rows[day],new RegExp('Máximo de equipes em '+names[day]));
 }
 assert.match(html,/\$\("setweek"\)\.innerHTML=settingWeek\.map\(settingsScheduleWeekRow\)\.join\(""\)/);
});

test('campo vazio continua sendo vazio para uso como limite ilimitado',()=>{
 const row=render({weekday:4,enabled:true,max_teams:null});
 assert.match(row,/data-week-max="4" value="" placeholder="—"/);
 const inactive=render({weekday:0,enabled:false,max_teams:0});
 assert.match(inactive,/value="0"/);
});

test('salvamento original continua sem mudança de horário, limites e permissões',()=>{
 const i=html.indexOf('async function saveScheduleSettings(e){');
 const j=html.indexOf('async function savePaymentSettings(e){',i);
 const save=html.slice(i,j);
 assert.match(save,/currentRole!=="owner"/);
 assert.match(save,/start>=end\|\|interval<5/);
 assert.match(save,/\.from\("schedule_settings"\)\.update\(\{workday_start:start,workday_end:end,slot_interval_minutes:interval,public_allow_same_day_default:\$\("setsameday"\)\.checked/);
 assert.match(save,/document\.querySelector\('\[data-week-enabled="/);
 assert.match(save,/document\.querySelector\('\[data-week-max="/);
 assert.match(save,/max=raw===""\?null:Number\(raw\)/);
 assert.match(save,/max_teams:enabled\?max:0/);
 assert.match(save,/\.from\("schedule_week_rules"\)\.update\(\{enabled,max_teams/);
 assert.match(html,/\$\("setschedulef"\)\.onsubmit=saveScheduleSettings/);
 assert.doesNotMatch(functionCode,/\.insert\(|\.update\(|\.delete\(|sb\./);
});

test('layout reduz altura, preserva campos editáveis e áreas de toque',()=>{
 assert.match(css,/#set \.settings-schedule-times\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);
 assert.match(css,/#set \.settings-week-row\{[^}]*grid-template-columns:minmax\(0,1fr\) 102px;[^}]*min-height:56px/s);
 assert.match(css,/#set \.settings-week-toggle\{[^}]*min-height:44px/s);
 assert.match(css,/#set \.settings-week-capacity input\{[^}]*min-height:44px/s);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(html,/<link rel="stylesheet" href="\/settings-schedule-clean\.css\?v=20261015-1">/);
});

test('as demais áreas do app permanecem disponíveis',()=>{
 for(const id of ['setservicef','setaddonf','setpayf','setservices','setaddons','rsummary','fsummary','apf']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(html,/function settingsServiceCard\(s\)/);
 assert.match(html,/function settingsAddonCard\(a\)/);
 assert.match(html,/function toggleAddonServiceScope\(\)/);
});
