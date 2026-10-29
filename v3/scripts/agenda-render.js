function ensureCancelScopeDialog(){
  if($("cancelScopeDialog"))return;
  const d=document.createElement("dialog");
  d.id="cancelScopeDialog";
  d.innerHTML='<div class="stack" style="min-width:min(460px,86vw)"><h3 style="margin:4px 0">Cancelar agendamento recorrente</h3><div id="cancelScopeText" class="notice"></div><button id="cancelScopeSingle" type="button" class="danger">Cancelar só este agendamento</button><button id="cancelScopeSeries" type="button" class="danger">Cancelar recorrência a partir daqui</button><button id="cancelScopeBack" type="button" class="ghost">Voltar</button></div>';
  document.body.appendChild(d);
  $("cancelScopeSingle").onclick=()=>resolveCancelScope("single");
  $("cancelScopeSeries").onclick=()=>resolveCancelScope("series");
  $("cancelScopeBack").onclick=()=>resolveCancelScope(null);
  d.addEventListener("cancel",e=>{e.preventDefault();resolveCancelScope(null)})
}
function resolveCancelScope(scope){
  const d=$("cancelScopeDialog");
  if(d?.open)d.close();
  const r=cancelScopeResolver;
  cancelScopeResolver=null;
  if(r)r(scope)
}
function chooseCancelScope(x){
  if(!x?.recurring_plan_id){
    return Promise.resolve(confirm("Cancelar este agendamento?\n\nEle será mantido no histórico como Cancelado.")?"single":null)
  }
  ensureCancelScopeDialog();
  $("cancelScopeText").textContent="Este atendimento faz parte de uma recorrência. Escolha se deseja cancelar apenas este dia ou encerrar a recorrência a partir desta ocorrência.";
  $("cancelScopeDialog").showModal();
  return new Promise(resolve=>{cancelScopeResolver=resolve})
}
async function cancelAppointmentAction(x){
  const scope=await chooseCancelScope(x);
  if(!scope)return;
  const r=await sb.rpc("cancel_appointment_with_scope",{p_appointment_id:x.id,p_scope:scope});
  if(r.error)return show("msg",fail(r.error),"error");
  agendaMonthCache.clear();
  show("msg",scope==="series"?"Agendamento cancelado e recorrência encerrada a partir desta data.":"Agendamento cancelado; as próximas recorrências foram mantidas.","ok");
  await loadApps()
}

