
if(!window.supabase){
  const m=document.getElementById("amsg");
  if(m){m.textContent="Não foi possível carregar o sistema. Atualize a página e tente novamente.";m.className="notice error";}
  throw new Error("Supabase JS não carregou");
}
const {createClient}=window.supabase;
const SUPABASE_URL="https://cfpvexgkjsqpwhebsoos.supabase.co", KEY="sb_publishable_6nwmh1z_tkjIOj3yyXE4JA_ycJcrRIL", FN=SUPABASE_URL+"/functions/v1/vaporeasy-v2-staging", PUBLIC_FN=SUPABASE_URL+"/functions/v1/vaporeasy-public-booking";
const sb=createClient(SUPABASE_URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const BRAND_LOGO="/vaporeasy-logo-original.svg?v=20261006-01",brandLogoImg=new Image();brandLogoImg.src=BRAND_LOGO;
const $=id=>document.getElementById(id); let mode="login", clients=[], services=[], collabs=[], vehicleBrands=[], vehicleModels=[], currentApps=[], vehicles=new Map(), teams=[], teamMembers=[], allCollabs=[], currentUserId=null, currentRole="", currentReceipt=null, currentReceiptGroup=null, currentMonthlyReceipt=null, currentFinishExistingPhoto=null, notifTimer=null, notifChannel=null, knownUnread=new Set(), soundCtx=null, publicCfg=null, publicToken=new URLSearchParams(location.search).get("share")||"", publicRequestId=crypto.randomUUID(), generatedLinkClientName="", generatedLinkClientId="", slotRequestSeq=0, publicDates=[], publicDateLimit=6, publicAddonIds=[], androidImportContacts=[], collabAccess=new Map(), currentPaymentQuote=null, currentPaymentMode="receive", currentPaymentGroupIds=[], refsLoadedAt=0, vehicleCatalogLoadedAt=0, waterCounterLoadedAt=0, agendaLoadSeq=0, agendaMonthCache=new Map(), apptRecurringByVehicle=new Map(), recurrenceSyncAt=0;
const esc=s=>String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const plate=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7);
const money=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n||0));
const clock=i=>new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(new Date(i));
const apRange=x=>{const end=x.ends_at||new Date(new Date(x.starts_at).getTime()+(Number(x.duration_minutes)||0)*60000).toISOString();return clock(x.starts_at)+"–"+clock(end)};
const statusLabel=s=>({requested:"Aguardando confirmação",scheduled:"Agendado",confirmed:"Confirmado",in_progress:"Em atendimento",completed:"Concluído",cancelled:"Cancelado",no_show:"Não compareceu"}[s]||s);
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const WATER_BASE_LITERS=1094400,WATER_PER_COMPLETED_SERVICE=190,WATER_BASE_AT="2026-09-20T13:45:00.000Z";
const waterNumber=n=>new Intl.NumberFormat("pt-BR").format(Number(n||0));
async function loadWaterCounter(force=false){
  if(!currentUserId)return;
  if(!force&&waterCounterLoadedAt&&Date.now()-waterCounterLoadedAt<60000)return;
  const r=await sb.from("appointments").select("id",{count:"exact",head:true}).eq("status","completed").is("deleted_at",null).gte("completed_at",WATER_BASE_AT);
  if(r.error){$("watertotal").textContent="—";$("waterdetail").textContent="Não foi possível atualizar o contador.";return}
  waterCounterLoadedAt=Date.now();
  const afterBase=r.count||0,total=WATER_BASE_LITERS+afterBase*WATER_PER_COMPLETED_SERVICE;
  $("watertotal").textContent=waterNumber(total)+" litros";
  $("waterdetail").textContent="Economia acumulada estimada • "+waterNumber(WATER_PER_COMPLETED_SERVICE)+" L por atendimento concluído";
}
const fail=e=>{const m=String(e?.message||e||"Erro");if(/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(m))return"Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.";if(e?.code==="23P01")return"Conflito de horário: colaborador ou veículo já ocupado.";if(e?.code==="23505"){if(m.includes("appointments_active_vehicle_start_uq"))return"Este veículo já possui esse serviço agendado nesse horário. Escolha outro horário ou cancele o agendamento existente.";if(m.includes("appointments_active_collaborator_start_uq"))return"Este colaborador já está ocupado nesse horário. Escolha outro horário ou outro colaborador.";return"Já existe um agendamento igual ou conflitante.";}if(e?.code==="23503")return"Cliente e veículo não correspondem.";return m};
function show(id,text,type=""){const e=$(id);e.textContent=text;e.className="notice "+type;e.classList.toggle("hidden",!text)}
async function submitRecoveryPassword(event){event.preventDefault();const pass=$("recovery-password").value;const confirm=$("recovery-confirm").value;const msg=$("recovery-msg");if(pass.length<12){msg.textContent="Use uma senha de pelo menos 12 caracteres.";return}if(pass!==confirm){msg.textContent="As senhas não coincidem.";return}const result=await sb.auth.updateUser({password:pass});if(result.error){msg.textContent="Não foi possível atualizar a senha: "+result.error.message;return}msg.textContent="Senha atualizada. Faça login com a nova senha.";history.replaceState(null,"",location.pathname);$("recovery").classList.add("hidden");$("auth").classList.remove("hidden");}
async function boot(){window.__vaporeasyAppBooted=false;wire();window.__vaporeasyAppBooted=true;const ready=$("loginready");if(ready){ready.textContent="Sistema pronto";ready.classList.add("is-ready")};configureAndroidContactImport();document.querySelectorAll("[data-brand-logo]").forEach(img=>{img.onerror=()=>{img.onerror=null;img.src="/vaporeasy-logo-original.svg?v=20260928-05"}});prefillLoginEmailFromUrl();restoreLoginEmail();if(new URLSearchParams(location.search).get("booking")==="1"&&publicToken){await publicBoot();return}$("date").value=today();$("adt").value=today();const {data}=await sb.auth.getSession();const params=new URLSearchParams(location.search),hashParams=new URLSearchParams(location.hash.replace(/^#/,""));const isRecovery=params.get("type")==="recovery"||hashParams.get("type")==="recovery"||params.has("token_hash")||params.has("code")||hashParams.has("access_token")||sessionStorage.getItem("v3_recovery_pending")==="1";if(isRecovery){sessionStorage.setItem("v3_recovery_pending","1");$("auth").classList.add("hidden");$("main").classList.add("hidden");$("hdr").classList.add("hidden");$("recovery").classList.remove("hidden");return}if(data.session)await enter(data.session)}
function wire(){
 const recoveryForm=$("recovery-form");if(recoveryForm)recoveryForm.onsubmit=submitRecoveryPassword;

 $("af").onsubmit=authSubmit;$("email").addEventListener("input",rememberLoginEmail);$("email").addEventListener("change",rememberLoginEmail);$("passtoggle").onclick=()=>{const p=$("pass"),show=p.type==="password";p.type=show?"text":"password";$("passtoggle").textContent=show?"Ocultar":"Mostrar";$("passtoggle").setAttribute("aria-label",show?"Ocultar senha":"Mostrar senha")};$("bell").onclick=openNotifications;$("out").onclick=async()=>{if(notifTimer)clearInterval(notifTimer);if(notifChannel)await sb.removeChannel(notifChannel);const r=await sb.auth.signOut({scope:"local"});if(r.error){show("msg","Não foi possível encerrar a sessão. Tente novamente.","error");return}const check=await sb.auth.getSession();if(check.data?.session){show("msg","A sessão anterior ainda está ativa. Tente sair novamente.","error");return}currentUserId=null;currentRole=null;currentApps=[];$("pass").value="";location.reload()};document.addEventListener("pointerdown",prepareSound,{once:true});
 $("top").onclick=()=>tab("ops");$("tc").onclick=()=>tab("cad");$("ta").onclick=()=>tab("age");$("tf").onclick=()=>tab("fin");$("tr").onclick=()=>tab("rep");$("tset").onclick=()=>tab("set");$("oprefresh").onclick=async()=>{operatorMonthCache.clear();await Promise.all([loadOperatorMonth(true),loadOperatorJobs(operatorSelectedDate,false)])};$("opcalprev").onclick=()=>shiftOperatorMonth(-1);$("opcalnext").onclick=()=>shiftOperatorMonth(1);$("optoday").onclick=()=>selectOperatorDate(today());$("collabsbtn").onclick=openCollaboratorsManager;$("newcollab").onclick=()=>openCollaboratorEditor();$("collabf").onsubmit=saveCollaborator;$("collablogin").onchange=toggleCollaboratorAccessFields;$("collabtabdata").onclick=()=>switchCollaboratorSection("data");$("collabtabaccess").onclick=()=>switchCollaboratorSection("access");$("collabaccessrole").onchange=updateCollaboratorAccessSummary;$("collabemail").oninput=updateCollaboratorAccessSummary;$("collabpassgenerate").onclick=generateCollaboratorPassword;$("collabpasscopy").onclick=copyCollaboratorPassword;$("teamsbtn").onclick=openTeamsManager;$("newteam").onclick=()=>openTeamEditor();$("teamf").onsubmit=saveTeam;$("rc").onclick=loadClients;$("nc").onclick=()=>openClient();$("importcontacts").onclick=openAndroidContactsImport;$("contactsselectall").onclick=selectAllAndroidContacts;$("contactsimportsave").onclick=saveAndroidContactsImport;$("cf").onsubmit=saveClient;$("vf").onsubmit=saveVehicle;$("rgf").onsubmit=saveVehicleRG;$("rgif").onsubmit=saveRGIssue;$("rgfreq").onchange=toggleRGRecurrence;$("rgissueadd").onclick=()=>openRGIssue();$("rgreport").onclick=()=>generateVehicleNeedsReport("report");$("rgquote").onclick=()=>generateVehicleNeedsReport("quote");$("rgissuephotofile").onchange=addRGIssuePhoto;$("rgphotoadd").onclick=()=>$("rgphoto").click();$("rgphoto").onchange=addRGPhoto;$("vb").onchange=onBrandChange;$("vm").onchange=onModelChange;$("gl").onclick=openLinkDialog;$("lclient").onchange=()=>{updateLinkPreview();clearGeneratedLink()};$("lclientsearch").oninput=()=>{if($("lclient").value)clearLinkClientPicker(true);renderLinkClientSuggestions()};$("lclientsearch").onfocus=renderLinkClientSuggestions;$("lclientsearch").onkeydown=e=>{if(e.key==="Escape"){$("lclientsuggestions").classList.add("hidden");$("lclientsearch").blur()}};$("lnewclient").onclick=useNewLinkClient;$("lat").onchange=clearGeneratedLink;$("mklink").onclick=createPublicLink;$("copylink").onclick=copyPublicLink;$("sharelink").onclick=sharePublicLink;
 $("na").onclick=openAppt;$("recorddone").onclick=openRealizedService;$("rdf").onsubmit=saveRealizedService;$("rdclient").onchange=loadRealizedVehicles;$("rdservice").onchange=applyRealizedService;$("rddisctype").onchange=updateRealizedQuote;$("rddiscvalue").oninput=updateRealizedQuote;$("rdvalue").oninput=updateRealizedQuote;$("apf").onsubmit=saveAppt;$("apvalue").oninput=()=>{window.__appointmentValueTouched=true;updateAppointmentDiscountPreview()};$("apdiscounttype").onchange=()=>{if($("apdiscounttype").value==="none")$("apdiscountvalue").value="";updateAppointmentDiscountPreview()};$("apdiscountvalue").oninput=updateAppointmentDiscountPreview;$("exf").onsubmit=saveExpense;$("fnewexp").onclick=()=>openExpense();$("frefresh").onclick=loadFinance;$("fmonth").onchange=loadFinance;$("fmonthreport").onclick=generateMonthlyFinanceReportPdf;$("rrefresh").onclick=loadManagementReport;$("rpdf").onclick=generateManagementReportPdf;$("setnewservice").onclick=()=>openServiceSetting();$("setnewaddon").onclick=()=>openAddonSetting();$("setservicef").onsubmit=saveServiceSetting;$("setservicesizepricing").onchange=toggleServiceSizePricingFields;$("setaddonf").onsubmit=saveAddonSetting;$("setaddonall").onchange=toggleAddonServiceScope;$("setschedulef").onsubmit=saveScheduleSettings;$("setpayf").onsubmit=savePaymentSettings;$("setpayf").addEventListener("input",syncPaymentSaveAvailability);$("setpayf").addEventListener("change",syncPaymentSaveAvailability);$("payf").onsubmit=savePayment;$("paydiscounttype").onchange=updatePaymentDiscountPreview;$("paydiscountvalue").oninput=updatePaymentDiscountPreview;$("paycancel").onclick=cancelPaymentDialog;$("rshare").onclick=shareReceiptVisual;$("rgroup").onclick=openSameClientReceiptGroup;$("rdiscount").onclick=openReceiptDiscount;$("rcharge").onclick=shareChargePix;$("rprint").onclick=generateReceiptPdf;$("acsearch").oninput=()=>{if($("ac").value)clearApptClientPicker(true);renderApptClientSuggestions()};$("acsearch").onfocus=renderApptClientSuggestions;$("acsearch").onkeydown=e=>{if(e.key==="Escape"){$("acsuggestions").classList.add("hidden");$("acsearch").blur()}};$("av").onchange=()=>{syncSingleAppointmentPackageSize();loadAvailableSlots()};$("appackagesize").onchange=()=>{updateSingleAppointmentPackagePrice()};$("avselectall").onclick=toggleAllAppointmentVehicles;$("as").onchange=applyServiceRule;$("acol").onchange=loadAvailableSlots;$("adt").onchange=loadAvailableSlots;$("date").onchange=()=>{agendaCalendarMonth=calendarMonthFromDate($("date").value);if(agendaViewMode==="month"){loadMonthCalendar(false);loadApps()}else if(agendaViewMode==="list")loadAgendaList();else loadApps()};$("agendaToday").onclick=()=>{$("date").value=today();agendaCalendarMonth=calendarMonthFromDate($("date").value);setAgendaView("day")};$("agendaViewMonth").onclick=()=>setAgendaView("month");$("agendaViewDay").onclick=()=>setAgendaView("day");$("agendaViewList").onclick=()=>setAgendaView("list");$("calprev").onclick=()=>shiftCalendarMonth(-1);$("calnext").onclick=()=>shiftCalendarMonth(1);$("listprev").onclick=()=>shiftAgendaListMonth(-1);$("listnext").onclick=()=>shiftAgendaListMonth(1);$("q").oninput=()=>{selectedClientId="";renderClients()};
 document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());
}

async function edgeCall(action,data={},auth=false,method="POST"){const headers={"content-type":"application/json"};if(auth){const s=await sb.auth.getSession();const token=s.data.session?.access_token;if(!token)throw Error("Sessão expirada.");headers.authorization="Bearer "+token}const r=await fetch(FN+"?action="+encodeURIComponent(action),{method,headers,body:method==="GET"?undefined:JSON.stringify(data)});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||"Falha na operação.");return j}
async function publicEdgeCall(action,data={}){const r=await fetch(PUBLIC_FN+"?action="+encodeURIComponent(action),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||"Falha no agendamento.");return j}
function clearGeneratedLink(){generatedLinkClientName="";generatedLinkClientId="";$("linkout").value="";$("sharemsg").value="";$("sharemsgwrap").classList.add("hidden");$("copylink").disabled=true;$("sharelink").disabled=true}
function normalizeLinkClientSearch(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function linkClientMeta(c){
  const phone=String(c?.phone||c?.whatsapp||"").trim();
  const condo=String(c?.condominium_name||c?.condo_name||(typeof c?.condominium==="string"?c.condominium:"")||"").trim();
  return [phone,condo].filter(Boolean).join(" • ")||"Cliente cadastrado"
}
function clearLinkClientPicker(keepText=false){
  $("lclient").value="";
  if(!keepText)$("lclientsearch").value="";
  $("lclientselected").classList.add("hidden");
  $("lclientselected").innerHTML="";
  $("lclientsuggestions").classList.add("hidden");
  $("lclientsuggestions").innerHTML="";
  updateLinkPreview();
  clearGeneratedLink()
}
function renderLinkClientSuggestions(){
  const q=normalizeLinkClientSearch($("lclientsearch").value),box=$("lclientsuggestions");
  if(!q){box.innerHTML="";box.classList.add("hidden");return}
  const ranked=clients.map(c=>{
    const name=normalizeLinkClientSearch(c.name),words=name.split(/\s+/);
    const phone=normalizeLinkClientSearch(c.phone||c.whatsapp||"");
    const condo=normalizeLinkClientSearch(c.condominium_name||c.condo_name||(typeof c.condominium==="string"?c.condominium:"")||"");
    const address=normalizeLinkClientSearch(c.address||"");
    let rank=9;
    if(name===q)rank=0;
    else if(name.startsWith(q))rank=1;
    else if(words.some(w=>w.startsWith(q)))rank=2;
    else if(name.includes(q))rank=3;
    else if(phone.includes(q)||condo.includes(q)||address.includes(q))rank=4;
    return {c,rank}
  }).filter(x=>x.rank<9).sort((a,b)=>a.rank-b.rank||a.c.name.localeCompare(b.c.name,"pt-BR")).slice(0,8);
  if(!ranked.length){box.innerHTML='<div class="appt-client-noresult">Nenhum cliente encontrado.</div>';box.classList.remove("hidden");return}
  box.innerHTML=ranked.map(({c})=>'<button type="button" class="appt-client-suggestion" data-lclient-pick="'+c.id+'"><span><b>'+esc(c.name)+'</b><small>'+esc(linkClientMeta(c))+'</small></span><span class="appt-client-chevron">›</span></button>').join("");
  box.classList.remove("hidden");
  box.querySelectorAll("[data-lclient-pick]").forEach(b=>b.onclick=()=>selectLinkClient(b.dataset.lclientPick))
}
function selectLinkClient(id){
  const c=clients.find(x=>x.id===id);if(!c)return;
  $("lclient").value=c.id;
  $("lclientsearch").value=c.name;
  $("lclientsuggestions").classList.add("hidden");
  $("lclientsuggestions").innerHTML="";
  $("lclientselected").innerHTML='<span><b>'+esc(c.name)+'</b><small>'+esc(linkClientMeta(c))+'</small></span><button type="button" class="ghost" data-lclient-clear>Trocar</button>';
  $("lclientselected").classList.remove("hidden");
  const clear=$("lclientselected").querySelector("[data-lclient-clear]");
  if(clear)clear.onclick=()=>{clearLinkClientPicker();$("lclientsearch").focus()};
  updateLinkPreview();
  clearGeneratedLink()
}
function useNewLinkClient(){
  clearLinkClientPicker(false);
  $("lpreview").textContent="Link para um novo cliente preencher o próprio cadastro."
}
async function openLinkDialog(){let allow=true;const r=await sb.from("schedule_settings").select("public_allow_same_day_default").eq("id",1).maybeSingle();if(!r.error&&r.data)allow=r.data.public_allow_same_day_default!==false;$("lat").checked=allow;$("lclient").innerHTML='<option value="">Novo cliente</option>'+clients.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join("");clearLinkClientPicker(false);$("ld").showModal()}
function updateLinkPreview(){const id=$("lclient").value,c=clients.find(x=>x.id===id);$("lpreview").textContent=c?"O link será personalizado para "+c.name+", com acesso aos veículos já cadastrados desse cliente.":"Link para um novo cliente preencher o próprio cadastro."}
function buildShareMessage(url){if(generatedLinkClientName)return "Olá, "+generatedLinkClientName+"! Tudo bem?\n\nPreparamos seu link personalizado de agendamento da Vaporeasy. Por ele você pode escolher seu veículo, o serviço, a data e o horário disponíveis.\n\n"+url+"\n\nObrigado por escolher a Vaporeasy. 💧";return "Olá! Tudo bem?\n\nPara facilitar seu atendimento, preparamos o link de agendamento da Vaporeasy. Você poderá fazer seu cadastro, cadastrar seu veículo e escolher o serviço, a data e o horário disponíveis.\n\n"+url+"\n\nObrigado por escolher a Vaporeasy. 💧"}
async function createPublicLink(){const b=$("mklink"),selectedId=$("lclient").value||"",selectedClient=clients.find(x=>x.id===selectedId);b.disabled=true;b.textContent="Gerando...";try{const j=await edgeCall("create-public-link",{allow_same_day:$("lat").checked,client_id:selectedId||null},true);const link=location.origin+location.pathname+"?booking=1&share="+j.link.token;generatedLinkClientId=selectedId;generatedLinkClientName=selectedClient?.name||"";$("linkout").value=link;$("sharemsg").value=buildShareMessage(link);$("sharemsgwrap").classList.remove("hidden");$("copylink").disabled=false;$("sharelink").disabled=false}catch(e){show("msg",fail(e),"error")}finally{b.disabled=false;b.textContent="Gerar link"}}
async function copyPublicLink(){const v=$("sharemsg").value||$("linkout").value;if(!v)return;try{await navigator.clipboard.writeText(v);$("copylink").textContent="Copiado";setTimeout(()=>$("copylink").textContent="Copiar mensagem",1200)}catch{$("sharemsg").select();document.execCommand("copy")}}
async function sharePublicLink(){const url=$("linkout").value,msg=$("sharemsg").value||buildShareMessage(url);if(!url)return;if(navigator.share){try{await navigator.share({title:"Agendamento Vaporeasy",text:msg});return}catch{}}await copyPublicLink()}
const publicVehicleId=()=>publicCfg?.personalized&&$("pfvsel")?.value&&$("pfvsel").value!=="__new__"?$("pfvsel").value:null;
function publicVehicleRecord(){const id=publicVehicleId();return id?(publicCfg?.vehicles||[]).find(x=>x.id===id):null}
function publicPackageSize(){return $("pfpackagesize")?.value||publicVehicleRecord()?.package_size||""}
function publicServiceBasePrice(svc){
  if(!svc)return 0;
  if(!svc.size_pricing_enabled)return Number(svc.price||0);
  const size=publicPackageSize();
  if(size==="g")return Number(svc.price_g??svc.price??0);
  if(size==="pm")return Number(svc.price_pm??svc.price??0);
  return 0
}
function publicServiceOptionPriceLabel(svc){
  if(!svc?.size_pricing_enabled)return " • "+money(svc?.price||0);
  const size=publicPackageSize();
  if(!["pm","g"].includes(size))return "";
  return " • "+money(publicServiceBasePrice(svc))
}
function refreshPublicServiceOptions(){
  if(!publicCfg)return;
  const current=$("pfs").value;
  $("pfs").innerHTML='<option value="">Selecione</option>'+(publicCfg.services||[]).map(s=>'<option value="'+s.id+'">'+esc(s.name)+esc(publicServiceOptionPriceLabel(s))+'</option>').join("");
  if(current&&(publicCfg.services||[]).some(s=>s.id===current))$("pfs").value=current
}
function syncPublicPackageSize(){
  const svc=(publicCfg?.services||[]).find(x=>x.id===$("pfs")?.value),uses=!!svc?.size_pricing_enabled;
  $("pfpackagesizewrap").classList.toggle("hidden",!uses);
  $("pfpackagesize").required=uses;
  if(uses){
    const saved=publicVehicleRecord()?.package_size;
    if(saved==="pm"||saved==="g")$("pfpackagesize").value=saved;
  }else $("pfpackagesize").value="";
}
function setPublicVehicleFields(showFields){$("pfvehiclefields").classList.toggle("hidden",!showFields);$("pfb").required=showFields;$("pfm").required=showFields;if(!showFields){$("pfbo").required=false;$("pfmo").required=false}}
function publicVehicleChanged(){const id=publicVehicleId();if(id){const v=publicCfg.vehicles.find(x=>x.id===id);setPublicVehicleFields(false);$("pfvsummary").textContent=v?(v.brand+" "+v.model+(v.plate?" • "+v.plate:"")):"";$("pfpackagesize").value=v?.package_size==="g"?"g":(v?.package_size==="pm"?"pm":"")}else{setPublicVehicleFields(true);$("pfvtitle").textContent="Cadastrar novo veículo";$("pfvsummary").textContent="Preencha os dados abaixo para adicionar este veículo ao seu cadastro.";$("pfpackagesize").value=""}syncPublicPackageSize();refreshPublicServiceOptions();renderPublicAddons();loadPublicDates()}
const pbrand=()=>$("pfb").value==="__other__"?$("pfbo").value.trim():$("pfb").value;
const pmodel=()=>$("pfm").value==="__other__"?$("pfmo").value.trim():$("pfm").value;
function publicBrandChanged(){const other=$("pfb").value==="__other__";$("pfbol").classList.toggle("hidden",!other);$("pfbo").required=other;if(other){$("pfm").innerHTML='<option value="__other__">Outro modelo</option>';$("pfm").value="__other__";$("pfmol").classList.remove("hidden");$("pfmo").required=true}else{const b=publicCfg?.brands.find(x=>x.name===$("pfb").value),mods=b?(publicCfg.models||[]).filter(m=>m.brand_id===b.id):[];$("pfm").innerHTML='<option value="">Selecione</option>'+mods.map(m=>'<option value="'+esc(m.name)+'">'+esc(m.name)+'</option>').join("")+'<option value="__other__">Outro modelo</option>';$("pfmol").classList.add("hidden");$("pfmo").required=false;$("pfmo").value=""}loadPublicDates()}
function publicModelChanged(){const other=$("pfm").value==="__other__";$("pfmol").classList.toggle("hidden",!other);$("pfmo").required=other;if(!other)$("pfmo").value=""}
const fmtPublicDate=d=>new Intl.DateTimeFormat("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(d+"T12:00:00"));
async function publicBoot(){try{$("auth").classList.add("hidden");$("main").classList.add("hidden");$("hdr").classList.add("hidden");$("public").classList.remove("hidden");const r=await fetch(PUBLIC_FN+"?action=public-config&token="+encodeURIComponent(publicToken),{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error||"Link inválido.");publicCfg=j;$("pfintro").textContent=j.allow_same_day?"Escolha uma data e um horário disponível. Agendamentos para hoje podem aparecer se ainda houver horário.":"Escolha uma data e um horário disponível. Este link não permite agendamento para hoje.";$("pfb").innerHTML='<option value="">Selecione</option>'+j.brands.map(b=>'<option value="'+esc(b.name)+'">'+esc(b.name)+'</option>').join("")+'<option value="__other__">Outra montadora</option>';$("pfm").innerHTML='<option value="">Selecione a montadora</option>';refreshPublicServiceOptions();if(j.personalized&&j.client){$("pfwelcome").innerHTML='<b>Olá, '+esc(j.client.name)+'!</b><div class="meta" style="margin-top:5px">Que bom ter você por aqui. Seu cadastro Vaporeasy foi identificado; escolha um de seus veículos ou cadastre um novo.</div>';$("pfwelcome").classList.remove("hidden");$("pfidentity").classList.add("hidden");$("pfn").required=false;$("pfp").required=false;$("pfvehiclepick").classList.remove("hidden");$("pfvsel").innerHTML=(j.vehicles||[]).map(v=>'<option value="'+v.id+'">'+esc(v.brand+" "+v.model+(v.plate?" • "+v.plate:""))+'</option>').join("")+'<option value="__new__">+ Cadastrar novo veículo</option>';$("pfvsel").onchange=publicVehicleChanged;if((j.vehicles||[]).length){$("pfvsel").value=j.vehicles[0].id;publicVehicleChanged()}else{$("pfvsel").value="__new__";publicVehicleChanged()}}else{$("pfwelcome").innerHTML='<b>Bem-vindo à Vaporeasy!</b><div class="meta" style="margin-top:5px">Faça seu cadastro e escolha o melhor horário para o atendimento.</div>';$("pfwelcome").classList.remove("hidden");$("pfidentity").classList.remove("hidden");$("pfn").required=true;$("pfp").required=true;$("pfvehiclepick").classList.add("hidden");setPublicVehicleFields(true);$("pfvtitle").textContent="Seu veículo"}$("pfb").onchange=publicBrandChanged;$("pfm").onchange=publicModelChanged;$("pfs").onchange=publicServiceChanged;$("pfpackagesize").onchange=()=>{refreshPublicServiceOptions();renderPublicAddons();loadPublicDates()};$("pfpl").onchange=loadPublicDates;$("pfpl").onblur=loadPublicDates;$("pfmore").onclick=()=>{publicDateLimit+=6;renderPublicDates()};$("pf").onsubmit=submitPublicBooking;$("pnew").onclick=resetPublicBooking}catch(e){show("pmsg",fail(e),"error");$("pf").classList.add("hidden")}}
const selectedPublicAddons=()=>publicAddonIds.map(id=>(publicCfg?.addons||[]).find(a=>a.id===id)).filter(Boolean);
function publicTotals(){const svc=(publicCfg?.services||[]).find(x=>x.id===$("pfs").value),adds=selectedPublicAddons(),price=publicServiceBasePrice(svc)+adds.reduce((sum,a)=>sum+Number(a.price||0),0),mins=Number(svc?.duration_minutes||0)+adds.reduce((sum,a)=>sum+Number(a.duration_minutes||0),0);return{svc,adds,price,mins}}
function publicCompatibleAddons(){const adds=publicCfg?.addons||[],sid=$("pfs")?.value||"",compat=publicCfg?.addon_compatibility||[];if(!sid)return adds;return adds.filter(a=>{const rows=compat.filter(c=>c.addon_id===a.id);return !rows.length||rows.some(c=>c.service_id===sid&&c.enabled!==false)})}
function renderPublicAddons(){const box=$("pfaddons"),adds=publicCompatibleAddons();publicAddonIds=publicAddonIds.filter(id=>adds.some(a=>a.id===id));if(!adds.length){$("pfaddonswrap").classList.add("hidden");return}$("pfaddonswrap").classList.toggle("hidden",!$("pfs").value);box.innerHTML=adds.map(a=>'<button type="button" class="addon-card '+(publicAddonIds.includes(a.id)?"selected":"")+'" data-addon="'+a.id+'"><span class="addon-info"><span class="addon-name">'+esc(a.name)+'</span><span class="addon-meta">'+esc(a.description||"")+'</span></span><span><b>'+money(a.price)+'</b><span class="addon-meta" style="display:block;text-align:right">+'+durationLabel(a.duration_minutes)+'</span></span></button>').join("");box.querySelectorAll("[data-addon]").forEach(b=>b.onclick=()=>togglePublicAddon(b.dataset.addon));const t=publicTotals();$("pftotal").textContent=money(t.price);$("pfduration").textContent=t.mins?"Duração estimada: "+durationLabel(t.mins):""}
async function togglePublicAddon(id){show("pmsg","");const selected=publicAddonIds.includes(id),rules=publicCfg?.addon_rules||[];if(selected){publicAddonIds=publicAddonIds.filter(x=>x!==id)}else{const includedBy=rules.find(r=>r.relation==="includes"&&r.related_addon_id===id&&publicAddonIds.includes(r.addon_id));if(includedBy){const parent=(publicCfg.addons||[]).find(a=>a.id===includedBy.addon_id);show("pmsg",(parent?.name||"O serviço selecionado")+" já inclui este cuidado.","error");return}const inc=rules.filter(r=>r.relation==="includes"&&r.addon_id===id).map(r=>r.related_addon_id);publicAddonIds=publicAddonIds.filter(x=>!inc.includes(x));const excluded=rules.filter(r=>r.relation==="excludes"&&r.addon_id===id).map(r=>r.related_addon_id);publicAddonIds=publicAddonIds.filter(x=>!excluded.includes(x));publicAddonIds.push(id)}renderPublicAddons();await loadPublicDates()}
async function publicServiceChanged(){publicAddonIds=[];syncPublicPackageSize();refreshPublicServiceOptions();renderPublicAddons();await loadPublicDates()}
function shortDateLabel(d){const dt=new Date(d+"T12:00:00"),wd=new Intl.DateTimeFormat("pt-BR",{weekday:"short"}).format(dt).replace(".",""),dm=new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit"}).format(dt);return{wd,dm}}
function renderPublicDates(){const box=$("pfdates"),visible=publicDates.slice(0,publicDateLimit),selected=$("pfd").value;if(!publicDates.length){box.innerHTML='<div class="choice-hint">Nenhuma data disponível para este serviço.</div>';$("pfmore").classList.add("hidden");return}box.innerHTML=visible.map(d=>{const x=shortDateLabel(d);return '<button type="button" class="choice-btn '+(selected===d?"selected":"")+'" data-pdate="'+d+'">'+esc(x.wd)+'<small>'+esc(x.dm)+'</small></button>'}).join("");box.querySelectorAll("[data-pdate]").forEach(b=>b.onclick=()=>selectPublicDate(b.dataset.pdate));$("pfmore").classList.toggle("hidden",publicDateLimit>=publicDates.length)}
async function selectPublicDate(d){$("pfd").value=d;$("pft").value="";renderPublicDates();await loadPublicSlots(d)}
function renderPublicTimes(slots){const box=$("pftimes"),selected=$("pft").value;if(!slots?.length){box.innerHTML='<div class="choice-hint">Nenhum horário disponível nesta data.</div>';return}box.innerHTML=slots.map(x=>'<button type="button" class="choice-btn '+(selected===x.local_time?"selected":"")+'" data-ptime="'+esc(x.local_time)+'">'+esc(x.local_time)+'</button>').join("");box.querySelectorAll("[data-ptime]").forEach(b=>b.onclick=()=>{$("pft").value=b.dataset.ptime;renderPublicTimes(slots)})}
async function loadPublicDates(){if(!publicCfg)return;const s=$("pfs").value,help=$("pfsh");$("pfd").value="";$("pft").value="";publicDates=[];publicDateLimit=6;$("pfdates").innerHTML='<div class="choice-hint">Escolha o serviço para ver as datas.</div>';$("pftimes").innerHTML='<div class="choice-hint">Depois de escolher a data, os horários aparecerão aqui.</div>';$("pfmore").classList.add("hidden");if(!s){help.classList.add("hidden");return}const svc=publicCfg.services.find(x=>x.id===s);syncPublicPackageSize();if(svc?.size_pricing_enabled&&!["pm","g"].includes(publicPackageSize())){help.textContent="Selecione o porte P/M ou G do veículo para ver o valor correto e os horários do pacote.";help.classList.remove("hidden");$("pfdates").innerHTML='<div class="choice-hint">Selecione o porte do veículo primeiro.</div>';return}const totals=publicTotals();let hp=["Duração estimada com extras: "+durationLabel(totals.mins||svc?.duration_minutes||0),"Total estimado: "+money(totals.price)];if(svc?.booking_mode==="request")hp.push("Este serviço será enviado para confirmação da Vaporeasy");help.textContent=hp.join(" • ");help.classList.remove("hidden");$("pfdates").innerHTML='<div class="choice-hint">Buscando datas disponíveis...</div>';try{const j=await publicEdgeCall("public-dates",{token:publicToken,service_id:s,vehicle_id:publicVehicleId(),addon_ids:publicAddonIds,plate:plate($("pfpl").value)});publicDates=j.dates||[];renderPublicDates()}catch(e){$("pfdates").innerHTML='<div class="choice-hint">Não foi possível consultar as datas.</div>';show("pmsg",fail(e),"error")}}
async function loadPublicSlots(date=$("pfd").value){const s=$("pfs").value,d=date;$("pft").value="";$("pftimes").innerHTML='<div class="choice-hint">Buscando horários disponíveis...</div>';if(!s||!d){$("pftimes").innerHTML='<div class="choice-hint">Escolha uma data primeiro.</div>';return}try{const j=await publicEdgeCall("public-slots",{token:publicToken,service_id:s,date:d,vehicle_id:publicVehicleId(),addon_ids:publicAddonIds,plate:plate($("pfpl").value)});renderPublicTimes(j.slots||[])}catch(e){$("pftimes").innerHTML='<div class="choice-hint">Não foi possível consultar os horários.</div>';show("pmsg",fail(e),"error")}}
async function submitPublicBooking(e){e.preventDefault();show("pmsg","");const b=$("pfsubmit"),vehicleId=publicVehicleId(),brand=vehicleId?"":pbrand(),model=vehicleId?"":pmodel(),svc=(publicCfg?.services||[]).find(x=>x.id===$("pfs").value),packageSize=publicPackageSize();if(!vehicleId&&(!brand||!model)){show("pmsg","Selecione um veículo ou informe montadora e modelo.","error");return}if(svc?.size_pricing_enabled&&!["pm","g"].includes(packageSize)){show("pmsg","Selecione o porte P/M ou G do veículo para este pacote.","error");return}if(!$("pfd").value){show("pmsg","Escolha uma data disponível.","error");return}if(!$("pft").value){show("pmsg","Escolha um horário disponível.","error");return}b.disabled=true;b.textContent="Enviando...";try{const j=await publicEdgeCall("public-submit",{token:publicToken,request_id:publicRequestId,vehicle_id:vehicleId,name:$("pfn").value,phone:$("pfp").value,condominium:$("pfc").value,address:$("pfa").value,brand,model,plate:plate($("pfpl").value),year:$("pfy").value,color:$("pfco").value,package_size:packageSize,service_id:$("pfs").value,addon_ids:publicAddonIds,date:$("pfd").value,local_time:$("pft").value,notes:$("pfo").value});$("pf").classList.add("hidden");$("pdone").classList.remove("hidden");const who=publicCfg?.client?.name||$("pfn").value.trim()||"cliente";$("pdoneText").textContent=j.requires_confirmation?"Solicitação recebida. Aguarde a confirmação da Vaporeasy.":"Agendamento registrado com sucesso.";const totals=publicTotals(),dateLabel=fmtPublicDate($("pfd").value),extras=totals.adds.map(a=>a.name).join(", ");$("pbookingSummary").innerHTML='<div class="choice-title">Resumo do atendimento</div><div class="meta" style="margin-top:7px"><b>'+esc(totals.svc?.name||"Serviço")+'</b>'+(extras?'<br>Extras: '+esc(extras):'')+'<br>'+esc(dateLabel)+' às '+esc($("pft").value)+'<br>Duração estimada: '+esc(durationLabel(totals.mins))+'</div><div class="time" style="margin-top:8px">'+esc(money(totals.price))+'</div>';$("pthanks").textContent="Obrigado, "+who+"! Sua escolha ajuda a reduzir o consumo de água em cada atendimento.";const w=publicCfg?.water_savings||{};$("pwaterTotal").textContent=new Intl.NumberFormat("pt-BR").format(Number(w.total_liters||0))+" L economizados";$("pwaterText").textContent="Estimativa Vaporeasy: "+new Intl.NumberFormat("pt-BR").format(Number(w.conventional_liters_per_car||200))+" L em uma lavagem convencional versus cerca de "+new Intl.NumberFormat("pt-BR").format(Number(w.vaporeasy_liters_per_car||10))+" L por atendimento Vaporeasy." ;publicRequestId=crypto.randomUUID()}catch(e){show("pmsg",fail(e),"error");await loadPublicSlots()}finally{b.disabled=false;b.textContent="Reservar horário"}}
function resetPublicBooking(){$("pdone").classList.add("hidden");$("pf").classList.remove("hidden");const keepName=$("pfn").value,keepPhone=$("pfp").value,keepCondo=$("pfc").value,keepAddr=$("pfa").value,keepVehicle=$("pfvsel")?.value||"";$("pfs").value="";$("pfpackagesize").value="";$("pfpackagesizewrap").classList.add("hidden");publicAddonIds=[];renderPublicAddons();$("pfd").value="";$("pft").value="";publicDates=[];publicDateLimit=6;$("pfdates").innerHTML='<div class="choice-hint">Escolha o serviço para ver as datas.</div>';$("pftimes").innerHTML='<div class="choice-hint">Depois de escolher a data, os horários aparecerão aqui.</div>';$("pfmore").classList.add("hidden");$("pfo").value="";$("pfsh").classList.add("hidden");if(publicCfg?.personalized){$("pfvsel").value=keepVehicle||((publicCfg.vehicles||[])[0]?.id||"__new__");publicVehicleChanged()}else{$("pfn").value=keepName;$("pfp").value=keepPhone;$("pfc").value=keepCondo;$("pfa").value=keepAddr}show("pmsg","");publicRequestId=crypto.randomUUID()}
const LOGIN_EMAIL_KEY="vaporeasy_v2_login_email";
let loginEmailGuardTimer=null;
function rememberLoginEmail(){
  const input=$("email");if(!input)return;
  const v=input.value.trim();
  if(v)try{localStorage.setItem(LOGIN_EMAIL_KEY,v)}catch{}
}
function savedLoginEmail(){
  try{return localStorage.getItem(LOGIN_EMAIL_KEY)||""}catch{return""}
}
function restoreLoginEmail(force=false){
  const input=$("email");if(!input)return;
  const v=savedLoginEmail();
  if(v&&(force||!input.value))input.value=v
}
function prefillLoginEmailFromUrl(){
  const u=new URL(location.href),v=(u.searchParams.get("login")||"").trim();
  if(!v)return;
  $("email").value=v;
  try{localStorage.setItem(LOGIN_EMAIL_KEY,v)}catch{}
  u.searchParams.delete("login");
  history.replaceState(null,"",u.pathname+(u.search?u.search:"")+u.hash)
}
async function authSubmit(e){e.preventDefault();rememberLoginEmail();const email=$("email").value.trim(),password=$("pass").value;if(!email)return show("amsg","Informe o e-mail.","error");if(!password)return show("amsg","Informe a senha.","error");const b=$("ab");b.disabled=true;b.textContent="Entrando...";show("amsg","");try{const r=await sb.auth.signInWithPassword({email,password});if(r.error)throw r.error;const session=r.data.session,user=r.data.user||session?.user;if(!session||!user?.id)throw Error("Login não retornou uma sessão válida.");if(user.email&&user.email.trim().toLowerCase()!==email.toLowerCase()){await sb.auth.signOut({scope:"local"});throw Error("O usuário autenticado não corresponde ao e-mail informado. Digite o login novamente.")}await enter(session)}catch(e){show("amsg",fail(e),"error")}finally{b.disabled=false;b.textContent="Entrar no Vaporeasy"}}
async function enter(session){
  try{
    const sessionUser=session?.user;
    if(!session?.access_token||!sessionUser?.id)throw Error("Sessão inválida. Entre novamente.");
    const u=await sb.auth.getUser(session.access_token);if(u.error)throw u.error;
    if(!u.data.user||u.data.user.id!==sessionUser.id)throw Error("Sessão inconsistente. Saia e entre novamente.");
    const p=await sb.from("app_profiles").select("name,role,active").eq("user_id",sessionUser.id).maybeSingle();
    if(p.error)throw p.error;if(!p.data||!p.data.active)throw Error("Este usuário ainda não possui acesso ao staging.");
    currentUserId=sessionUser.id;currentRole=p.data.role;
    $("main-primary-nav").dataset.role=currentRole;
    const operator=currentRole==="operator",manager=["owner","admin"].includes(currentRole);
    $("pname").textContent=p.data.name||(sessionUser.email||"Usuário").split("@")[0];
    $("prole").textContent=operator?"Colaborador":currentRole==="admin"?"Gerente":"Proprietário";

    $("top").classList.toggle("hidden",!operator);
    $("tc").classList.toggle("hidden",operator);
    $("ta").classList.toggle("hidden",operator);
    $("tf").classList.toggle("hidden",!manager);
    $("tr").classList.toggle("hidden",!manager);
    $("tset").classList.toggle("hidden",currentRole!=="owner");
    $("teamsbtn").classList.toggle("hidden",!manager);
    $("collabsbtn").classList.toggle("hidden",!manager);
    $("importcontacts").classList.toggle("hidden",!manager);
    $("bell").classList.toggle("hidden",operator);
    $("watercard").classList.toggle("hidden",operator);

    show("amsg","");
    $("auth").classList.add("hidden");$("main").classList.remove("hidden");$("hdr").classList.remove("hidden");
    $("auth").style.display="none";$("main").style.display="block";$("hdr").style.display="flex";
    window.scrollTo(0,0);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

    if(operator){
      operatorSelectedDate=today();
      operatorCalendarMonth=operatorSelectedDate.slice(0,7)+"-01";
      await Promise.all([loadOperatorMonth(),loadOperatorJobs(operatorSelectedDate,false)]);
      tab("ops");
    }else{
      await Promise.all([refs(),loadClients()]);
      await Promise.all([loadApps(),startNotifications()]);
      tab("cad");
      void syncRecurringAppointmentsIfNeeded(false);
    }
  }catch(e){show("amsg",fail(e),"error")}
}
function prepareSound(){try{soundCtx=soundCtx||new (window.AudioContext||window.webkitAudioContext)();if(soundCtx.state==="suspended")soundCtx.resume()}catch{}}
function playAlert(){try{prepareSound();if(!soundCtx)return;const now=soundCtx.currentTime;[0,0.18].forEach((d,i)=>{const o=soundCtx.createOscillator(),g=soundCtx.createGain();o.type="sine";o.frequency.value=i?740:880;g.gain.setValueAtTime(0.0001,now+d);g.gain.exponentialRampToValueAtTime(0.16,now+d+0.015);g.gain.exponentialRampToValueAtTime(0.0001,now+d+0.14);o.connect(g);g.connect(soundCtx.destination);o.start(now+d);o.stop(now+d+0.16)})}catch{}}
const notifDate=x=>new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(x));
async function loadNotifications(play=false){if(!currentUserId)return[];const r=await sb.from("app_notifications").select("*").eq("user_id",currentUserId).order("created_at",{ascending:false}).limit(30);if(r.error)return[];const rows=r.data||[],unread=rows.filter(x=>!x.read_at),fresh=unread.filter(x=>!knownUnread.has(x.id));$("nbadge").textContent=unread.length>99?"99+":String(unread.length);$("nbadge").classList.toggle("hidden",unread.length===0);if(play&&fresh.length){playAlert();show("msg",fresh.length===1?"Novo agendamento público recebido.":fresh.length+" novos agendamentos públicos recebidos.","ok")}knownUnread=new Set(unread.map(x=>x.id));return rows}
async function openNotifications(){const rows=await loadNotifications(false);$("nlist").innerHTML=rows.length?rows.map(n=>'<div class="notif-item '+(!n.read_at?'notif-new':'')+'"><b>'+esc(n.title)+'</b><div class="meta">'+esc(n.message)+'</div><div class="meta">'+esc(notifDate(n.created_at))+'</div></div>').join(""):'<div class="empty">Nenhuma notificação.</div>';$("nd").showModal();const ids=rows.filter(x=>!x.read_at).map(x=>x.id);if(ids.length){await sb.from("app_notifications").update({read_at:new Date().toISOString()}).in("id",ids);await loadNotifications(false)}}
async function startNotifications(){if(!currentUserId)return;await loadNotifications(false);if(notifChannel)await sb.removeChannel(notifChannel);notifChannel=sb.channel("vaporeasy-public-bookings-"+currentUserId).on("postgres_changes",{event:"INSERT",schema:"public",table:"app_notifications",filter:"user_id=eq."+currentUserId},()=>loadNotifications(true)).subscribe();if(notifTimer)clearInterval(notifTimer);notifTimer=setInterval(()=>loadNotifications(true),20000)}
async function loadVehicleCatalog(force=false){
  if(!force&&vehicleCatalogLoadedAt&&Date.now()-vehicleCatalogLoadedAt<300000&&vehicleBrands.length&&vehicleModels.length)return;
  let [b,m]=await Promise.all([sb.from("vehicle_brands").select("*").eq("active",true).order("name"),sb.from("vehicle_models").select("*").eq("active",true).order("name")]);
  if(b.error)throw b.error;if(m.error)throw m.error;
  vehicleBrands=b.data||[];vehicleModels=m.data||[];vehicleCatalogLoadedAt=Date.now()
}
async function refs(force=false){
  if(!force&&refsLoadedAt&&Date.now()-refsLoadedAt<120000&&services.length&&collabs.length)return;
  let [s,c,t,tm]=await Promise.all([sb.from("services").select("*").eq("active",true).order("name"),sb.from("collaborators").select("*").eq("active",true).order("name"),sb.from("teams").select("*").order("name"),sb.from("team_members").select("*").order("position")]);
  if(s.error)throw s.error;if(c.error)throw c.error;if(t.error)throw t.error;if(tm.error)throw tm.error;
  services=s.data||[];collabs=c.data||[];teams=t.data||[];teamMembers=tm.data||[];refsLoadedAt=Date.now()
}
async function syncRecurringAppointmentsIfNeeded(force=false){
  if(!["owner","admin"].includes(currentRole))return;
  if(!force&&recurrenceSyncAt&&Date.now()-recurrenceSyncAt<21600000)return;
  recurrenceSyncAt=Date.now();
  const r=await sb.rpc("sync_recurring_appointments",{p_horizon_days:120});
  if(r.error){recurrenceSyncAt=0;return}
  const d=r.data||{};
  if(Number(d.created||0)>0)agendaMonthCache.clear()
}
