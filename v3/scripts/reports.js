let currentManagementReport=null;
function firstDayCurrentMonth(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-01"}
function setDefaultReportDates(){if(!$("rstart").value)$("rstart").value=firstDayCurrentMonth();if(!$("rend").value)$("rend").value=today()}
function reportRange(){
  setDefaultReportDates();const start=$("rstart").value,end=$("rend").value;if(!start||!end||start>end)throw Error("Informe um período válido.");
  const next=new Date(end+"T12:00:00");next.setDate(next.getDate()+1);const nextDate=next.getFullYear()+"-"+String(next.getMonth()+1).padStart(2,"0")+"-"+String(next.getDate()).padStart(2,"0");
  return{start,end,startIso:new Date(start+"T00:00:00-03:00").toISOString(),nextIso:new Date(nextDate+"T00:00:00-03:00").toISOString()}
}
function aggregateBy(rows,keyFn){
  const m=new Map();rows.forEach(r=>{const k=keyFn(r),x=m.get(k)||{key:k,count:0,revenue:0,vehicles:new Set()};x.count++;x.revenue+=Number(r.final_value||0);if(r.vehicle_id)x.vehicles.add(r.vehicle_id);m.set(k,x)});return [...m.values()]
}
function reportBar(value,max){const pct=max>0?Math.max(4,Math.round(Number(value||0)/max*100)):0;return '<div style="height:7px;border-radius:999px;background:#12384a;margin-top:7px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:#109fd9"></div></div>'}
async function loadManagementReport(){
  if(!financeAllowed())return;
  try{
    const range=reportRange(),[ar,rr]=await Promise.all([
      sb.from("appointments").select("id,client_id,vehicle_id,service_id,team_id,collaborator_id,starts_at,completed_at,status,final_value").is("deleted_at",null).gte("starts_at",range.startIso).lt("starts_at",range.nextIso).order("starts_at"),
      sb.from("recurring_plans").select("id,client_id,vehicle_id,service_id,frequency,weekday,local_time,active").eq("active",true)
    ]);
    if(ar.error)throw ar.error;if(rr.error)throw rr.error;
    const all=ar.data||[],completed=all.filter(x=>x.status==="completed"),cancelled=all.filter(x=>x.status==="cancelled"),clientIds=[...new Set(all.map(x=>x.client_id))],vehicleIds=[...new Set(all.map(x=>x.vehicle_id))],serviceIds=[...new Set([...all.map(x=>x.service_id),...(rr.data||[]).map(x=>x.service_id)])],collabIds=[...new Set(completed.map(x=>x.collaborator_id).filter(Boolean))],teamIds=[...new Set(completed.map(x=>x.team_id).filter(Boolean))];
    const [cr,vr,sr,cor,trr]=await Promise.all([
      clientIds.length?sb.from("clients").select("id,name").in("id",clientIds):Promise.resolve({data:[],error:null}),
      vehicleIds.length?sb.from("vehicles").select("id,brand,model,plate").in("id",vehicleIds):Promise.resolve({data:[],error:null}),
      serviceIds.length?sb.from("services").select("id,name").in("id",serviceIds):Promise.resolve({data:[],error:null}),
      collabIds.length?sb.from("collaborators").select("id,name").in("id",collabIds):Promise.resolve({data:[],error:null}),
      teamIds.length?sb.from("teams").select("id,name").in("id",teamIds):Promise.resolve({data:[],error:null})
    ]);
    if(cr.error)throw cr.error;if(vr.error)throw vr.error;if(sr.error)throw sr.error;if(cor.error)throw cor.error;if(trr.error)throw trr.error;
    const cm=new Map((cr.data||[]).map(x=>[x.id,x])),vm=new Map((vr.data||[]).map(x=>[x.id,x])),sm=new Map((sr.data||[]).map(x=>[x.id,x])),com=new Map((cor.data||[]).map(x=>[x.id,x])),tmMap=new Map((trr.data||[]).map(x=>[x.id,x]));
    const revenue=completed.reduce((s,x)=>s+Number(x.final_value||0),0),uniqueVehicles=new Set(completed.map(x=>x.vehicle_id)).size,uniqueClients=new Set(completed.map(x=>x.client_id)).size,ticket=completed.length?revenue/completed.length:0;
    const byService=aggregateBy(completed,x=>x.service_id).map(x=>({...x,name:sm.get(x.key)?.name||"Serviço"})).sort((a,b)=>b.revenue-a.revenue||b.count-a.count);
    const byClient=aggregateBy(completed,x=>x.client_id).map(x=>({...x,name:cm.get(x.key)?.name||"Cliente"})).sort((a,b)=>b.count-a.count||b.revenue-a.revenue);
    const byClientVehicle=new Map();
    completed.forEach(a=>{
      let vehiclesForClient=byClientVehicle.get(a.client_id);
      if(!vehiclesForClient){vehiclesForClient=new Map();byClientVehicle.set(a.client_id,vehiclesForClient)}
      let vehicle=vehiclesForClient.get(a.vehicle_id);
      if(!vehicle){vehicle={vehicleId:a.vehicle_id,count:0,dates:[]};vehiclesForClient.set(a.vehicle_id,vehicle)}
      vehicle.count++;
      vehicle.dates.push(a.starts_at);
    });
    const byCollab=aggregateBy(completed,x=>x.team_id?"team:"+x.team_id:(x.collaborator_id?"collab:"+x.collaborator_id:"__none__")).map(x=>{let name="Equipe não definida";if(x.key.startsWith("team:"))name=tmMap.get(x.key.slice(5))?.name||"Equipe";else if(x.key.startsWith("collab:"))name="Individual: "+(com.get(x.key.slice(7))?.name||"Colaborador");return{...x,name}}).sort((a,b)=>b.count-a.count||b.revenue-a.revenue);
    const recurrenceGroups=[{key:"weekly",name:"Semanal",count:0},{key:"biweekly",name:"Quinzenal",count:0},{key:"monthly",name:"Mensal",count:0}];(rr.data||[]).forEach(p=>{const g=recurrenceGroups.find(x=>x.key===p.frequency);if(g)g.count++});
    currentManagementReport={range,completed,cancelled,revenue,uniqueVehicles,uniqueClients,ticket,byService,byClient,byClientVehicle,byCollab,recurrenceGroups,recurring:rr.data||[],maps:{cm,vm,sm,com,tmMap}};
    $("rcompleted").textContent=String(completed.length);$("rvehicles").textContent=String(uniqueVehicles);$("rclients").textContent=String(uniqueClients);$("rrevenue").textContent=money(revenue);$("rticket").textContent=money(ticket);$("rcancelled").textContent=String(cancelled.length);
    $("rclientcount").textContent="("+uniqueClients+")";
    $("rrecurrencecount").textContent="("+(rr.data||[]).length+")";
    const maxService=Math.max(0,...byService.map(x=>x.revenue));
    $("rservices").innerHTML=byService.length?byService.map(x=>'<div class="item" style="margin-top:8px"><div class="actions"><div style="flex:3"><b>'+esc(financePlanDisplayName(x.name))+'</b><div class="meta">'+x.count+' serviço'+(x.count===1?'':'s')+' • '+x.vehicles.size+' veículo'+(x.vehicles.size===1?'':'s')+'</div></div><div style="font-weight:900">'+esc(money(x.revenue))+'</div></div>'+reportBar(x.revenue,maxService)+'</div>').join(""):'<div class="empty">Nenhum serviço concluído no período.</div>';
    const maxClient=Math.max(0,...byClient.map(x=>x.count));
    $("rclientlist").innerHTML=byClient.length?byClient.map((x,i)=>{
      const vehiclesForClient=[...(byClientVehicle.get(x.key)||new Map()).values()];
      const details=vehiclesForClient.map(v=>{
        const vehicle=vm.get(v.vehicleId),name=vehicle?[vehicle.brand,vehicle.model,vehicle.plate].filter(Boolean).join(" • "):"Veículo não identificado";
        const dates=v.dates.map(date=>new Date(date).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"})).join(", ");
        return '<div class="meta" style="margin:6px 0"><b>'+esc(name)+'</b> • '+v.count+' atendimento'+(v.count===1?'':'s')+'<div>'+esc(dates)+'</div></div>';
      }).join("");
      return '<div class="item" style="margin-top:8px"><b>'+(i+1)+'. '+esc(x.name)+'</b><div class="meta">'+x.count+' atendimento'+(x.count===1?'':'s')+' • '+x.vehicles.size+' veículo'+(x.vehicles.size===1?'':'s')+'</div><details style="margin-top:8px"><summary style="cursor:pointer">Ver veículos e datas</summary>'+details+'</details></div>';
    }).join(""):'<div class="empty">Nenhum cliente atendido no período.</div>';
    const maxCollab=Math.max(0,...byCollab.map(x=>x.count));
    $("rcollabs").innerHTML=byCollab.length?byCollab.map(x=>'<div class="item" style="margin-top:8px"><div class="actions"><div style="flex:3"><b>'+esc(x.name)+'</b><div class="meta">'+x.count+' serviço'+(x.count===1?'':'s')+' • '+(completed.length?Math.round(x.count/completed.length*100):0)+'% dos concluídos</div></div><div style="font-weight:900">'+esc(money(x.revenue))+'</div></div>'+reportBar(x.count,maxCollab)+'</div>').join(""):'<div class="empty">Nenhum serviço concluído no período.</div>';
    const totalRec=(rr.data||[]).length,maxRec=Math.max(0,...recurrenceGroups.map(x=>x.count));
    $("rrecurrence").innerHTML='<div class="item"><div class="meta">Total de recorrências ativas</div><div class="time">'+totalRec+'</div></div>'+recurrenceGroups.map(x=>'<div class="item" style="margin-top:8px"><div class="actions"><b>'+esc(x.name)+'</b><b>'+x.count+'</b></div>'+reportBar(x.count,maxRec)+'</div>').join("")
  }catch(e){show("msg",fail(e),"error")}
}
async function generateManagementReportPdf(){
  if(!financeAllowed())return;
  try{
    await loadManagementReport();const d=currentManagementReport;if(!d)return;
    const {jsPDF}=window.jspdf||{};if(!jsPDF)throw Error("Gerador de PDF indisponível.");
    const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"}),m=18,w=174;let y=18;
    const page=(need)=>{if(y+need>280){doc.addPage();y=18}};
    const line=(label,value)=>{page(7);doc.setFont("helvetica","bold");doc.text(label,m,y);doc.setFont("helvetica","normal");doc.text(String(value),70,y);y+=7};
    const section=title=>{page(14);y+=4;doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(20,55,72);doc.text(title,m,y);y+=7;doc.setDrawColor(210);doc.line(m,y,192,y);y+=6;doc.setFontSize(9.5);doc.setTextColor(35)};
    doc.setFont("helvetica","bold");doc.setFontSize(20);doc.setTextColor(23,49,64);doc.text("VAPOREASY",m,y);y+=8;doc.setFontSize(13);doc.text("Relatório de gestão",m,y);y+=8;doc.setFontSize(9.5);doc.setFont("helvetica","normal");doc.setTextColor(60);doc.text("Período: "+new Intl.DateTimeFormat("pt-BR").format(new Date(d.range.start+"T12:00:00"))+" a "+new Intl.DateTimeFormat("pt-BR").format(new Date(d.range.end+"T12:00:00")),m,y);y+=10;
    section("Resumo");line("Serviços concluídos",d.completed.length);line("Veículos atendidos",d.uniqueVehicles);line("Clientes atendidos",d.uniqueClients);line("Faturamento",money(d.revenue));line("Ticket médio",money(d.ticket));line("Cancelamentos",d.cancelled.length);
    section("Faturamento por serviço");if(!d.byService.length){doc.text("Sem serviços concluídos.",m,y);y+=7}else d.byService.forEach(x=>{page(8);doc.setFont("helvetica","bold");doc.text(financePlanDisplayName(x.name),m,y);doc.setFont("helvetica","normal");doc.text(x.count+" atendimento(s) • "+money(x.revenue),105,y);y+=7});
    section("Todos os clientes atendidos");
    if(!d.byClient.length){doc.text("Sem clientes atendidos.",m,y);y+=7}
    else for(const [i,x] of d.byClient.entries()){
      const clientLine=doc.splitTextToSize((i+1)+". "+x.name+" • "+x.count+" atendimento(s)",w);
      page(clientLine.length*4.5+7);
      doc.setFont("helvetica","bold");doc.text(clientLine,m,y);y+=clientLine.length*4.5+1;
      const vehiclesForClient=[...(d.byClientVehicle.get(x.key)||new Map()).values()];
      for(const v of vehiclesForClient){
        const vehicle=d.maps.vm.get(v.vehicleId);
        const vehicleName=vehicle?[vehicle.brand,vehicle.model,vehicle.plate].filter(Boolean).join(" • "):"Veículo não identificado";
        const days=v.dates.map(date=>new Date(date).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"})).join(", ");
        const lines=doc.splitTextToSize(vehicleName+" — "+v.count+" atendimento(s) — "+days,w-5);
        page(lines.length*4+4);
        doc.setFont("helvetica","normal");doc.text(lines,m+4,y);y+=lines.length*4+2;
      }
      y+=2;
    }
    section("Produtividade por equipe / responsável");if(!d.byCollab.length){doc.text("Sem serviços concluídos.",m,y);y+=7}else d.byCollab.forEach(x=>{page(8);doc.setFont("helvetica","bold");doc.text(x.name,m,y);doc.setFont("helvetica","normal");doc.text(x.count+" serviço(s) • "+money(x.revenue),105,y);y+=7});
    section("Recorrências ativas");d.recurrenceGroups.forEach(x=>line(x.name,x.count));line("Total ativo",d.recurring.length);
    page(18);y+=5;doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.setTextColor(100);doc.text("Relatório interno de gestão gerado pelo sistema Vaporeasy.",m,y);
    const file="relatorio-gestao-vaporeasy-"+d.range.start+"-a-"+d.range.end+".pdf",blob=doc.output("blob"),pdfFile=new File([blob],file,{type:"application/pdf"});
    if(navigator.share&&navigator.canShare?.({files:[pdfFile]})){await navigator.share({title:"Relatório de gestão Vaporeasy",files:[pdfFile]});return}
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);show("msg","Relatório de gestão gerado em PDF.","ok")
  }catch(e){if(e?.name!=="AbortError")show("msg",fail(e),"error")}
}