function agendaEmptyStateText(isoDate,completedCount,cancelledCount){
  if(completedCount>0||cancelledCount>0)return "Nenhum atendimento pendente nesta data.";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(isoDate||""))return "Nenhum atendimento para a data selecionada.";
  const day=isoDate.slice(8,10),month=isoDate.slice(5,7);
  return "Nenhum atendimento agendado para "+day+"/"+month+".";
}
async function loadApps(){
  const req=++agendaLoadSeq,d=$("date").value||today();
  const a=new Date(d+"T00:00:00-03:00").toISOString(),z=new Date(d+"T23:59:59.999-03:00").toISOString();
  if(agendaViewMode==="month")void loadMonthCalendar(false);
  const r=await sb.from("appointments").select("id,client_id,vehicle_id,service_id,team_id,collaborator_id,recurring_plan_id,starts_at,ends_at,duration_minutes,status,source,final_value,addon_value,notes,completed_at,cancelled_at").gte("starts_at",a).lte("starts_at",z).is("deleted_at",null).order("starts_at");
  if(req!==agendaLoadSeq)return;
  if(r.error)return show("msg",fail(r.error),"error");
  currentApps=r.data||[];
  const paymentMap=new Map(),photoMap=new Map(),ids=currentApps.map(x=>x.id),completedIds=currentApps.filter(x=>x.status==="completed").map(x=>x.id),vehicleIds=[...new Set(currentApps.map(x=>x.vehicle_id).filter(Boolean))];
  const [py,ph,vr]=await Promise.all([
    completedIds.length?sb.from("appointment_payments").select("*").in("appointment_id",completedIds):Promise.resolve({data:[],error:null}),
    completedIds.length?sb.from("appointment_completion_photos").select("*").in("appointment_id",completedIds):Promise.resolve({data:[],error:null}),
    vehicleIds.length?sb.from("vehicles").select("id,client_id,brand,model,plate,year,color").in("id",vehicleIds):Promise.resolve({data:[],error:null})
  ]);
  if(req!==agendaLoadSeq)return;
  if(!py.error)(py.data||[]).forEach(p=>paymentMap.set(p.appointment_id,p));
  if(!ph.error)(ph.data||[]).forEach(p=>photoMap.set(p.appointment_id,p));
  const dayVehicles=vr.error?[]:(vr.data||[]),vehicleMap=new Map(dayVehicles.map(v=>[v.id,v]));
  dayVehicles.forEach(v=>{
    const list=vehicles.get(v.client_id)||[],idx=list.findIndex(x=>x.id===v.id);
    if(idx>=0)list[idx]={...list[idx],...v};else list.push(v);
    vehicles.set(v.client_id,list)
  });
  const rows=currentApps,activeRows=rows.filter(x=>x.status!=="cancelled"&&x.status!=="completed"),completedRows=rows.filter(x=>x.status==="completed"),cancelledRows=rows.filter(x=>x.status==="cancelled");
  const clientMap=new Map(clients.map(c=>[c.id,c])),serviceMap=new Map(services.map(s=>[s.id,s])),collabMap=new Map(collabs.map(c=>[c.id,c])),teamMap=new Map(teams.map(t=>[t.id,t]));
  const card=x=>{
    const c=clientMap.get(x.client_id),v=vehicleMap.get(x.vehicle_id)||findVehicleLocal(x.vehicle_id),s=serviceMap.get(x.service_id),co=collabMap.get(x.collaborator_id),assignedTeam=teamMap.get(x.team_id),packageVisit=serviceIsPackage(s)&&!!x.recurring_plan_id;
    let nx=x.status==="requested"?"confirmed":x.status==="scheduled"?"in_progress":x.status==="confirmed"?"in_progress":x.status==="in_progress"?"completed":null,
      team=assignedTeam?teamDisplay(assignedTeam.id):(co?.name||(x.source==="public"?"1 equipe reservada • equipe a definir":"Equipe reservada • responsável a definir")),
      photo=photoMap.get(x.id),payment=paymentMap.get(x.id),
      primaryActionLabel=x.status==="requested"?"Aceitar solicitação":"Iniciar";
    const actionButtons=(x.status!=="completed"&&x.status!=="cancelled"?'<button class="ghost" data-edit="'+x.id+'">Editar</button>':"")+
      (nx?(nx==="completed"?'<button class="success" data-finish="'+x.id+'">Concluir</button>':'<button class="success" data-st="'+nx+'" data-id="'+x.id+'">'+esc(primaryActionLabel)+'</button>'):"")+
      (x.status!=="completed"&&x.status!=="cancelled"?'<button class="danger subtle-danger" data-st="cancelled" data-id="'+x.id+'">Cancelar</button>':"")+
      
      (x.status==="completed"&&financeAllowed()&&!packageVisit?'<button class="ghost" data-receipt="'+x.id+'">'+(payment?.status==="paid"?"Recibo":"Comprovante")+'</button>':"")+
      (x.status==="completed"&&financeAllowed()&&!packageVisit&&payment?.status!=="paid"?'<button class="success" data-pay="'+x.id+'">Confirmar pagamento</button>':"");
    const context='<div class="appt-secondary"><span>'+esc(team)+'</span>'+(financeAllowed()?'<span>'+esc(packageVisit?"Incluído no pacote":money(x.final_value))+'</span>':"")+'</div>';
    return '<div class="item appt-card" data-detail="'+x.id+'" style="cursor:pointer"><div class="appt-card-top"><div class="time">'+esc(apRange(x))+'</div><span class="pill status-pill">'+esc(statusLabel(x.status))+'</span></div><h3>'+esc(c?.name||"Cliente")+'</h3><div class="appt-core"><b>'+esc(v?v.brand+" "+v.model:"Veículo")+'</b><span>'+esc(s?.name||"Serviço")+'</span></div><div class="appt-tap-hint">Toque no cartão para ver detalhes</div><details class="appt-actions"><summary>Ações e informações</summary>'+context+'<div class="actions">'+actionButtons+'</div></details></div>'
  };
  let out=activeRows.length?activeRows.map(card).join(""):'<div class="empty">'+esc(agendaEmptyStateText(d,completedRows.length,cancelledRows.length))+'</div>';
  if(completedRows.length)out+='<details style="margin-top:12px"><summary class="meta" style="cursor:pointer;font-weight:900">Concluídos do dia ('+completedRows.length+')</summary><div style="margin-top:9px">'+completedRows.map(card).join("")+'</div></details>';
  if(cancelledRows.length)out+='<details style="margin-top:12px"><summary class="meta" style="cursor:pointer;font-weight:900">Cancelados ('+cancelledRows.length+')</summary><div style="margin-top:9px">'+cancelledRows.map(card).join("")+'</div></details>';
  $("apps").innerHTML=out;

  document.querySelectorAll("[data-detail]").forEach(card=>card.onclick=e=>{if(e.target.closest("button,summary,a,input,select,textarea"))return;openAppointmentDetail(card.dataset.detail)});
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=e=>{e.stopPropagation();openEditAppt(b.dataset.edit)});
  
  document.querySelectorAll("[data-receipt]").forEach(b=>b.onclick=e=>{e.stopPropagation();openReceipt(b.dataset.receipt)});
  document.querySelectorAll("[data-pay]").forEach(b=>b.onclick=e=>{e.stopPropagation();openPayment(b.dataset.pay)});
  document.querySelectorAll("[data-finish]").forEach(b=>b.onclick=e=>{e.stopPropagation();openCompletion(b.dataset.finish)});
  document.querySelectorAll("[data-st]").forEach(b=>b.onclick=async e=>{
    e.stopPropagation();
    if(b.dataset.st==="cancelled"){
      const x=currentApps.find(a=>String(a.id)===String(b.dataset.id));
      if(x)await cancelAppointmentAction(x);
      return
    }
    let p={status:b.dataset.st};
    if(b.dataset.st==="completed")p.completed_at=new Date().toISOString();
    let u=await sb.from("appointments").update(p).eq("id",b.dataset.id);
    if(u.error)return show("msg",fail(u.error),"error");
    agendaMonthCache.clear();
    if(b.dataset.st==="completed")waterCounterLoadedAt=0;
    await loadApps()
  });
  if(agendaFocusAppointmentId){
    const focusId=agendaFocusAppointmentId;
    agendaFocusAppointmentId="";
    requestAnimationFrame(()=>{
      const card=document.querySelector('[data-detail="'+CSS.escape(focusId)+'"]');
      if(!card)return;
      let parent=card.parentElement;
      while(parent&&parent!==$("apps")){
        if(parent.tagName==="DETAILS")parent.open=true;
        parent=parent.parentElement
      }
      const actions=card.querySelector(".appt-actions");if(actions)actions.open=true;
      card.scrollIntoView({behavior:"smooth",block:"center"});
      const prevOutline=card.style.outline,prevOffset=card.style.outlineOffset;
      card.style.outline="2px solid #22b7ef";card.style.outlineOffset="2px";
      setTimeout(()=>{card.style.outline=prevOutline;card.style.outlineOffset=prevOffset},2200)
    })
  }
  void loadWaterCounter(false)
}

boot();
