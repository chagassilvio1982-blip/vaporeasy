function setAgendaView(mode){
  agendaViewMode=["month","day","list"].includes(mode)?mode:"day";
  $("monthcal")?.classList.toggle("hidden",agendaViewMode!=="month");
  $("agendaDayView")?.classList.toggle("hidden",agendaViewMode==="list");
  $("agendaListView")?.classList.toggle("hidden",agendaViewMode!=="list");
  // O seletor diário só tem utilidade na visão Dia. Mês e Lista possuem navegação própria.
  const dateControls=$("agendaDateToolbar");
  if(dateControls){
    dateControls.hidden=agendaViewMode!=="day";
    dateControls.classList.toggle("hidden",dateControls.hidden);
  }
  [["agendaViewMonth","month"],["agendaViewDay","day"],["agendaViewList","list"]].forEach(([id,key])=>{
    const b=$(id);if(!b)return;b.className=key===agendaViewMode?"primary":"ghost"
  });
  if(agendaViewMode==="month"){
    loadMonthCalendar(false);
    loadApps()
  }else if(agendaViewMode==="list")loadAgendaList();
  else loadApps()
}
function calendarMonthFromDate(value){
  const d=/^\d{4}-\d{2}-\d{2}$/.test(value||"")?value:today();
  return d.slice(0,7)
}
function shiftCalendarMonth(delta){
  const base=agendaCalendarMonth||calendarMonthFromDate($("date").value),parts=base.split("-").map(Number),y=parts[0],m=parts[1],d=new Date(y,m-1+delta,1);
  agendaCalendarMonth=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  loadMonthCalendar(false)
}
function shiftAgendaListMonth(delta){
  const base=agendaCalendarMonth||calendarMonthFromDate($("date").value),parts=base.split("-").map(Number),y=parts[0],m=parts[1],d=new Date(y,m-1+delta,1);
  agendaCalendarMonth=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  loadAgendaList()
}
function agendaLocalDateKey(iso){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(iso));
  const get=t=>parts.find(p=>p.type===t)?.value||"";
  return get("year")+"-"+get("month")+"-"+get("day")
}
function renderAgendaListHtml(rows,cm,vm,sm,tm,com){
  const groups=new Map();
  rows.forEach(x=>{const key=agendaLocalDateKey(x.starts_at);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x)});
  let html="";
  for(const [key,list] of groups){
    const [yy,mm,dd]=key.split("-").map(Number),label=new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long"}).format(new Date(yy,mm-1,dd));
    html+='<div class="list-caption" style="margin-top:14px;text-transform:capitalize">'+esc(label)+'</div>';
    html+=list.map(x=>{
      const cl=cm.get(x.client_id),v=vm.get(x.vehicle_id),s=sm.get(x.service_id),resp=tm.get(x.team_id)?.name||com.get(x.collaborator_id)?.name||"Responsável a definir";
      return '<button type="button" class="item" data-agenda-list-day="'+key+'" data-agenda-list-id="'+esc(x.id)+'" style="display:block;width:100%;text-align:left;margin-top:7px;color:inherit"><div class="appt-card-top"><div class="time">'+esc(apRange(x))+'</div><span class="pill status-pill">'+esc(statusLabel(x.status))+'</span></div><h3 style="margin:0 0 5px">'+esc(cl?.name||"Cliente")+'</h3><div class="appt-core"><b>'+esc(v?[v.brand,v.model].filter(Boolean).join(" "):"Veículo")+(v?.plate?' • '+esc(v.plate):'')+'</b><span>'+esc(s?.name||"Serviço")+' • '+esc(resp)+'</span></div></button>'
    }).join("")
  }
  return html;
}
async function loadAgendaList(){
  const req=++agendaListLoadSeq,box=$("agendaListItems");
  if(!box)return;
  const month=agendaCalendarMonth||calendarMonthFromDate($("date").value),[y,m]=month.split("-").map(Number),nextDate=new Date(y,m,1),next=nextDate.getFullYear()+"-"+String(nextDate.getMonth()+1).padStart(2,"0");
  const startIso=new Date(month+"-01T00:00:00-03:00").toISOString(),nextIso=new Date(next+"-01T00:00:00-03:00").toISOString();
  const title=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(new Date(y,m-1,1));
  $("listtitle").textContent=title.charAt(0).toUpperCase()+title.slice(1);
  box.innerHTML='<div class="empty">Atualizando lista do mês...</div>';
  const r=await sb.from("appointments").select("id,client_id,vehicle_id,service_id,team_id,collaborator_id,starts_at,ends_at,duration_minutes,status").gte("starts_at",startIso).lt("starts_at",nextIso).is("deleted_at",null).order("starts_at");
  if(req!==agendaListLoadSeq)return;
  if(r.error){box.innerHTML='<div class="notice error">'+esc(fail(r.error))+'</div>';return}
  const rows=r.data||[];
  if(!rows.length){box.innerHTML='<div class="empty">Nenhum agendamento neste mês.</div>';return}
  const clientIds=[...new Set(rows.map(x=>x.client_id).filter(Boolean))],vehicleIds=[...new Set(rows.map(x=>x.vehicle_id).filter(Boolean))],serviceIds=[...new Set(rows.map(x=>x.service_id).filter(Boolean))],teamIds=[...new Set(rows.map(x=>x.team_id).filter(Boolean))],collabIds=[...new Set(rows.map(x=>x.collaborator_id).filter(Boolean))];
  const [cr,vr,sr,tr,cor]=await Promise.all([
    clientIds.length?sb.from("clients").select("id,name").in("id",clientIds):Promise.resolve({data:[],error:null}),
    vehicleIds.length?sb.from("vehicles").select("id,brand,model,plate").in("id",vehicleIds):Promise.resolve({data:[],error:null}),
    serviceIds.length?sb.from("services").select("id,name").in("id",serviceIds):Promise.resolve({data:[],error:null}),
    teamIds.length?sb.from("teams").select("id,name").in("id",teamIds):Promise.resolve({data:[],error:null}),
    collabIds.length?sb.from("collaborators").select("id,name").in("id",collabIds):Promise.resolve({data:[],error:null})
  ]);
  if(req!==agendaListLoadSeq)return;
  const cm=new Map((cr.data||[]).map(x=>[x.id,x])),vm=new Map((vr.data||[]).map(x=>[x.id,x])),sm=new Map((sr.data||[]).map(x=>[x.id,x])),tm=new Map((tr.data||[]).map(x=>[x.id,x])),com=new Map((cor.data||[]).map(x=>[x.id,x]));
  const html=renderAgendaListHtml(rows,cm,vm,sm,tm,com);
  box.innerHTML=html;
  box.querySelectorAll("[data-agenda-list-day]").forEach(b=>b.onclick=()=>{agendaFocusAppointmentId=b.dataset.agendaListId||"";$("date").value=b.dataset.agendaListDay;agendaCalendarMonth=calendarMonthFromDate(b.dataset.agendaListDay);setAgendaView("day")})
}
async function loadMonthCalendar(force=false){
  const selected=$("date").value||today();
  if(!agendaCalendarMonth)agendaCalendarMonth=calendarMonthFromDate(selected);
  const month=agendaCalendarMonth,parts=month.split("-").map(Number),year=parts[0],monthNo=parts[1],first=new Date(year,monthNo-1,1),last=new Date(year,monthNo,0),days=last.getDate(),offset=first.getDay();
  const cached=agendaMonthCache.get(month);
  let counts;
  if(!force&&cached&&Date.now()-cached.at<30000){
    counts=cached.counts
  }else{
    const q=await sb.rpc("manager_month_counts",{p_month:month+"-01"});
    counts=new Map();
    if(!q.error)(q.data||[]).forEach(x=>counts.set(String(x.service_date),Number(x.appointment_count||0)));
    agendaMonthCache.set(month,{at:Date.now(),counts})
  }
  const title=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(first);
  $("caltitle").textContent=title.charAt(0).toUpperCase()+title.slice(1);
  let out="";
  for(let i=0;i<offset;i++)out+='<div style="min-height:57px"></div>';
  for(let day=1;day<=days;day++){
    const key=month+"-"+String(day).padStart(2,"0"),count=counts.get(key)||0,isSelected=key===selected,isToday=key===today();
    out+='<button type="button" data-calday="'+key+'" style="position:relative;min-height:57px;padding:7px 3px;border-radius:12px;border:1px solid '+(isSelected?'#22b7ef':isToday?'#3d6476':'#234655')+';background:'+(isSelected?'#123d50':'#102d3a')+';color:#eef7fa;text-align:center"><span style="font-weight:900;font-size:15px">'+day+'</span>'+(count?'<span style="display:block;margin:4px auto 0;min-width:23px;width:max-content;padding:2px 6px;border-radius:999px;background:#22a7dc;color:#fff;font-size:11px;font-weight:900">'+count+'</span>':'<span style="display:block;height:18px;margin-top:4px"></span>')+'</button>'
  }
  $("calgrid").innerHTML=out;
  $("calgrid").querySelectorAll("[data-calday]").forEach(b=>b.onclick=()=>{$("date").value=b.dataset.calday;agendaCalendarMonth=calendarMonthFromDate(b.dataset.calday);loadMonthCalendar(false);loadApps()})
}
function tab(x){
  const operator=currentRole==="operator";
  if(operator)x="ops";
  else if(x==="ops")x="cad";
  if((x==="fin"||x==="rep")&&!financeAllowed())x=operator?"ops":"cad";
  if(x==="set"&&currentRole!=="owner")x=operator?"ops":"cad";
  $("ops").classList.toggle("hidden",x!=="ops");
  $("cad").classList.toggle("hidden",x!=="cad");
  $("age").classList.toggle("hidden",x!=="age");
  $("fin").classList.toggle("hidden",x!=="fin");
  $("rep").classList.toggle("hidden",x!=="rep");
  $("set").classList.toggle("hidden",x!=="set");
  $("top").classList.toggle("active",x==="ops");
  $("tc").classList.toggle("active",x==="cad");
  $("ta").classList.toggle("active",x==="age");
  $("tf").classList.toggle("active",x==="fin");
  $("tr").classList.toggle("active",x==="rep");
  $("tset").classList.toggle("active",x==="set");
  if(x==="ops"){loadOperatorMonth();loadOperatorJobs(operatorSelectedDate,false)}
  if(x==="age"){
    const dateControls=$("agendaDateToolbar");
    if(dateControls){dateControls.hidden=agendaViewMode!=="day";dateControls.classList.toggle("hidden",dateControls.hidden);}
    agendaCalendarMonth=calendarMonthFromDate($("date").value||today());
    if(agendaViewMode==="month")loadMonthCalendar(false);else if(agendaViewMode==="list")loadAgendaList();else loadApps()
  }
  if(x==="fin"){if(!$("fmonth").value)$("fmonth").value=today().slice(0,7);loadFinance()}
  if(x==="rep"){setDefaultReportDates();loadManagementReport()}
  if(x==="set"){document.querySelectorAll("#set .settings-group").forEach(group=>{group.open=false});$("setpayadvanced").open=false;paymentSettingsInitialValues=null;syncPaymentSaveAvailability();loadOperationalSettings()}
}
let operatorSelectedDate=today();
let operatorCalendarMonth=operatorSelectedDate.slice(0,7)+"-01";
let operatorMonthCounts=new Map();
let operatorMonthCache=new Map();

