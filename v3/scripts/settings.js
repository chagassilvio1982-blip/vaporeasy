let settingServices=[],settingAddons=[],settingAddonCompat=[],settingSchedule=null,settingWeek=[],settingPayment=null;
const WEEK_NAMES=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const PAYMENT_SETTING_FIELDS=["setbiz","setholder","setbank","setpixtype","setpix","setbranch","setaccount","setfooter"];
let paymentSettingsInitialValues=null,paymentSettingsSaving=false;
function paymentSettingsSignature(){
  return JSON.stringify(PAYMENT_SETTING_FIELDS.map(id=>$(id).value));
}
function syncPaymentSaveAvailability(){
  const button=$("setpayf").querySelector(".settings-payment-save");
  button.disabled=paymentSettingsSaving||paymentSettingsInitialValues===null||paymentSettingsSignature()===paymentSettingsInitialValues;
}
function markPaymentSettingsClean(){
  paymentSettingsInitialValues=paymentSettingsSignature();
  syncPaymentSaveAvailability();
}
async function loadOperationalSettings(){
  if(currentRole!=="owner")return;
  try{
    const [sv,ad,cp,ss,wr,ps]=await Promise.all([
      sb.from("services").select("*").order("active",{ascending:false}).order("name"),
      sb.from("service_addons").select("*").order("sort_order").order("name"),
      sb.from("service_addon_compatibility").select("*"),
      sb.from("schedule_settings").select("*").eq("id",1).single(),
      sb.from("schedule_week_rules").select("*").order("weekday"),
      sb.from("business_payment_settings").select("*").eq("id",1).single()
    ]);
    if(sv.error)throw sv.error;if(ad.error)throw ad.error;if(cp.error)throw cp.error;if(ss.error)throw ss.error;if(wr.error)throw wr.error;if(ps.error)throw ps.error;
    settingServices=sv.data||[];settingAddons=ad.data||[];settingAddonCompat=cp.data||[];settingSchedule=ss.data;settingWeek=wr.data||[];settingPayment=ps.data;
    renderOperationalSettings()
  }catch(e){show("msg",fail(e),"error")}
}
function settingsServiceDisplayName(name){
  return String(name||"").replace(/^Pacote(?=\s|$)/i,"Plano");
}
function settingsServiceCard(s){
  const price=s.size_pricing_enabled
    ?'P/M '+esc(money(s.price_pm??s.price))+' • G '+esc(money(s.price_g??s.price))
    :esc(money(s.price));
  const time=durationLabel(s.duration_minutes);
  const booking=(s.booking_mode==="request"?"Confirmação manual":"Automático")+
    (s.first_slot_time?' • início '+esc(String(s.first_slot_time).slice(0,5)):'');
  return '<div class="item setting-service-card">'+
    '<div class="setting-service-card-main">'+
      '<div class="setting-service-info">'+
        '<div class="setting-service-heading"><b>'+esc(settingsServiceDisplayName(s.name))+'</b>'+
          '<span class="setting-service-status '+(s.active?'is-active':'is-inactive')+'">'+(s.active?'Ativo':'Inativo')+'</span></div>'+
        '<div class="meta setting-service-price">'+price+' • '+time+'</div>'+
        '<div class="meta setting-service-booking">'+booking+'</div>'+
      '</div>'+
      '<button type="button" class="ghost setting-service-edit" data-set-service="'+esc(s.id)+'">Editar</button>'+
    '</div>'+
  '</div>';
}
function settingsAddonCard(a){
  const price=esc(money(a.price||0));
  const duration=Number(a.duration_minutes||0);
  return '<div class="item setting-addon-card">'+
    '<div class="setting-addon-card-main">'+
      '<div class="setting-addon-info">'+
        '<div class="setting-addon-heading"><b>'+esc(a.name)+'</b></div>'+
        '<div class="meta setting-addon-price">'+price+' • '+duration+' min</div>'+
        '<div class="setting-addon-badges">'+
          '<span class="setting-addon-status '+(a.active?'is-active':'is-inactive')+'">'+(a.active?'Ativo':'Inativo')+'</span>'+
          '<span class="setting-addon-status '+(a.public_enabled?'is-public':'is-internal')+'">'+(a.public_enabled?'Público':'Somente interno')+'</span>'+
        '</div>'+
      '</div>'+
      '<button type="button" class="ghost setting-addon-edit" data-set-addon="'+esc(a.id)+'">Editar</button>'+
    '</div>'+
  '</div>';
}
function settingsScheduleWeekRow(w){
  const day=Number(w.weekday);
  const dayName=esc(WEEK_NAMES[day]||"Dia");
  const limit=w.max_teams??"";
  return '<div class="settings-week-row">'+
    '<label class="settings-week-toggle" for="settings-day-'+day+'">'+
      '<input id="settings-day-'+day+'" type="checkbox" data-week-enabled="'+day+'" '+(w.enabled?'checked':'')+'>'+
      '<span>'+dayName+'</span>'+
    '</label>'+
    '<label class="settings-week-capacity" for="settings-max-'+day+'">'+
      '<span class="settings-visually-hidden">Máximo de equipes em '+dayName+'</span>'+
      '<input id="settings-max-'+day+'" type="number" min="0" step="1" data-week-max="'+day+'" value="'+esc(String(limit))+'" placeholder="—" aria-label="Máximo de equipes em '+dayName+'">'+
    '</label>'+
  '</div>';
}
function renderOperationalSettings(){
  $("setservices").innerHTML=settingServices.length?settingServices.map(settingsServiceCard).join(""):'<div class="empty">Nenhum serviço cadastrado.</div>';
  $("setaddons").innerHTML=settingAddons.length?settingAddons.map(settingsAddonCard).join(""):'<div class="empty">Nenhum extra cadastrado.</div>';
  $("setservices").querySelectorAll("[data-set-service]").forEach(b=>b.onclick=()=>openServiceSetting(settingServices.find(x=>x.id===b.dataset.setService)));
  $("setaddons").querySelectorAll("[data-set-addon]").forEach(b=>b.onclick=()=>openAddonSetting(settingAddons.find(x=>x.id===b.dataset.setAddon)));
  $("setstart").value=String(settingSchedule?.workday_start||"07:40").slice(0,5);$("setend").value=String(settingSchedule?.workday_end||"18:00").slice(0,5);$("setinterval").value=settingSchedule?.slot_interval_minutes||20;$("setsameday").checked=settingSchedule?.public_allow_same_day_default!==false;
  $("setweek").innerHTML=settingWeek.map(settingsScheduleWeekRow).join("");
  const p=settingPayment||{};$("setbiz").value=p.business_name||"Vaporeasy";$("setholder").value=p.account_holder||"";$("setbank").value=p.bank_name||"";$("setbranch").value=p.branch||"";$("setaccount").value=p.account_number||"";$("setpix").value=p.pix_key||"";$("setpixtype").value=p.pix_key_type||"";$("setfooter").value=p.receipt_footer||"";markPaymentSettingsClean()
}
function toggleServiceSizePricingFields(){
  const enabled=$("setservicesizepricing").checked;
  $("setservicesizeprices").classList.toggle("hidden",!enabled);
  $("setservicebasewrap").hidden=enabled;
  $("setserviceprice").required=!enabled;
  $("setservicepricepm").required=enabled;$("setservicepriceg").required=enabled
}
function openServiceSetting(s=null){
  $("setservicef").reset();$("setserviceadvanced").open=false;show("setservicemsg","");$("setserviceid").value=s?.id||"";$("setservicetitle").textContent=s?"Editar serviço":"Novo serviço";$("setservicename").value=s?.name||"";$("setservicecat").value=s?.category||"";$("setserviceprice").value=s?.price??"";$("setservicesizepricing").checked=!!s?.size_pricing_enabled;$("setservicepricepm").value=s?.price_pm??s?.price??"";$("setservicepriceg").value=s?.price_g??s?.price??"";toggleServiceSizePricingFields();$("setserviceduration").value=s?.duration_minutes??90;$("setservicemode").value=s?.booking_mode||"auto";$("setservicefirst").value=s?.first_slot_time?String(s.first_slot_time).slice(0,5):"";$("setserviceactive").checked=s?!!s.active:true;$("setservicenotes").value=s?.notes||"";$("setserviced").showModal()
}
async function saveServiceSetting(e){
  e.preventDefault();if(currentRole!=="owner")return;
  const id=$("setserviceid").value,sizePricing=$("setservicesizepricing").checked,price=Number($("setserviceprice").value||0),pricePm=sizePricing?Number($("setservicepricepm").value):null,priceG=sizePricing?Number($("setservicepriceg").value):null,p={name:$("setservicename").value.trim(),category:$("setservicecat").value.trim(),price:sizePricing?pricePm:price,size_pricing_enabled:sizePricing,price_pm:sizePricing?pricePm:null,price_g:sizePricing?priceG:null,duration_minutes:Number($("setserviceduration").value||0),booking_mode:$("setservicemode").value,first_slot_time:$("setservicefirst").value||null,active:$("setserviceactive").checked,notes:$("setservicenotes").value.trim(),updated_at:new Date().toISOString()};
  if(!p.name||p.duration_minutes<=0)return show("setservicemsg","Informe nome e duração válida.","error");
  if(sizePricing&&(!Number.isFinite(pricePm)||pricePm<0||!Number.isFinite(priceG)||priceG<0))return show("setservicemsg","Informe os preços P/M e G.","error");
  try{const r=id?await sb.from("services").update(p).eq("id",id):await sb.from("services").insert(p);if(r.error)throw r.error;$("setserviced").close();await refs(true);await loadOperationalSettings();show("msg",id?"Serviço atualizado.":"Serviço criado.","ok")}catch(err){show("setservicemsg",fail(err),"error")}
}
function toggleAddonServiceScope(){$("setaddonserviceswrap").classList.toggle("hidden",$("setaddonall").checked)}
function openAddonSetting(a=null){
  $("setaddonf").reset();$("setaddonadvanced").open=false;show("setaddonmsg","");$("setaddonid").value=a?.id||"";$("setaddontitle").textContent=a?"Editar extra":"Novo extra";$("setaddonname").value=a?.name||"";$("setaddondesc").value=a?.description||"";$("setaddonprice").value=a?.price??"";$("setaddonduration").value=a?.duration_minutes??0;$("setaddonsort").value=a?.sort_order??0;$("setaddonactive").checked=a?!!a.active:true;$("setaddonpublic").checked=a?!!a.public_enabled:false;
  const rows=a?settingAddonCompat.filter(x=>x.addon_id===a.id):[],enabled=new Set(rows.filter(x=>x.enabled).map(x=>x.service_id));$("setaddonall").checked=!rows.length;
  $("setaddonservices").innerHTML=settingServices.map(s=>'<label style="display:flex;grid-template-columns:auto 1fr;align-items:center;gap:8px"><input type="checkbox" data-addon-service="'+s.id+'" '+(enabled.has(s.id)?'checked':'')+' style="width:20px;min-height:20px">'+esc(s.name)+(s.active?"":" (inativo)")+'</label>').join("");
  toggleAddonServiceScope();$("setaddond").showModal()
}
async function saveAddonSetting(e){
  e.preventDefault();if(currentRole!=="owner")return;
  const id=$("setaddonid").value,p={name:$("setaddonname").value.trim(),description:$("setaddondesc").value.trim(),price:Number($("setaddonprice").value||0),duration_minutes:Number($("setaddonduration").value||0),active:$("setaddonactive").checked,public_enabled:$("setaddonpublic").checked,sort_order:Number($("setaddonsort").value||0),updated_at:new Date().toISOString()},all=$("setaddonall").checked;
  if(!p.name)return show("setaddonmsg","Informe o nome do extra.","error");
  const selected=[...$("setaddonservices").querySelectorAll("[data-addon-service]:checked")].map(x=>x.dataset.addonService);
  if(!all&&!selected.length){
    $("setaddonadvanced").open=true;
    return show("setaddonmsg","Selecione pelo menos um serviço compatível ou marque todos os serviços.","error");
  }
  try{
    let addonId=id;if(id){const u=await sb.from("service_addons").update(p).eq("id",id);if(u.error)throw u.error}else{const ins=await sb.from("service_addons").insert(p).select("id").single();if(ins.error)throw ins.error;addonId=ins.data.id}
    const del=await sb.from("service_addon_compatibility").delete().eq("addon_id",addonId);if(del.error)throw del.error;
    if(!all){const ins=await sb.from("service_addon_compatibility").insert(selected.map(service_id=>({addon_id:addonId,service_id,enabled:true})));if(ins.error)throw ins.error}
    $("setaddond").close();await loadOperationalSettings();show("msg",id?"Extra atualizado.":"Extra criado.","ok")
  }catch(err){show("setaddonmsg",fail(err),"error")}
}
async function saveScheduleSettings(e){
  e.preventDefault();if(currentRole!=="owner")return;
  const start=$("setstart").value,end=$("setend").value,interval=Number($("setinterval").value||0);if(!start||!end||start>=end||interval<5)return show("msg","Revise início, fim e intervalo da agenda.","error");
  try{
    const s=await sb.from("schedule_settings").update({workday_start:start,workday_end:end,slot_interval_minutes:interval,public_allow_same_day_default:$("setsameday").checked,updated_at:new Date().toISOString()}).eq("id",1);if(s.error)throw s.error;
    for(const w of settingWeek){const enabled=document.querySelector('[data-week-enabled="'+w.weekday+'"]').checked,raw=document.querySelector('[data-week-max="'+w.weekday+'"]').value,max=raw===""?null:Number(raw);const u=await sb.from("schedule_week_rules").update({enabled,max_teams:enabled?max:0,updated_at:new Date().toISOString()}).eq("weekday",w.weekday);if(u.error)throw u.error}
    await loadOperationalSettings();show("msg","Horários e capacidade atualizados.","ok")
  }catch(err){show("msg",fail(err),"error")}
}
async function savePaymentSettings(e){
  e.preventDefault();if(currentRole!=="owner"||paymentSettingsSaving||paymentSettingsInitialValues===null||paymentSettingsSignature()===paymentSettingsInitialValues)return;
  const p={business_name:$("setbiz").value.trim()||"Vaporeasy",account_holder:$("setholder").value.trim(),bank_name:$("setbank").value.trim(),branch:$("setbranch").value.trim(),account_number:$("setaccount").value.trim(),pix_key:$("setpix").value.trim(),pix_key_type:$("setpixtype").value.trim(),receipt_footer:$("setfooter").value.trim(),updated_at:new Date().toISOString()};
  if(!p.account_holder)return show("msg","Informe o favorecido do pagamento.","error");
  paymentSettingsSaving=true;syncPaymentSaveAvailability();
  try{
    const r=await sb.from("business_payment_settings").update(p).eq("id",1);
    if(r.error)throw r.error;
    settingPayment={...(settingPayment||{}),...p};
    markPaymentSettingsClean();
    show("msg","Dados de pagamento atualizados.","ok");
  }catch(err){show("msg",fail(err),"error")}
  finally{paymentSettingsSaving=false;syncPaymentSaveAvailability()}
}