function operatorDateLabel(iso){
  const [y,m,d]=iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long"}).format(new Date(y,m-1,d))
}
function operatorMonthTitle(iso){
  const [y,m]=iso.split("-").map(Number);
  const s=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(new Date(y,m-1,1));
  return s.charAt(0).toUpperCase()+s.slice(1)
}
function shiftOperatorMonth(delta){
  const [y,m]=operatorCalendarMonth.split("-").map(Number);
  const d=new Date(y,m-1+delta,1);
  operatorCalendarMonth=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-01";
  loadOperatorMonth()
}
async function selectOperatorDate(iso){
  const nextMonth=iso.slice(0,7)+"-01",monthChanged=nextMonth!==operatorCalendarMonth;
  operatorSelectedDate=iso;
  operatorCalendarMonth=nextMonth;
  if(monthChanged)await loadOperatorMonth(false);else renderOperatorCalendar();
  await loadOperatorJobs(iso,false)
}
async function loadOperatorMonth(force=false){
  if(currentRole!=="operator")return;
  $("opcaltitle").textContent=operatorMonthTitle(operatorCalendarMonth);
  const cached=operatorMonthCache.get(operatorCalendarMonth);
  if(!force&&cached&&Date.now()-cached.at<30000){
    operatorMonthCounts=cached.counts;
    renderOperatorCalendar();
    return
  }
  const r=await sb.rpc("operator_month_counts",{p_month:operatorCalendarMonth});
  if(r.error){
    operatorMonthCounts=new Map();
    renderOperatorCalendar();
    return
  }
  operatorMonthCounts=new Map((r.data||[]).map(x=>[String(x.service_date),Number(x.job_count||0)]));
  operatorMonthCache.set(operatorCalendarMonth,{at:Date.now(),counts:operatorMonthCounts});
  renderOperatorCalendar()
}
function renderOperatorCalendar(){
  const grid=$("opcalgrid");
  const [y,m]=operatorCalendarMonth.split("-").map(Number);
  const first=new Date(y,m-1,1),days=new Date(y,m,0).getDate(),offset=first.getDay(),cells=[];
  for(let i=0;i<offset;i++)cells.push('<div class="operator-cal-empty"></div>');
  for(let d=1;d<=days;d++){
    const iso=y+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0"),count=operatorMonthCounts.get(iso)||0;
    const cls=["operator-cal-day"];
    if(iso===operatorSelectedDate)cls.push("selected");
    if(iso===today())cls.push("today");
    if(count>0)cls.push("has-jobs");
    cells.push('<button type="button" class="'+cls.join(" ")+'" data-op-date="'+iso+'"><span>'+d+'</span>'+(count?'<b>'+count+'</b>':'')+'</button>')
  }
  grid.innerHTML=cells.join("");
  grid.querySelectorAll("[data-op-date]").forEach(b=>b.onclick=()=>selectOperatorDate(b.dataset.opDate))
}
async function loadOperatorJobs(date=operatorSelectedDate,refreshMonth=false){
  if(currentRole!=="operator")return;
  operatorSelectedDate=date||today();
  $("opday").textContent=operatorDateLabel(operatorSelectedDate);
  const box=$("opjobs");
  box.innerHTML='<div class="empty">Atualizando...</div>';
  if(refreshMonth)await loadOperatorMonth(true);
  const r=await sb.rpc("operator_jobs_for_date",{p_date:operatorSelectedDate});
  if(r.error){box.innerHTML='<div class="notice error">'+esc(fail(r.error))+'</div>';return}
  const rows=r.data||[];
  currentApps=rows.map(x=>({
    id:x.appointment_id,
    vehicle_id:x.vehicle_id,
    starts_at:x.starts_at,
    duration_minutes:x.duration_minutes,
    status:x.status,
    notes:x.notes||"",
    collaborator_id:x.collaborator_id,
    team_id:x.team_id,
    actor_collaborator_id:x.actor_collaborator_id,
    client_name:x.client_name||"Cliente",
    vehicle_brand:x.vehicle_brand||"",
    vehicle_model:x.vehicle_model||"",
    vehicle_plate:x.vehicle_plate||"",
    vehicle_year:x.vehicle_year||"",
    vehicle_color:x.vehicle_color||"",
    vehicle_label:[x.vehicle_brand,x.vehicle_model].filter(Boolean).join(" ")+(x.vehicle_plate?" • "+x.vehicle_plate:""),
    service_name:x.service_name||"Serviço",
    has_completion_photo:!!x.has_completion_photo
  }));
  const isToday=operatorSelectedDate===today();
  const active=currentApps.filter(x=>x.status!=="completed"),done=currentApps.filter(x=>x.status==="completed");
  const card=x=>{
    const action=isToday&&x.status!=="completed"&&x.status!=="cancelled"
      ?(x.status==="in_progress"
        ?'<button class="success operator-main-action" type="button" data-op-finish="'+x.id+'">Concluir serviço</button>'
        :'<button class="primary operator-main-action" type="button" data-op-start="'+x.id+'">Iniciar serviço</button>')
      :"";
    const rg=isToday?'<button class="ghost operator-rg-action" type="button" data-op-rg="'+x.id+'">📷 RG do veículo</button>':"";
    const info=!isToday?'<div class="operator-future-note">As ações Iniciar, Concluir e RG do veículo ficam disponíveis no dia do atendimento.</div>':"";
    return '<div class="item operator-job"><div class="appt-card-top"><div class="time">'+esc(apRange(x))+'</div><span class="pill status-pill">'+esc(statusLabel(x.status))+'</span></div><h3>'+esc(x.client_name)+'</h3><div class="operator-job-core"><b>'+esc(x.vehicle_label||"Veículo")+'</b><span>'+esc(x.service_name)+'</span></div>'+(x.notes?'<details class="operator-notes"><summary>Observações do atendimento</summary><div>'+esc(x.notes)+'</div></details>':'')+info+((rg||action)?'<div class="operator-job-actions">'+rg+action+'</div>':'')+'</div>'
  };
  let out=active.length?active.map(card).join(""):(done.length?'<div class="empty">Nenhum atendimento pendente nesta data.</div>':'<div class="empty">Nenhum atendimento atribuído a você nesta data.</div>');
  if(done.length)out+='<details class="operator-completed"><summary>Concluídos ('+done.length+')</summary><div>'+done.map(card).join("")+'</div></details>';
  box.innerHTML=out;
  box.querySelectorAll("[data-op-start]").forEach(b=>b.onclick=()=>operatorStartJob(b.dataset.opStart));
  box.querySelectorAll("[data-op-finish]").forEach(b=>b.onclick=()=>openCompletion(b.dataset.opFinish));
  box.querySelectorAll("[data-op-rg]").forEach(b=>b.onclick=()=>openOperatorVehicleRG(currentApps.find(x=>x.id===b.dataset.opRg)))
}
async function operatorStartJob(id){
  const b=document.querySelector('[data-op-start="'+id+'"]');
  if(b){b.disabled=true;b.textContent="Iniciando..."}
  const r=await sb.rpc("operator_start_job",{p_appointment_id:id});
  if(r.error){show("msg",fail(r.error),"error");if(b){b.disabled=false;b.textContent="Iniciar serviço"};return}
  show("msg","Atendimento iniciado.","ok");
  await loadOperatorJobs()
}
function setRGOperatorMode(on){
  const report=$("rgreport");
  if(report)report.classList.toggle("hidden",on);
  const quote=$("rgquote");
  if(quote)quote.classList.toggle("hidden",on||!currentRGIssues.some(i=>i.include_in_report!==false&&currentRGQuotes.get(String(i.id))!==null));
  const recurrence=$("rgfreq")?.closest("details");
  if(recurrence)recurrence.classList.toggle("hidden",on);
  const history=$("rghistory")?.closest("details");
  if(history)history.classList.toggle("hidden",on);
  const needsMeta=$("rgissueadd")?.closest("details")?.querySelector(".meta");
  if(needsMeta)needsMeta.classList.toggle("hidden",on);
  [$("rgiservice"),$("rgibudget"),$("rgiinclude"),$("rgishowvalue")].forEach(el=>{
    const label=el?.closest("label");
    if(label)label.classList.toggle("hidden",on)
  });
}
async function openOperatorVehicleRG(job){
  if(currentRole!=="operator"||!job?.vehicle_id)return show("msg","Veículo não disponível para este atendimento.","error");
  try{
    $("rgf").reset();show("rgmsg","");
    $("rgvid").value=job.vehicle_id;$("rgcid").value="";$("rgplanid").value="";
    setRGOperatorMode(true);
    $("rgsummary").innerHTML='<h3 style="margin:0">'+esc([job.vehicle_brand,job.vehicle_model].filter(Boolean).join(" ")||"Veículo")+'</h3><div class="meta" style="margin-top:5px">'+esc(job.vehicle_plate||"Sem placa")+(job.vehicle_year?' • '+esc(job.vehicle_year):"")+(job.vehicle_color?' • '+esc(job.vehicle_color):"")+'<br>'+esc(job.client_name||"Cliente")+'</div>';
    $("rgservice").innerHTML='<option value="">Sem serviço definido</option>';
    const pr=await sb.from("vehicle_profiles").select("*").eq("vehicle_id",job.vehicle_id).maybeSingle();
    if(pr.error)throw pr.error;
    const profile=pr.data||{},d=profile.diagnostics||{};
    currentRGPhotos=Array.isArray(profile.photos)?profile.photos.filter(p=>p&&p.path).map(p=>({...p,issue_id:p.issue_id||null,include_in_report:p.include_in_report!==false})):[];
    currentRGIssues=Array.isArray(d.issues)?d.issues.filter(i=>i&&i.id).map(i=>({...i,include_in_report:i.include_in_report!==false})):[];
    currentRGQuotes=new Map();
    $("rgbody").value=d.bodywork||"";
    $("rgglass").value=d.glass||"";
    $("rginterior").value=d.interior||"";
    $("rgprotection").value=d.protection||"";
    $("rgnotes").value=profile.notes||"";
    $("rgfreq").value="";
    toggleRGRecurrence();
    $("rgd").showModal();
    await Promise.all([renderRGIssues(),renderRGPhotos()])
  }catch(e){show("msg",fail(e),"error")}
}
