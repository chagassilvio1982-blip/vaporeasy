let currentFinanceMonthReport=null;
function financeMonthKeys(){
  const m=$("fmonth").value||today().slice(0,7),p=m.split("-").map(Number),y=p[0],mo=p[1],next=mo===12?(y+1)+"-01":y+"-"+String(mo+1).padStart(2,"0");
  return{month:m,startDate:m+"-01",nextDate:next+"-01",startIso:new Date(m+"-01T00:00:00-03:00").toISOString(),nextIso:new Date(next+"-01T00:00:00-03:00").toISOString()}
}
function financeEntityMaps(rows){
  const cm=new Map(),vm=new Map(),sm=new Map();(rows.clients||[]).forEach(x=>cm.set(x.id,x));(rows.vehicles||[]).forEach(x=>vm.set(x.id,x));(rows.services||[]).forEach(x=>sm.set(x.id,x));return{cm,vm,sm}
}
function financeReceiptGroupCards(apps,payMap,maps,paid=false){
  const groups=new Map();
  for(const a of apps){
    if(!a?.client_id||!a?.completed_at)continue;
    const isPaid=payMap.get(a.id)?.status==="paid";
    if(paid!==isPaid)continue;
    const key=a.client_id+"|"+agendaLocalDateKey(a.completed_at);
    const g=groups.get(key)||[];g.push(a);groups.set(key,g)
  }
  return [...groups.values()].filter(g=>g.length>1).map(g=>{
    const first=g[0],cl=maps.cm.get(first.client_id),date=agendaLocalDateKey(first.completed_at),total=g.reduce((sum,a)=>sum+Number(payMap.get(a.id)?.amount??a.final_value??0),0),ids=g.map(a=>a.id).join(",");
    return '<div class="item" style="margin-top:8px;border-color:#2b718e;background:#0b2634"><div style="font-weight:950;font-size:16px">'+esc(cl?.name||"Cliente")+' · '+g.length+' veículos</div><div class="meta" style="margin-top:4px">Documento conjunto de '+esc(new Intl.DateTimeFormat("pt-BR").format(new Date(date+"T12:00:00")))+' · Total '+esc(money(total))+'</div><button type="button" class="primary" style="width:100%;margin-top:10px" data-fin-group="'+esc(ids)+'">'+(paid?'Recibo conjunto':'Comprovante conjunto')+' ('+g.length+' veículos)</button></div>'
  }).join("")
}

function monthKeysFromValue(month){
  if(!/^\d{4}-\d{2}$/.test(String(month||"")))throw Error("Mês de referência inválido.");
  const [y,mo]=month.split("-").map(Number);
  if(mo<1||mo>12)throw Error("Mês de referência inválido.");
  const next=mo===12?(y+1)+"-01":y+"-"+String(mo+1).padStart(2,"0");
  return{month,startDate:month+"-01",nextDate:next+"-01",startIso:new Date(month+"-01T00:00:00-03:00").toISOString(),nextIso:new Date(next+"-01T00:00:00-03:00").toISOString()}
}
function monthlyCompetenceLabel(month){
  const d=new Date(month+"-01T12:00:00");
  const s=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(d);
  return s.charAt(0).toUpperCase()+s.slice(1)
}
function financeMonthlyClientCards(apps,maps,k){
  const groups=new Map();
  (apps||[]).forEach(a=>{
    if(!a?.client_id||!a?.completed_at)return;
    const g=groups.get(a.client_id)||[];g.push(a);groups.set(a.client_id,g)
  });
  return [...groups.entries()].sort((a,b)=>(maps.cm.get(a[0])?.name||"").localeCompare(maps.cm.get(b[0])?.name||"","pt-BR")).map(([clientId,rows])=>{
    const cl=maps.cm.get(clientId),total=rows.reduce((sum,a)=>sum+Number(a.final_value||0),0);
    return '<div class="item" style="margin-top:8px;border-color:#31576a"><div class="actions" style="align-items:flex-start"><div style="flex:3"><div style="font-weight:950;font-size:16px">'+esc(cl?.name||"Cliente")+'</div><div class="meta">'+rows.length+' serviço'+(rows.length===1?"":"s")+' concluído'+(rows.length===1?"":"s")+' • '+esc(monthlyCompetenceLabel(k.month))+'</div></div><div style="font-weight:900">'+esc(money(total))+'</div></div><button type="button" class="ghost" style="width:100%;margin-top:9px" data-fin-month-client="'+esc(clientId)+'" data-fin-month="'+esc(k.month)+'">Documento mensal deste cliente</button></div>'
  }).join("")
}
function monthlyReceiptSnapshotModel(row){
  const s=row?.snapshot;
  if(!s||typeof s!=="object"||Number(s.snapshotVersion||0)!==1)return null;
  return {...s,isMonthly:true,isSnapshot:true,snapshotId:row.id||null,issuedAt:row.issued_at||s.issuedAt||null}
}
async function getMonthlyReceiptSnapshot(clientId,month){
  const r=await sb.from("monthly_receipt_snapshots")
    .select("id,client_id,competence_month,snapshot,issued_at,issued_by")
    .eq("client_id",clientId)
    .eq("competence_month",month+"-01")
    .maybeSingle();
  if(r.error)throw r.error;
  return monthlyReceiptSnapshotModel(r.data)
}
function monthlyReceiptSnapshotPayload(g){
  const bank=g.bank||{};
  return{
    snapshotVersion:1,
    isMonthly:true,
    client:{id:g.client?.id||null,name:g.client?.name||"Cliente"},
    bank:{
      business_name:bank.business_name||"Vaporeasy",
      account_holder:bank.account_holder||"",
      bank_name:bank.bank_name||"",
      branch:bank.branch||"",
      account_number:bank.account_number||"",
      pix_key:bank.pix_key||"",
      pix_key_type:bank.pix_key_type||"",
      receipt_footer:bank.receipt_footer||""
    },
    month:g.month,
    competenceLabel:g.competenceLabel,
    apps:(g.apps||[]).map(a=>({id:a.id})),
    vehicles:(g.vehicles||[]).map(v=>({
      vehicle:v.vehicle?{id:v.vehicle.id||null,brand:v.vehicle.brand||"",model:v.vehicle.model||"",plate:v.vehicle.plate||""}:null,
      count:Number(v.count||0),
      dates:[...(v.dates||[])],
      services:(v.services||[]).map(s=>({name:s.name||"Serviço",count:Number(s.count||0)})),
      total:Number(v.total||0),
      gross:Number(v.gross||0),
      discount:Number(v.discount||0)
    })),
    total:Number(g.total||0),
    gross:Number(g.gross||0),
    discount:Number(g.discount||0),
    allPaid:true,
    nonePaid:false,
    mixed:false,
    methods:[...(g.methods||[])],
    paidAt:g.paidAt?(g.paidAt instanceof Date?g.paidAt.toISOString():String(g.paidAt)):null,
    waterForGroup:Number(g.waterForGroup||0)
  }
}
async function ensureMonthlyReceiptSnapshot(g){
  if(!g?.allPaid||g.isSnapshot)return g;
  const clientId=g.client?.id;
  if(!clientId||!currentUserId)throw Error("Não foi possível identificar o cliente ou o usuário para emitir o recibo mensal.");
  const existing=await getMonthlyReceiptSnapshot(clientId,g.month);
  if(existing)return existing;
  const payload=monthlyReceiptSnapshotPayload(g);
  const r=await sb.from("monthly_receipt_snapshots").insert({
    client_id:clientId,
    competence_month:g.month+"-01",
    snapshot:payload,
    issued_by:currentUserId
  }).select("id,client_id,competence_month,snapshot,issued_at,issued_by").single();
  if(r.error){
    if(r.error.code==="23505"){
      const concurrent=await getMonthlyReceiptSnapshot(clientId,g.month);
      if(concurrent)return concurrent
    }
    throw r.error
  }
  return monthlyReceiptSnapshotModel(r.data)||{...payload,isMonthly:true,isSnapshot:true,issuedAt:r.data?.issued_at||new Date().toISOString()}
}
async function getMonthlyClientReceiptData(clientId,month){
  if(!financeAllowed())throw Error("Seu nível de acesso não permite visualizar documentos financeiros.");
  const k=monthKeysFromValue(month);
  const frozen=await getMonthlyReceiptSnapshot(clientId,k.month);
  if(frozen)return frozen;
  const ar=await sb.from("appointments")
    .select("id,client_id,vehicle_id,service_id,completed_at,starts_at,base_value,addon_value,discount_amount,final_value")
    .eq("client_id",clientId)
    .eq("status","completed")
    .is("deleted_at",null)
    .gte("starts_at",k.startIso)
    .lt("starts_at",k.nextIso)
    .order("starts_at",{ascending:true});
  if(ar.error)throw ar.error;
  const apps=ar.data||[];
  if(!apps.length)throw Error("Não há serviços concluídos para este cliente no mês selecionado.");
  const vehicleIds=[...new Set(apps.map(x=>x.vehicle_id).filter(Boolean))],serviceIds=[...new Set(apps.map(x=>x.service_id).filter(Boolean))],appIds=apps.map(x=>x.id);
  const [cr,vr,sr,pr,bs]=await Promise.all([
    sb.from("clients").select("id,name").eq("id",clientId).single(),
    vehicleIds.length?sb.from("vehicles").select("id,brand,model,plate").in("id",vehicleIds):Promise.resolve({data:[],error:null}),
    serviceIds.length?sb.from("services").select("id,name").in("id",serviceIds):Promise.resolve({data:[],error:null}),
    appIds.length?sb.from("appointment_payments").select("appointment_id,status,amount,payment_method,paid_at").in("appointment_id",appIds):Promise.resolve({data:[],error:null}),
    sb.from("business_payment_settings").select("*").eq("id",1).single()
  ]);
  if(cr.error)throw cr.error;if(vr.error)throw vr.error;if(sr.error)throw sr.error;if(pr.error)throw pr.error;if(bs.error)throw bs.error;
  const vm=new Map((vr.data||[]).map(x=>[x.id,x])),sm=new Map((sr.data||[]).map(x=>[x.id,x])),pm=new Map((pr.data||[]).map(x=>[x.appointment_id,x])),vg=new Map();
  let total=0,gross=0,discount=0;
  for(const a of apps){
    const p=pm.get(a.id),final=Number(p?.status==="paid"?(p.amount??a.final_value):a.final_value||0),disc=Number(a.discount_amount||0),g=Number(a.base_value||0)+Number(a.addon_value||0);
    total+=final;gross+=g;discount+=disc;
    const key=a.vehicle_id||"unknown",row=vg.get(key)||{vehicle:vm.get(a.vehicle_id)||null,count:0,dates:[],serviceCounts:new Map(),total:0,gross:0,discount:0};
    row.count++;row.total+=final;row.gross+=g;row.discount+=disc;row.dates.push(agendaLocalDateKey(a.starts_at));
    const service=sm.get(a.service_id)?.name||"Serviço";row.serviceCounts.set(service,(row.serviceCounts.get(service)||0)+1);vg.set(key,row)
  }
  const vehicles=[...vg.values()].map(row=>({...row,dates:[...new Set(row.dates)].sort(),services:[...row.serviceCounts.entries()].map(([name,count])=>({name,count}))}));
  const statuses=apps.map(a=>pm.get(a.id)?.status==="paid"),allPaid=statuses.every(Boolean),nonePaid=statuses.every(x=>!x),methods=[...new Set(apps.map(a=>pm.get(a.id)?.payment_method).filter(Boolean))];
  const paidDates=apps.map(a=>pm.get(a.id)?.paid_at).filter(Boolean).map(x=>new Date(x)).sort((a,b)=>b-a);
  return{
    isMonthly:true,isSnapshot:false,client:cr.data,bank:bs.data,month:k.month,competenceLabel:monthlyCompetenceLabel(k.month),startIso:k.startIso,nextIso:k.nextIso,
    apps,vehicles,total,gross,discount,allPaid,nonePaid,mixed:!allPaid&&!nonePaid,methods,paidAt:paidDates[0]||null,
    waterForGroup:apps.length*WATER_PER_COMPLETED_SERVICE
  }
}
function monthlyServiceSummary(v){
  return (v.services||[]).map(x=>x.name+(x.count>1?" × "+x.count:"")).join(" • ")||"Serviço"
}
function monthlyReceiptHtml(g){
  const rows=g.vehicles.map(v=>{
    const veh=v.vehicle?([v.vehicle.brand,v.vehicle.model].filter(Boolean).join(" ")+(v.vehicle.plate?" • "+v.vehicle.plate:"")):"Veículo";
    const qty=v.count+" estética"+(v.count===1?"":"s")+" realizada"+(v.count===1?"":"s");
    const dates=v.dates.map(d=>new Intl.DateTimeFormat("pt-BR").format(new Date(d+"T12:00:00"))).join(", ");
    const vehicleDiscount=(g.vehicles.length>1&&v.discount>0)?'<div style="margin-top:6px;color:#7d4d28;font-size:12px;font-weight:600">Desconto neste veículo: − '+esc(money(v.discount))+'</div>':'';
    return '<div class="receipt-box" style="grid-column:1/-1;overflow-wrap:anywhere;font-size:14px;font-weight:600;line-height:1.45">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div style="font-size:16px;font-weight:800;color:#172832">'+esc(veh)+'</div><div style="font-size:16px;font-weight:800;color:#172832;white-space:nowrap">'+esc(money(v.total))+'</div></div>'+
      '<div style="margin-top:8px;color:#385665;font-size:14px;font-weight:800">'+esc(qty)+'</div>'+
      '<div style="margin-top:5px;color:#53656f;font-size:12px;font-weight:600">'+esc(monthlyServiceSummary(v))+'</div>'+
      '<div style="margin-top:4px;color:#71808a;font-size:12px;font-weight:500">Datas: '+esc(dates)+'</div>'+vehicleDiscount+
    '</div>'
  }).join("");
  const payBlock='<div class="receipt-pay" style="overflow-wrap:anywhere;font-family:inherit;font-size:13px;line-height:1.45">'+
    '<span class="pending-pill" style="font-family:inherit;font-weight:800">PAGAMENTO A CONFIRMAR</span>'+
    '<div style="margin-top:10px"><b style="font-weight:700">Chave Pix:</b> '+esc(g.bank.pix_key||"Não cadastrada")+'</div>'+
    '<div style="margin-top:8px"><b style="font-weight:700">Banco:</b> '+esc(g.bank.bank_name||"Não informado")+'</div>'+
    (g.bank.branch?'<div style="margin-top:8px"><b style="font-weight:700">Agência:</b> '+esc(g.bank.branch)+'</div>':'')+
    (g.bank.account_number?'<div style="margin-top:8px"><b style="font-weight:700">Conta:</b> '+esc(g.bank.account_number)+'</div>':'')+
    '<div style="margin-top:8px"><b style="font-weight:700">Favorecido:</b> '+esc(g.bank.account_holder||"Não informado")+'</div>'+
    '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #d7e1e6;font-weight:600;color:#334b57">Após o pagamento, envie o comprovante para confirmarmos o recebimento.</div>'+
  '</div>';
  const impactText=g.apps.length===1
    ?'Este atendimento representa uma economia estimada de <b>'+esc(new Intl.NumberFormat("pt-BR").format(g.waterForGroup))+' litros de água</b>.'
    :'Os '+g.apps.length+' atendimentos deste mês representam uma economia estimada de <b>'+esc(new Intl.NumberFormat("pt-BR").format(g.waterForGroup))+' litros de água</b>.';
  return '<div class="receipt-sheet" style="font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">'+
    '<div class="receipt-head" style="flex-wrap:wrap;align-items:flex-start">'+
      '<img src="'+BRAND_LOGO+'" alt="Vaporeasy" style="width:180px;max-width:100%;height:auto">'+
      '<div style="text-align:right"><div class="receipt-title" style="font-family:inherit;font-size:20px;font-weight:800;line-height:1.25">COMPROVANTE DE ATENDIMENTO</div><div class="receipt-muted" style="margin-top:4px;font-family:inherit;font-size:12px;font-weight:500">Referência · '+esc(g.competenceLabel)+'</div></div>'+
    '</div>'+
    '<div class="receipt-grid" style="margin-top:18px">'+
      '<div class="receipt-box" style="grid-column:1/-1;overflow-wrap:anywhere;font-size:14px;font-weight:600;line-height:1.4"><b style="font-size:11px;font-weight:800;color:#53656f;letter-spacing:.15px">CLIENTE</b>'+esc(g.client?.name||"Cliente")+'</div>'+
      rows+
    '</div>'+
    '<div class="receipt-lines" style="font-size:14px">'+
      (g.discount>0?'<div class="receipt-line"><span style="font-weight:500">Descontos concedidos no período</span><b style="font-weight:700;color:#7d4d28">− '+esc(money(g.discount))+'</b></div>':'')+
    '</div>'+
    '<div class="receipt-total" style="font-family:inherit;font-size:17px;font-weight:800"><span>Total do mês</span><span style="font-size:27px;font-weight:900">'+esc(money(g.total))+'</span></div>'+
    payBlock+
    '<div class="receipt-water" style="margin-top:20px"><div style="font-size:10px;color:#71808a;font-weight:800;letter-spacing:.8px">IMPACTO POSITIVO</div><div style="margin-top:8px;color:#4e6069;font-size:12.5px;font-weight:400;line-height:1.5">'+impactText+'</div></div>'+
    '<div style="margin-top:20px;padding-top:15px;border-top:1px solid #d7e1e6;text-align:center;color:#40525a;font-size:13px;font-weight:600;line-height:1.45">Obrigado por escolher a Vaporeasy.</div>'+
  '</div>'
}
async function monthlyReceiptCanvas(g){
  const width=1080,pad=82,right=width-pad,cv=document.createElement("canvas");cv.width=width;cv.height=1;let ctx=cv.getContext("2d");
  function wrapped(text,x,y,w,font,color,lineHeight=34){
    ctx.font=font;
    const words=String(text).split(/\s+/).flatMap(word=>{
      const chunks=[];let part="";
      for(const char of word){if(part&&ctx.measureText(part+char).width>w){chunks.push(part);part=""}part+=char}
      if(part)chunks.push(part);return chunks
    });
    return canvasText(ctx,words.join(" "),x,y,w,lineHeight,font,color)
  }
  function content(draw){
    let y=238;
    y=wrapped("COMPROVANTE DE ATENDIMENTO",pad,y,width-pad*2,"800 40px system-ui, sans-serif","#172832",46)+10;
    y=wrapped("Referência · "+g.competenceLabel,pad,y,width-pad*2,"500 22px system-ui, sans-serif","#647581",30)+26;
    y=wrapped("CLIENTE",pad,y,width-pad*2,"800 15px system-ui, sans-serif","#71808a",27);
    y=wrapped(g.client?.name||"Cliente",pad,y,width-pad*2,"700 25px system-ui, sans-serif","#172832",33)+24;
    for(const v of g.vehicles){
      const veh=v.vehicle?([v.vehicle.brand,v.vehicle.model].filter(Boolean).join(" ")+(v.vehicle.plate?" • "+v.vehicle.plate:"")):"Veículo";
      const qty=v.count+" estética"+(v.count===1?"":"s")+" realizada"+(v.count===1?"":"s");
      const dates=v.dates.map(d=>new Intl.DateTimeFormat("pt-BR").format(new Date(d+"T12:00:00"))).join(", ");
      ctx.strokeStyle="#dbe4e9";ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(right,y);ctx.stroke();y+=28;
      y=wrapped(veh,pad,y,width-pad*2-210,"800 25px system-ui, sans-serif","#172832",33);
      ctx.textAlign="right";ctx.font="800 25px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.fillText(money(v.total),right,y-8);ctx.textAlign="left";
      y=wrapped(qty,pad,y+4,width-pad*2,"800 20px system-ui, sans-serif","#385665",29)+3;
      y=wrapped(monthlyServiceSummary(v),pad,y,width-pad*2,"600 18px system-ui, sans-serif","#53656f",28)+3;
      y=wrapped("Datas: "+dates,pad,y,width-pad*2,"500 17px system-ui, sans-serif","#71808a",27)+8;
      if(g.vehicles.length>1&&v.discount>0)y=wrapped("Desconto neste veículo: − "+money(v.discount),pad,y,width-pad*2,"600 17px system-ui, sans-serif","#7d4d28",27)+8;
      y+=10
    }
    ctx.strokeStyle="#dbe4e9";ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(right,y);ctx.stroke();y+=34;
    if(g.discount>0){
      ctx.font="500 21px system-ui, sans-serif";ctx.fillStyle="#596970";ctx.fillText("Descontos concedidos no período",pad,y);
      ctx.textAlign="right";ctx.font="700 22px system-ui, sans-serif";ctx.fillStyle="#7d4d28";ctx.fillText("− "+money(g.discount),right,y);ctx.textAlign="left";y+=46
    }
    ctx.font="800 23px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.fillText("Total do mês",pad,y);
    ctx.textAlign="right";ctx.font="900 42px system-ui, sans-serif";ctx.fillText(money(g.total),right,y);ctx.textAlign="left";y+=62;
    const top=y;
    const boxText=()=>{
      let by=top+44;
      by=wrapped("PAGAMENTO A CONFIRMAR",pad+28,by,width-pad*2-56,"800 20px system-ui, sans-serif","#27485a",29)+12;
      const bankRows=[
        ["Chave Pix",g.bank.pix_key||"Não cadastrada"],
        ["Banco",g.bank.bank_name||"Não informado"],
        ["Agência",g.bank.branch||"Não informada"],
        ["Conta",g.bank.account_number||"Não informada"],
        ["Favorecido",g.bank.account_holder||"Não informado"]
      ];
      for(const [k,v] of bankRows)by=wrapped(k+": "+v,pad+28,by,width-pad*2-56,"600 20px system-ui, sans-serif","#27485a",30)+8;
      by+=8;
      by=wrapped("Após o pagamento, envie o comprovante para confirmarmos o recebimento.",pad+28,by,width-pad*2-56,"600 19px system-ui, sans-serif","#334b57",29)+8;
      return by
    };
    y=boxText()+16;
    if(draw){canvasRoundRect(ctx,pad,top,width-pad*2,y-top,18,"#f7fafb","#d7e1e6");boxText()}
    y+=42;
    y=wrapped("IMPACTO POSITIVO",pad,y,width-pad*2,"800 15px system-ui, sans-serif","#71808a",27)+10;
    const impact=g.apps.length===1
      ?"Este atendimento representa uma economia estimada de "+new Intl.NumberFormat("pt-BR").format(g.waterForGroup)+" litros de água."
      :"Os "+g.apps.length+" atendimentos deste mês representam uma economia estimada de "+new Intl.NumberFormat("pt-BR").format(g.waterForGroup)+" litros de água.";
    y=wrapped(impact,pad,y,width-pad*2,"400 18px system-ui, sans-serif","#4e6069",28)+30;
    ctx.strokeStyle="#dbe4e9";ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(right,y);ctx.stroke();y+=32;
    y=wrapped("Obrigado por escolher a Vaporeasy.",pad,y,width-pad*2,"600 18px system-ui, sans-serif","#40525a",28);
    return y+34
  }
  const height=Math.ceil(content(false));cv.height=height;ctx=cv.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);
  try{await brandLogoImg.decode()}catch{}
  if(brandLogoImg.complete&&brandLogoImg.naturalWidth){
    const logoW=300,logoH=300*brandLogoImg.naturalHeight/brandLogoImg.naturalWidth;
    ctx.drawImage(brandLogoImg,(width-logoW)/2,48,logoW,logoH)
  }else{
    ctx.font="900 50px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.textAlign="center";ctx.fillText("Vaporeasy",width/2,108);ctx.textAlign="left"
  }
  ctx.strokeStyle="#dbe4e9";ctx.beginPath();ctx.moveTo(pad,178);ctx.lineTo(right,178);ctx.stroke();
  content(true);return cv
}
function monthlyChargeText(g){
  const lines=["Vaporeasy — "+g.competenceLabel,"Cliente: "+(g.client?.name||"Cliente"),""];
  g.vehicles.forEach(v=>{const veh=v.vehicle?([v.vehicle.brand,v.vehicle.model].filter(Boolean).join(" ")+(v.vehicle.plate?" • "+v.vehicle.plate:"")):"Veículo";lines.push(veh+" — "+v.count+" estética"+(v.count===1?"":"s")+" — "+money(v.total))});
  lines.push("","Total do mês: "+money(g.total),"","Pagamento via Pix","Chave Pix: "+(g.bank.pix_key||"Não cadastrada"),"Favorecido: "+(g.bank.account_holder||""));
  return lines.join("\n")
}
async function openMonthlyClientReceipt(clientId,month){
  currentPackageReceipt=null;currentPackageGroup=null;currentReceipt=null;currentReceiptGroup=null;currentMonthlyReceipt=null;
  const modal=$("rd");
  $("rcontent").innerHTML='<div class="notice" style="margin:10px 0">Carregando documento mensal…</div>';
  $("rgroup").classList.add("hidden");
  $("rdiscount").classList.add("hidden");
  $("rcharge").classList.add("hidden");
  $("rshare").classList.add("hidden");
  $("rprint").classList.add("hidden");
  show("rgroupmsg","","ok");
  if(!modal.open)modal.showModal();
  try{
    currentMonthlyReceipt=await getMonthlyClientReceiptData(clientId,month);
    $("rcontent").innerHTML=monthlyReceiptHtml(currentMonthlyReceipt);
    $("rshare").textContent="Compartilhar comprovante";
    $("rshare").classList.remove("hidden");
    $("rprint").textContent="Compartilhar PDF";
    $("rprint").classList.remove("hidden");
    show("rgroupmsg",currentMonthlyReceipt.isSnapshot&&currentMonthlyReceipt.issuedAt?"Comprovante emitido em "+receiptDate(currentMonthlyReceipt.issuedAt)+". Histórico deste documento preservado.":"","ok");
    $("rdiscount").textContent="Aplicar desconto";
    $("rdiscount").classList.toggle("hidden",currentMonthlyReceipt.allPaid||currentMonthlyReceipt.isSnapshot);
    $("rcharge").classList.toggle("hidden",currentMonthlyReceipt.allPaid);
  }catch(e){
    const message=fail(e);
    $("rcontent").innerHTML='<div class="notice error" style="margin:10px 0"><b>Não foi possível abrir este documento.</b><br>'+esc(message)+'</div>';
    show("rgroupmsg",message,"error");
  }
}

function financeApptCard(a,p,maps,paid=false){
  const cl=maps.cm.get(a.client_id),v=maps.vm.get(a.vehicle_id),sv=maps.sm.get(a.service_id),when=paid?(p?.paid_at||a.completed_at):a.completed_at;
  return '<div class="item'+(!paid?' finance-pending-card':'')+'" style="margin-top:8px"><div class="actions" style="align-items:flex-start"><div style="flex:3"><div style="font-weight:900">'+esc(cl?.name||"Cliente")+'</div><div class="meta">'+esc(v?(v.brand+" "+v.model+(v.plate?" • "+v.plate:"")):"Veículo")+'<br>'+esc(sv?.name||"Serviço")+'<br>'+esc(receiptDate(when))+'</div></div><div style="font-weight:950;font-size:18px">'+esc(money(p?.amount??a.final_value))+'</div></div><div class="actions" style="margin-top:8px">'+(!paid?'<button type="button" class="success" data-fin-pay="'+a.id+'">Confirmar pagamento</button><button type="button" class="ghost" data-fin-receipt="'+a.id+'">Atendimento / Pix</button>':'<button type="button" class="ghost" data-fin-receipt="'+a.id+'">Recibo</button>')+'</div></div>'
}
function financePackageDate(d){
  if(!d)return "—";
  const raw=String(d),dt=new Date(raw.length===10?raw+"T12:00:00":raw);
  return Number.isNaN(dt.getTime())?raw:new Intl.DateTimeFormat("pt-BR").format(dt)
}
function financePackageUpgradeTarget(c,charges=[]){
  const baseCreated=Date.parse(c.created_at||"")||0;
  return charges
    .filter(n=>n.id!==c.id
      &&n.client_id===c.client_id
      &&n.vehicle_id===c.vehicle_id
      &&n.competence_month===c.competence_month
      &&(Date.parse(n.created_at||"")||0)>baseCreated
      &&Number(n.credit_applied||0)>=Number(c.amount||0)-0.009
      &&Number(n.gross_monthly_amount??n.amount??0)>Number(c.gross_monthly_amount??c.amount??0)
      &&n.status!=="cancelled")
    .sort((a,b)=>(Date.parse(a.created_at||"")||0)-(Date.parse(b.created_at||"")||0))[0]||null
}
function packageChargeCommercialDiscount(c){
  const gross=Number(c?.gross_monthly_amount??c?.amount??0),credit=Number(c?.credit_applied||0),amount=Number(c?.amount||0);
  return Math.max(0,gross-credit-amount)
}
function packageChargeGroups(rows){
  const groups=new Map();
  (rows||[]).forEach(c=>{
    const key=String(c.client_id||"")+"|"+String(c.competence_month||"");
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(c)
  });
  return [...groups.values()]
}
function financePackageGroupCard(group,maps,paid=false){
  const first=group[0],cl=maps.cm.get(first.client_id),total=group.reduce((sum,c)=>sum+Number(c.amount||0),0),ids=group.map(c=>c.id).join(",");
  const vehicles=group.map(c=>{
    const v=maps.vm.get(c.vehicle_id);
    return v?[v.brand,v.model].filter(Boolean).join(" ")+(v.plate?" • "+v.plate:""):"Veículo"
  });
  const sameMethod=paid&&group.every(c=>(c.payment_method||"")===(first.payment_method||""));
  const detail=vehicles.map(esc).join("<br>");
  const dateLine=paid
    ?("Recebido"+(first.paid_at?" em "+financePackageDate(first.paid_at):"")+(sameMethod&&first.payment_method?" • "+esc(first.payment_method):""))
    :"Mensalidade conjunta • "+group.length+" veículos";
  return '<div class="item'+(!paid?' finance-pending-card':'')+'" style="margin-top:8px;border-color:#2b718e;background:#0b2634"><div class="actions" style="align-items:flex-start"><div style="flex:3"><div style="font-weight:950">'+esc(cl?.name||"Cliente")+'</div><div class="meta">'+detail+'<br>'+dateLine+'</div></div><div style="font-weight:950;font-size:18px">'+esc(money(total))+'</div></div>'+
    (!paid
      ?'<div class="actions" style="margin-top:8px"><button type="button" class="success" data-pkg-group-pay="'+esc(ids)+'">Confirmar pagamento conjunto</button><button type="button" class="ghost" data-pkg-group-share="'+esc(ids)+'">Mensalidades / Pix</button></div>'
      :'<div class="actions" style="margin-top:8px"><button type="button" class="ghost" data-pkg-group-share="'+esc(ids)+'">Recibo conjunto</button></div>')+
  '</div>'
}
function financePackageCards(rows,maps,paid=false,monthRows=[]){
  let groups;
  if(paid){
    const m=new Map();
    (rows||[]).forEach(c=>{
      const key=String(c.client_id||"")+"|"+String(c.competence_month||"")+"|"+String(c.paid_at||"")+"|"+String(c.payment_method||"");
      if(!m.has(key))m.set(key,[]);
      m.get(key).push(c)
    });
    groups=[...m.values()]
  }else groups=packageChargeGroups(rows);
  return groups.map(group=>{
    if(group.length>1&&new Set(group.map(c=>c.vehicle_id)).size>1)return financePackageGroupCard(group,maps,paid);
    return group.map(c=>financePackageChargeCard(c,maps,paid,paid?financePackageUpgradeTarget(c,monthRows):null)).join("")
  }).join("")
}
function financePlanDisplayName(name){
  return String(name||"Plano").replace(/^Pacote(?=\s|$)/i,"Plano").trim();
}
function financePackageChargeCard(c,maps,paid=false,upgradeTarget=null){
  const cl=maps.cm.get(c.client_id),v=maps.vm.get(c.vehicle_id),sv=maps.sm.get(c.service_id),meta=packageFrequencyMeta(c.frequency),freq=meta?.label||c.frequency,visits=Number(c.visits_per_month||meta?.visits||0),gross=Number(c.gross_monthly_amount??c.amount??0),credit=Number(c.credit_applied||0),amount=Number(c.amount||0),commercialDiscount=packageChargeCommercialDiscount(c);
  const baseDetail=esc(financePlanDisplayName(sv?.name))+' • '+esc(freq)+' • '+visits+' estéticas/mês';
  const targetMeta=upgradeTarget?packageFrequencyMeta(upgradeTarget.frequency):null;
  const targetService=upgradeTarget?maps.sm.get(upgradeTarget.service_id):null;
  const historyTitle=upgradeTarget&&paid?'Pagamento inicial do pacote':baseDetail;
  const historyDetail=upgradeTarget&&paid
    ?'<br><span>'+baseDetail+'</span><br><span>Incorporado ao upgrade para '+esc(financePlanDisplayName(targetService?.name||sv?.name))+' '+esc(targetMeta?.label||upgradeTarget.frequency||"")+'</span>'
    :"";
  const dateLine=paid?("Recebido em "+financePackageDate(c.paid_at)+(c.payment_method?" • "+esc(c.payment_method):"")):("Vencimento "+financePackageDate(c.due_date));
  let adjustment="";
  if(credit>0){
    adjustment=paid
      ?'<br><span>Mensalidade: '+esc(money(gross))+'<br>Pagamento anterior: '+esc(money(credit))+'<br>Complemento pago: '+esc(money(amount))+'<br>Total quitado: '+esc(money(gross))+'</span>'
      :'<br><span>Mensalidade: '+esc(money(gross))+' • já pago: '+esc(money(credit))+' • saldo a pagar: '+esc(money(amount))+'</span>'
  }else if(commercialDiscount>0){
    adjustment=paid
      ?'<br><span>Valor de tabela: '+esc(money(gross))+'<br>Desconto comercial: − '+esc(money(commercialDiscount))+'<br>Valor pago: '+esc(money(amount))+'</span>'
      :'<br><span>Valor de tabela: '+esc(money(gross))+' • desconto: − '+esc(money(commercialDiscount))+' • a pagar: '+esc(money(amount))+'</span>'
  }
  const covered=c.status==="covered";
  const paidMessage=upgradeTarget
    ?'Valor preservado como crédito na atualização do plano.'
    :(credit>0
      ?'Complemento pago. Mensalidade total de '+esc(money(gross))+' quitada.'
      :'Mensalidade do plano paga.');
  return '<div class="item'+(!paid?' finance-pending-card':'')+'" style="margin-top:8px;border-color:#2b718e;background:#0b2634"><div class="actions" style="align-items:flex-start"><div style="flex:3"><div style="font-weight:950">'+esc(cl?.name||"Cliente")+'</div><div class="meta">'+esc(v?(v.brand+" "+v.model+(v.plate?" • "+v.plate:"")):"Veículo")+'<br>'+(upgradeTarget&&paid?'<b>'+historyTitle+'</b>'+historyDetail:baseDetail)+adjustment+'<br>'+dateLine+'</div></div><div style="font-weight:950;font-size:18px">'+esc(money(amount))+'</div></div>'+(covered?'<div class="meta" style="margin-top:8px">Mensalidade coberta por pagamento anterior no mesmo mês.</div>':(!paid?'<div class="actions" style="margin-top:8px"><button type="button" class="success" data-pkg-pay="'+c.id+'">Confirmar pagamento</button><button type="button" class="ghost" data-pkg-charge-share="'+c.id+'">Mensalidade / Pix</button></div>':'<div class="meta" style="margin-top:8px">'+paidMessage+'</div><div class="actions" style="margin-top:8px"><button type="button" class="ghost" data-pkg-charge-share="'+c.id+'">Recibo de pagamento</button></div>'))+'</div>'
}
async function getPackageChargeShareData(id){
  const cr=await sb.from("package_charges").select("*").eq("id",id).single();if(cr.error)throw cr.error;
  const c=cr.data;
  const [cl,vr,sv,bs]=await Promise.all([
    sb.from("clients").select("id,name").eq("id",c.client_id).single(),
    sb.from("vehicles").select("id,brand,model,plate,package_size").eq("id",c.vehicle_id).single(),
    sb.from("services").select("id,name").eq("id",c.service_id).single(),
    sb.from("business_payment_settings").select("*").eq("id",1).single()
  ]);
  if(cl.error)throw cl.error;if(vr.error)throw vr.error;if(sv.error)throw sv.error;if(bs.error)throw bs.error;
  return{charge:c,client:cl.data,vehicle:vr.data,service:sv.data,bank:bs.data}
}
// Package documents only read the existing charge; payment remains in the existing flow.
function packageDocumentModel(d){
  const c=d.charge,paid=c.status==="paid",meta=packageFrequencyMeta(c.frequency);
  if(!["pending","paid"].includes(c.status))throw Error("Esta mensalidade não está disponível para emissão.");
  const gross=Number(c.gross_monthly_amount??c.amount??0),credit=Number(c.credit_applied||0),discount=packageChargeCommercialDiscount(c);
  const planTier=String(d.service?.name||"").replace(/^Pacote\s+/i,"").trim();
  const planName="Plano Vaporeasy"+(planTier?" "+planTier:"");
  const fields=[["Cliente",d.client?.name||"Cliente"],["Veículo",d.vehicle?[d.vehicle.brand,d.vehicle.model].filter(Boolean).join(" ")+(d.vehicle.plate?" • "+d.vehicle.plate:""):"—"],["Plano",planName],["Frequência",meta?.label||c.frequency||"—"]];
  const amounts=(discount>0||credit>0)?[["Valor original",money(gross)]]:[];
  if(discount>0)amounts.push(["Desconto comercial","− "+money(discount)]);
  if(credit>0)amounts.push(["Crédito já pago","− "+money(credit)]);
  const bank=paid?[["Forma de pagamento",c.payment_method||"—"],["Recebido em",financePackageDate(c.paid_at)],["Favorecido",d.bank.account_holder||"Não informado"]]:[["Chave Pix",d.bank.pix_key||"Não cadastrada"],["Banco",d.bank.bank_name||"Não informado"],["Agência",d.bank.branch||"Não informada"],["Conta",d.bank.account_number||"Não informada"],["Favorecido",d.bank.account_holder||"Não informado"]];
  return{
    paid,
    title:paid?"Recibo Vaporeasy":planName,
    subtitle:paid?"Mensalidade recebida":"Sua mensalidade",
    status:paid?"PAGAMENTO RECEBIDO":"PAGAMENTO A CONFIRMAR",
    fields,amounts,bank,
    paymentInstruction:paid?"":"Após o pagamento, envie o comprovante para confirmarmos o recebimento e realizarmos a baixa da mensalidade.",
    total:money(c.amount||0),
    totalLabel:paid?"Valor recebido":"Valor da mensalidade",
    introTitle:paid?"Pagamento confirmado":"Cuidado contínuo, com padrão Vaporeasy",
    intro:paid
      ?"Este documento confirma o recebimento da mensalidade do seu Plano Vaporeasy."
      :"Seu Plano Vaporeasy foi pensado para manter seu veículo sempre bem cuidado, com atendimento recorrente, conveniência e atenção aos detalhes.",
    intro2:paid
      ?"Agradecemos pela confiança e pela continuidade dos cuidados com o seu veículo."
      :"A manutenção frequente contribui para preservar a aparência do veículo e manter um padrão de cuidado consistente ao longo do tempo.",
    impactTitle:"CUIDADO CONSCIENTE",
    impact:"Nossos processos buscam maior eficiência no uso de água, produtos e recursos, unindo alto padrão de atendimento e menor desperdício.",
    thanksTitle:"OBRIGADO POR ESCOLHER A VAPOREASY",
    footerLead:"É um prazer cuidar do seu veículo.",
    footer:"Nosso compromisso é oferecer uma experiência conveniente, cuidadosa e consistente em cada atendimento.",
    signature:"Vaporeasy",
    tagline:"Estética automotiva domiciliar premium"
  }
}
function packageChargeHtml(d){
  const m=packageDocumentModel(d);
  return '<div class="receipt-sheet" style="font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">'+
    '<div class="receipt-head" style="display:block;text-align:left"><img src="'+BRAND_LOGO+'" alt="Vaporeasy" style="width:180px;max-width:100%;height:auto;display:block;margin:0 auto"><div style="margin-top:14px"><div class="receipt-title" style="font-family:inherit;font-size:20px;font-weight:800;line-height:1.25">'+esc(m.title)+'</div><div class="receipt-muted" style="margin-top:4px;font-family:inherit;font-size:12px;font-weight:500">'+esc(m.subtitle)+'</div></div></div>'+
    '<div style="margin-top:22px;font-family:inherit;font-size:18px;font-weight:700;line-height:1.35;color:#172832">'+esc(m.introTitle)+'</div>'+
    '<p style="margin:10px 0 0;color:#334b57;font-size:14px;font-weight:500;line-height:1.55">'+esc(m.intro)+'</p>'+
    '<p style="margin:8px 0 0;color:#405863;font-size:14px;font-weight:500;line-height:1.55">'+esc(m.intro2)+'</p>'+
    '<div class="receipt-grid" style="margin-top:20px">'+m.fields.map(([k,v])=>'<div class="receipt-box" style="overflow-wrap:anywhere;font-size:14px;font-weight:600;line-height:1.4"><b style="font-size:11px;font-weight:800;color:#53656f;letter-spacing:.15px">'+esc(k)+'</b>'+esc(v)+'</div>').join("")+'</div>'+
    '<div class="receipt-lines" style="font-size:14px">'+m.amounts.map(([k,v])=>'<div class="receipt-line"><span style="font-weight:500">'+esc(k)+'</span><b style="font-weight:700">'+esc(v)+'</b></div>').join("")+'</div>'+
    '<div class="receipt-total" style="font-family:inherit;font-size:17px;font-weight:800"><span>'+esc(m.totalLabel)+'</span><span style="font-size:27px;font-weight:900">'+esc(m.total)+'</span></div>'+
    '<div class="receipt-pay" style="overflow-wrap:anywhere;font-family:inherit;font-size:13px;line-height:1.45"><span class="'+(m.paid?'paid-pill':'pending-pill')+'" style="font-family:inherit;font-weight:800">'+esc(m.status)+'</span>'+m.bank.map(([k,v])=>'<div style="margin-top:8px"><b style="font-weight:700">'+esc(k)+':</b> '+esc(v)+'</div>').join("")+(m.paymentInstruction?'<div style="margin-top:14px;padding-top:12px;border-top:1px solid #d7e1e6;font-weight:600;color:#334b57">'+esc(m.paymentInstruction)+'</div>':'')+'</div>'+
    '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #d7e1e6"><div style="font-size:10px;color:#71808a;font-weight:800;letter-spacing:.8px">'+esc(m.impactTitle)+'</div><p style="margin:8px 0 0;color:#4e6069;font-size:12.5px;font-weight:400;line-height:1.5">'+esc(m.impact)+'</p></div>'+
    '<div style="margin-top:20px;padding-top:15px;border-top:1px solid #d7e1e6;text-align:center;color:#40525a;font-size:13px;font-weight:600;line-height:1.45">Obrigado por escolher a Vaporeasy.</div>'+
  '</div>'
}
async function packageChargeCanvas(d){
  const m=packageDocumentModel(d),width=1080,pad=82,right=width-pad;
  const cv=document.createElement("canvas");cv.width=width;cv.height=1;let ctx=cv.getContext("2d");
  function wrapped(text,x,y,w,font,color,lineHeight=34){
    ctx.font=font;
    const words=String(text).split(/\s+/).flatMap(word=>{
      const chunks=[];let part="";
      for(const char of word){if(part&&ctx.measureText(part+char).width>w){chunks.push(part);part=""}part+=char}
      if(part)chunks.push(part);return chunks;
    });
    return canvasText(ctx,words.join(" "),x,y,w,lineHeight,font,color)
  }
  function content(draw){
    let y=238;
    y=wrapped(m.title,pad,y,width-pad*2,"800 40px system-ui, sans-serif","#172832",46)+10;
    y=wrapped(m.subtitle,pad,y,width-pad*2,"500 22px system-ui, sans-serif","#647581",30)+24;
    y=wrapped(m.introTitle,pad,y,width-pad*2,"700 28px system-ui, sans-serif","#27485a",36)+18;
    y=wrapped(m.intro,pad,y,width-pad*2,"500 22px system-ui, sans-serif","#334b57",32)+8;
    y=wrapped(m.intro2,pad,y,width-pad*2,"500 21px system-ui, sans-serif","#405863",31)+28;
    for(const [k,v] of m.fields){
      y=wrapped(k.toUpperCase(),pad,y,width-pad*2,"800 15px system-ui, sans-serif","#71808a",27);
      y=wrapped(v,pad,y,width-pad*2,"700 25px system-ui, sans-serif","#172832",33)+18
    }
    y+=10;
    for(const [k,v] of m.amounts){
      ctx.font="500 22px system-ui, sans-serif";ctx.fillStyle="#596970";ctx.fillText(k,pad,y);
      ctx.textAlign="right";ctx.font="700 22px system-ui, sans-serif";ctx.fillText(v,right,y);ctx.textAlign="left";y+=43
    }
    y+=16;
    ctx.font="800 23px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.fillText(m.totalLabel,pad,y);
    ctx.textAlign="right";ctx.font="900 42px system-ui, sans-serif";ctx.fillText(m.total,right,y);ctx.textAlign="left";y+=58;
    const top=y;
    const boxText=()=>{
      let by=top+44;
      by=wrapped(m.status,pad+28,by,width-pad*2-56,"800 20px system-ui, sans-serif",m.paid?"#17643c":"#27485a",29)+12;
      for(const [k,v] of m.bank)by=wrapped(k+": "+v,pad+28,by,width-pad*2-56,"600 20px system-ui, sans-serif","#27485a",30)+8;
      if(m.paymentInstruction){
        by+=8;
        by=wrapped(m.paymentInstruction,pad+28,by,width-pad*2-56,"600 19px system-ui, sans-serif","#334b57",29)+8
      }
      return by
    };
    y=boxText()+16;
    if(draw){canvasRoundRect(ctx,pad,top,width-pad*2,y-top,18,m.paid?"#edf8f1":"#f7fafb",m.paid?"#bfdfca":"#d7e1e6");boxText()}
    y+=42;
    y=wrapped(m.impactTitle,pad,y,width-pad*2,"800 15px system-ui, sans-serif","#71808a",27)+10;
    y=wrapped(m.impact,pad,y,width-pad*2,"400 18px system-ui, sans-serif","#4e6069",28)+30;
    ctx.strokeStyle="#dbe4e9";ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(right,y);ctx.stroke();y+=32;
    y=wrapped("Obrigado por escolher a Vaporeasy.",pad,y,width-pad*2,"600 18px system-ui, sans-serif","#40525a",28);
    return y+34
  }
  const height=Math.ceil(content(false));cv.height=height;ctx=cv.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);
  try{await brandLogoImg.decode()}catch{}
  if(brandLogoImg.complete&&brandLogoImg.naturalWidth)ctx.drawImage(brandLogoImg,pad,48,300,300*brandLogoImg.naturalHeight/brandLogoImg.naturalWidth);
  else{ctx.font="900 50px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.fillText("Vaporeasy",pad,108)}
  ctx.strokeStyle="#dbe4e9";ctx.beginPath();ctx.moveTo(pad,178);ctx.lineTo(right,178);ctx.stroke();
  content(true);return cv
}
async function getPackageChargeGroupShareData(ids){
  const chargeIds=[...new Set((ids||[]).filter(Boolean))];
  if(chargeIds.length<2)throw Error("Selecione pelo menos duas mensalidades para agrupar.");
  const cr=await sb.from("package_charges").select("*").in("id",chargeIds);
  if(cr.error)throw cr.error;
  const charges=cr.data||[];
  if(charges.length!==chargeIds.length)throw Error("Uma das mensalidades não foi encontrada.");
  const first=charges[0];
  if(!charges.every(c=>c.client_id===first.client_id&&c.competence_month===first.competence_month))throw Error("As mensalidades precisam pertencer ao mesmo cliente e mês.");
  const statuses=[...new Set(charges.map(c=>c.status))];
  if(statuses.length!==1||!["pending","paid"].includes(statuses[0]))throw Error("As mensalidades agrupadas precisam estar todas pendentes ou todas pagas.");
  const vehicleIds=[...new Set(charges.map(c=>c.vehicle_id).filter(Boolean))],serviceIds=[...new Set(charges.map(c=>c.service_id).filter(Boolean))];
  const [cl,vr,sr,bs]=await Promise.all([
    sb.from("clients").select("id,name").eq("id",first.client_id).single(),
    sb.from("vehicles").select("id,brand,model,plate,package_size").in("id",vehicleIds),
    sb.from("services").select("id,name").in("id",serviceIds),
    sb.from("business_payment_settings").select("*").eq("id",1).single()
  ]);
  if(cl.error)throw cl.error;if(vr.error)throw vr.error;if(sr.error)throw sr.error;if(bs.error)throw bs.error;
  const vm=new Map((vr.data||[]).map(v=>[v.id,v])),sm=new Map((sr.data||[]).map(x=>[x.id,x]));
  charges.sort((a,b)=>String(vm.get(a.vehicle_id)?.brand||"").localeCompare(String(vm.get(b.vehicle_id)?.brand||""),"pt-BR"));
  return{charges,client:cl.data,vehicles:vm,services:sm,bank:bs.data}
}
function packageGroupDocumentModel(d){
  const paid=d.charges.every(c=>c.status==="paid"),tiers=[...new Set(d.charges.map(c=>String(d.services.get(c.service_id)?.name||"").replace(/^Pacote\s+/i,"").trim()).filter(Boolean))];
  const title=paid?"Recibo Vaporeasy":(tiers.length===1?"Plano Vaporeasy "+tiers[0]:"Mensalidade Vaporeasy");
  const items=d.charges.map(c=>{
    const v=d.vehicles.get(c.vehicle_id),sv=d.services.get(c.service_id),meta=packageFrequencyMeta(c.frequency),tier=String(sv?.name||"").replace(/^Pacote\s+/i,"").trim(),units=Number(c.package_units||1),unitPrice=Number(c.unit_price||0),gross=Number(c.gross_monthly_amount??c.amount??0),credit=Number(c.credit_applied||0),discount=packageChargeCommercialDiscount(c);
    return{
      vehicle:v?[v.brand,v.model].filter(Boolean).join(" ")+(v.plate?" • "+v.plate:""):"Veículo",
      size:v?.package_size==="g"?"G":(v?.package_size==="pm"?"P/M":""),
      plan:"Plano Vaporeasy"+(tier?" "+tier:""),
      frequency:meta?.label||c.frequency||"—",
      visits:Number(c.visits_per_month||meta?.visits||0),
      units,unitPrice,gross,discount,credit,amount:Number(c.amount||0)
    }
  });
  const total=items.reduce((sum,x)=>sum+x.amount,0),methods=[...new Set(d.charges.map(c=>c.payment_method).filter(Boolean))],paidAt=d.charges.map(c=>c.paid_at).filter(Boolean).sort().slice(-1)[0]||null;
  const bank=paid
    ?[["Forma de pagamento",methods.length===1?methods[0]:"Múltiplas formas"],["Recebido em",financePackageDate(paidAt)],["Favorecido",d.bank.account_holder||"Não informado"]]
    :[["Chave Pix",d.bank.pix_key||"Não cadastrada"],["Banco",d.bank.bank_name||"Não informado"],["Agência",d.bank.branch||"Não informada"],["Conta",d.bank.account_number||"Não informada"],["Favorecido",d.bank.account_holder||"Não informado"]];
  return{
    paid,title,
    subtitle:paid?"Mensalidade conjunta recebida":"Sua mensalidade conjunta",
    status:paid?"PAGAMENTO RECEBIDO":"DADOS PARA PAGAMENTO",
    client:d.client?.name||"Cliente",items,bank,total,
    totalLabel:paid?"Valor recebido":"Total da mensalidade",
    paymentInstruction:paid?"":"Após o pagamento, envie o comprovante para confirmarmos o recebimento e realizarmos a baixa da mensalidade.",
    introTitle:paid?"Pagamento confirmado":"Cuidado contínuo, com padrão Vaporeasy",
    intro:paid?"Este documento confirma o recebimento conjunto das mensalidades dos seus Planos Vaporeasy.":"Seus Planos Vaporeasy foram organizados em uma única mensalidade para facilitar o pagamento e o acompanhamento dos cuidados com seus veículos.",
    intro2:paid?"Agradecemos pela confiança e pela continuidade dos cuidados com seus veículos.":"Cada veículo continua com seu plano, frequência e valor individual registrados no sistema.",
    impactTitle:"CUIDADO CONSCIENTE",
    impact:"Nossos processos buscam maior eficiência no uso de água, produtos e recursos, unindo alto padrão de atendimento e menor desperdício."
  }
}
function packageGroupHtml(d){
  const m=packageGroupDocumentModel(d);
  const items=m.items.map(x=>{
    const unitLabel=x.units+" plano"+(x.units===1?"":"s")+" × "+money(x.unitPrice);
    const adj=(x.discount>0?'<div style="margin-top:5px;color:#596970">Desconto comercial: − '+esc(money(x.discount))+'</div>':"")+(x.credit>0?'<div style="margin-top:5px;color:#596970">Crédito: − '+esc(money(x.credit))+'</div>':"");
    return '<div class="receipt-box" style="margin-top:10px;overflow-wrap:anywhere;font-size:14px;line-height:1.45"><b style="font-size:16px;color:#172832">'+esc(x.vehicle)+'</b><div style="margin-top:6px;font-weight:700">'+esc(x.plan+(x.size?" • "+x.size:""))+'</div><div style="margin-top:5px;color:#596970">'+esc(unitLabel)+'</div><div style="margin-top:5px;color:#596970">'+esc(x.visits+" atendimentos por mês")+'</div>'+adj+'<div style="margin-top:9px;font-weight:800">Subtotal <span style="float:right">'+esc(money(x.amount))+'</span></div></div>'
  }).join("");
  return '<div class="receipt-sheet" style="font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">'+
    '<div class="receipt-head" style="flex-wrap:wrap;align-items:flex-start"><img src="'+BRAND_LOGO+'" alt="Vaporeasy" style="width:180px;max-width:100%;height:auto"><div style="text-align:right"><div class="receipt-title" style="font-family:inherit;font-size:20px;font-weight:800;line-height:1.25">'+esc(m.title)+'</div><div class="receipt-muted" style="margin-top:4px;font-family:inherit;font-size:12px;font-weight:500">'+esc(m.subtitle)+'</div></div></div>'+
    '<div style="margin-top:22px;font-size:18px;font-weight:700;line-height:1.35;color:#172832">'+esc(m.introTitle)+'</div>'+
    '<p style="margin:10px 0 0;color:#334b57;font-size:14px;font-weight:500;line-height:1.55">'+esc(m.intro)+'</p>'+
    '<p style="margin:8px 0 0;color:#405863;font-size:14px;font-weight:500;line-height:1.55">'+esc(m.intro2)+'</p>'+
    '<div class="receipt-box" style="margin-top:20px"><b style="font-size:11px;color:#53656f">CLIENTE</b>'+esc(m.client)+'</div>'+
    '<div style="margin-top:14px">'+items+'</div>'+
    '<div class="receipt-total" style="font-family:inherit;font-size:17px;font-weight:800"><span>'+esc(m.totalLabel)+'</span><span style="font-size:27px;font-weight:900">'+esc(money(m.total))+'</span></div>'+
    '<div class="receipt-pay" style="overflow-wrap:anywhere;font-family:inherit;font-size:13px;line-height:1.45"><span class="'+(m.paid?'paid-pill':'pending-pill')+'" style="font-family:inherit;font-weight:800">'+esc(m.status)+'</span>'+m.bank.map(([k,v])=>'<div style="margin-top:8px"><b>'+esc(k)+':</b> '+esc(v)+'</div>').join("")+(m.paymentInstruction?'<div style="margin-top:14px;padding-top:12px;border-top:1px solid #d7e1e6;font-weight:600;color:#334b57">'+esc(m.paymentInstruction)+'</div>':'')+'</div>'+
    '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #d7e1e6"><div style="font-size:10px;color:#71808a;font-weight:800;letter-spacing:.8px">'+esc(m.impactTitle)+'</div><p style="margin:8px 0 0;color:#4e6069;font-size:12.5px;line-height:1.5">'+esc(m.impact)+'</p></div>'+
    '<div style="margin-top:20px;padding-top:15px;border-top:1px solid #d7e1e6;text-align:center;color:#40525a;font-size:13px;font-weight:600">Obrigado por escolher a Vaporeasy.</div>'+
  '</div>'
}
async function packageGroupCanvas(d){
  const m=packageGroupDocumentModel(d),width=1080,pad=82,right=width-pad,cv=document.createElement("canvas");cv.width=width;cv.height=1;let ctx=cv.getContext("2d");
  function wrapped(text,x,y,w,font,color,lineHeight=32){ctx.font=font;return canvasText(ctx,String(text),x,y,w,lineHeight,font,color)}
  function content(draw){
    let y=238;
    y=wrapped(m.title,pad,y,width-pad*2,"800 40px system-ui, sans-serif","#172832",46)+8;
    y=wrapped(m.subtitle,pad,y,width-pad*2,"500 22px system-ui, sans-serif","#647581",30)+24;
    y=wrapped(m.introTitle,pad,y,width-pad*2,"700 28px system-ui, sans-serif","#27485a",36)+16;
    y=wrapped(m.intro,pad,y,width-pad*2,"500 22px system-ui, sans-serif","#334b57",32)+8;
    y=wrapped(m.intro2,pad,y,width-pad*2,"500 21px system-ui, sans-serif","#405863",31)+26;
    y=wrapped("CLIENTE",pad,y,width-pad*2,"800 15px system-ui, sans-serif","#71808a",26);
    y=wrapped(m.client,pad,y,width-pad*2,"700 25px system-ui, sans-serif","#172832",33)+24;
    for(const x of m.items){
      const top=y;
      let by=top+38;
      by=wrapped(x.vehicle,pad+24,by,width-pad*2-48,"800 25px system-ui, sans-serif","#172832",33)+5;
      by=wrapped(x.plan+(x.size?" • "+x.size:""),pad+24,by,width-pad*2-48,"700 21px system-ui, sans-serif","#27485a",30)+5;
      by=wrapped(x.units+" plano"+(x.units===1?"":"s")+" × "+money(x.unitPrice),pad+24,by,width-pad*2-48,"500 19px system-ui, sans-serif","#596970",28)+3;
      by=wrapped(x.visits+" atendimentos por mês",pad+24,by,width-pad*2-48,"500 19px system-ui, sans-serif","#596970",28)+3;
      if(x.discount>0)by=wrapped("Desconto comercial: − "+money(x.discount),pad+24,by,width-pad*2-48,"500 18px system-ui, sans-serif","#596970",27)+3;
      ctx.font="800 21px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.fillText("Subtotal",pad+24,by);
      ctx.textAlign="right";ctx.fillText(money(x.amount),right-24,by);ctx.textAlign="left";by+=30;
      if(draw)canvasRoundRect(ctx,pad,top,width-pad*2,by-top,16,"#f8fafb","#d7e1e6");
      if(draw){
        let yy=top+38;
        yy=wrapped(x.vehicle,pad+24,yy,width-pad*2-48,"800 25px system-ui, sans-serif","#172832",33)+5;
        yy=wrapped(x.plan+(x.size?" • "+x.size:""),pad+24,yy,width-pad*2-48,"700 21px system-ui, sans-serif","#27485a",30)+5;
        yy=wrapped(x.units+" plano"+(x.units===1?"":"s")+" × "+money(x.unitPrice),pad+24,yy,width-pad*2-48,"500 19px system-ui, sans-serif","#596970",28)+3;
        yy=wrapped(x.visits+" atendimentos por mês",pad+24,yy,width-pad*2-48,"500 19px system-ui, sans-serif","#596970",28)+3;
        if(x.discount>0)yy=wrapped("Desconto comercial: − "+money(x.discount),pad+24,yy,width-pad*2-48,"500 18px system-ui, sans-serif","#596970",27)+3;
        ctx.font="800 21px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.fillText("Subtotal",pad+24,yy);ctx.textAlign="right";ctx.fillText(money(x.amount),right-24,yy);ctx.textAlign="left"
      }
      y=by+18
    }
    y+=8;ctx.font="800 23px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.fillText(m.totalLabel,pad,y);ctx.textAlign="right";ctx.font="900 42px system-ui, sans-serif";ctx.fillText(money(m.total),right,y);ctx.textAlign="left";y+=58;
    const top=y;
    const boxText=()=>{let by=top+44;by=wrapped(m.status,pad+28,by,width-pad*2-56,"800 20px system-ui, sans-serif",m.paid?"#17643c":"#27485a",29)+12;for(const [k,v] of m.bank)by=wrapped(k+": "+v,pad+28,by,width-pad*2-56,"600 20px system-ui, sans-serif","#27485a",30)+8;if(m.paymentInstruction){by+=8;by=wrapped(m.paymentInstruction,pad+28,by,width-pad*2-56,"600 19px system-ui, sans-serif","#334b57",29)+8}return by};
    y=boxText()+16;if(draw){canvasRoundRect(ctx,pad,top,width-pad*2,y-top,18,m.paid?"#edf8f1":"#f7fafb",m.paid?"#bfdfca":"#d7e1e6");boxText()}
    y+=40;y=wrapped(m.impactTitle,pad,y,width-pad*2,"800 15px system-ui, sans-serif","#71808a",27)+10;y=wrapped(m.impact,pad,y,width-pad*2,"400 18px system-ui, sans-serif","#4e6069",28)+28;
    ctx.strokeStyle="#dbe4e9";ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(right,y);ctx.stroke();y+=30;y=wrapped("Obrigado por escolher a Vaporeasy.",pad,y,width-pad*2,"600 18px system-ui, sans-serif","#40525a",28);
    return y+34
  }
  cv.height=Math.ceil(content(false));ctx=cv.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,width,cv.height);
  try{await brandLogoImg.decode()}catch{}
  if(brandLogoImg.complete&&brandLogoImg.naturalWidth)ctx.drawImage(brandLogoImg,pad,48,300,300*brandLogoImg.naturalHeight/brandLogoImg.naturalWidth);
  else{ctx.font="900 50px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.fillText("Vaporeasy",pad,108)}
  ctx.strokeStyle="#dbe4e9";ctx.beginPath();ctx.moveTo(pad,178);ctx.lineTo(right,178);ctx.stroke();content(true);return cv
}
let currentPackageReceipt=null,currentPackageGroup=null;
async function sharePackageCharge(id){
  if(!financeAllowed())return show("msg","Seu nível de acesso não permite visualizar cobranças.","error");
  try{
    const d=await getPackageChargeShareData(id);packageDocumentModel(d);
    currentReceipt=null;currentReceiptGroup=null;currentPackageGroup=null;currentPackageReceipt=d;
    renderPackageReceipt();$("rd").showModal()
  }catch(e){show("msg",fail(e),"error")}
}
function renderPackageReceipt(){
  const m=packageDocumentModel(currentPackageReceipt);
  $("rcontent").innerHTML=packageChargeHtml(currentPackageReceipt);
  $("rshare").textContent=m.paid?"Compartilhar recibo":"Compartilhar mensalidade";
  $("rprint").textContent="Compartilhar PDF";show("rgroupmsg","");
  for(const id of ["rgroup","rdiscount","rcharge"])$(id).classList.add("hidden")
}
async function sharePackageChargeGroup(ids){
  if(!financeAllowed())return show("msg","Seu nível de acesso não permite visualizar cobranças.","error");
  try{
    const d=await getPackageChargeGroupShareData(ids);packageGroupDocumentModel(d);
    currentReceipt=null;currentReceiptGroup=null;currentPackageReceipt=null;currentPackageGroup=d;
    renderPackageGroupReceipt();$("rd").showModal()
  }catch(e){show("msg",fail(e),"error")}
}
function renderPackageGroupReceipt(){
  const m=packageGroupDocumentModel(currentPackageGroup);
  $("rcontent").innerHTML=packageGroupHtml(currentPackageGroup);
  $("rshare").textContent=m.paid?"Compartilhar recibo conjunto":"Compartilhar mensalidade conjunta";
  $("rprint").textContent="Compartilhar PDF";show("rgroupmsg","");
  for(const id of ["rgroup","rdiscount","rcharge"])$(id).classList.add("hidden")
}
async function sharePackageGroupReceiptFile(pdf=false){
  if(!financeAllowed())return;
  const ids=currentPackageGroup?.charges?.map(c=>c.id)||[];if(ids.length<2)return;
  const buttons=[$("rshare"),$("rprint")];buttons.forEach(b=>b.disabled=true);
  try{
    const d=await getPackageChargeGroupShareData(ids),m=packageGroupDocumentModel(d);
    currentPackageGroup=d;renderPackageGroupReceipt();
    const cv=await packageGroupCanvas(d);
    await shareReceiptCanvasFile(cv,{pdf,title:m.title+" · Vaporeasy",name:(m.paid?"recibo-conjunto-planos":"mensalidade-conjunta-planos")+"-vaporeasy-"+cleanFileName(d.client?.name)})
  }catch(e){if(e?.name!=="AbortError")show("rgroupmsg",fail(e),"error")}
  finally{buttons.forEach(b=>b.disabled=false)}
}
// The same PNG/PDF pipeline is used by grouped receipts and package documents.
async function shareReceiptCanvasFile(cv,{pdf=false,title,name,text=""}){
  await settleCanvas(cv);let blob;
  if(pdf){
    const {jsPDF}=window.jspdf||{};if(!jsPDF)throw Error("Gerador de PDF indisponível.");
    const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
    let pw=180,ph=pw*(cv.height/cv.width);if(ph>270){ph=270;pw=ph*(cv.width/cv.height)}
    doc.addImage(cv.toDataURL("image/jpeg",0.92),"JPEG",(210-pw)/2,12,pw,ph);blob=doc.output("blob")
  }else blob=await canvasBlob(cv);
  const file=new File([blob],name+(pdf?".pdf":".png"),{type:pdf?"application/pdf":"image/png"});
  if(navigator.share&&navigator.canShare?.({files:[file]})){
    try{await navigator.share({title,files:[file],...(text?{text}:{})});return}catch(e){if(e?.name==="AbortError")return}
  }
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  show("rgroupmsg","Arquivo gerado. Você pode enviá-lo pelo WhatsApp.","ok")
}
async function sharePackageReceiptFile(pdf=false){
  if(!financeAllowed())return;
  const id=currentPackageReceipt?.charge.id;if(!id)return;
  const buttons=[$("rshare"),$("rprint")];buttons.forEach(b=>b.disabled=true);
  try{
    // Re-read status before exporting to avoid sending a pending document already paid.
    const d=await getPackageChargeShareData(id),m=packageDocumentModel(d);
    currentPackageReceipt=d;renderPackageReceipt();
    const cv=await packageChargeCanvas(d);
    await shareReceiptCanvasFile(cv,{pdf,title:m.title+" · Vaporeasy",name:(m.paid?"recibo-plano":"mensalidade-plano")+"-vaporeasy-"+cleanFileName(d.client?.name)})
  }catch(e){if(e?.name!=="AbortError")show("rgroupmsg",fail(e),"error")}
  finally{buttons.forEach(b=>b.disabled=false)}
}

async function loadFinance(){
  if(!financeAllowed())return;
  const k=financeMonthKeys();
  try{
    const sync=await sb.rpc("ensure_current_package_charges");
    if(sync.error)throw sync.error;
    const [ar,paid,ex,pkgMonth,pkgPaid,subs]=await Promise.all([
      sb.from("appointments").select("id,client_id,vehicle_id,service_id,recurring_plan_id,completed_at,starts_at,base_value,addon_value,discount_amount,final_value").eq("status","completed").is("deleted_at",null).gte("starts_at",k.startIso).lt("starts_at",k.nextIso).order("starts_at",{ascending:false}),
      sb.from("appointment_payments").select("*").eq("status","paid").gte("paid_at",k.startIso).lt("paid_at",k.nextIso).order("paid_at",{ascending:false}),
      sb.from("finance_expenses").select("*").gte("expense_date",k.startDate).lt("expense_date",k.nextDate).order("expense_date",{ascending:false}).order("created_at",{ascending:false}),
      sb.from("package_charges").select("*").eq("competence_month",k.startDate).neq("status","cancelled").order("created_at",{ascending:false}),
      sb.from("package_charges").select("*").eq("status","paid").gte("paid_at",k.startIso).lt("paid_at",k.nextIso).order("paid_at",{ascending:false}),
      sb.from("package_subscriptions").select("id,recurring_plan_id")
    ]);
    if(ar.error)throw ar.error;if(paid.error)throw paid.error;if(ex.error)throw ex.error;if(pkgMonth.error)throw pkgMonth.error;if(pkgPaid.error)throw pkgPaid.error;if(subs.error)throw subs.error;
    const monthApps=ar.data||[],rawPaidRows=paid.data||[],expenseRows=ex.data||[],packageMonthRows=pkgMonth.data||[],packagePaidRows=pkgPaid.data||[],packagePlanIds=new Set((subs.data||[]).map(x=>x.recurring_plan_id).filter(Boolean)),monthIds=monthApps.map(x=>x.id);
    let monthPayments=[];
    if(monthIds.length){const pr=await sb.from("appointment_payments").select("*").in("appointment_id",monthIds);if(pr.error)throw pr.error;monthPayments=pr.data||[]}
    const paidIds=rawPaidRows.map(x=>x.appointment_id),missingPaidIds=paidIds.filter(id=>!monthIds.includes(id));
    let otherApps=[];
    if(missingPaidIds.length){const rr=await sb.from("appointments").select("id,client_id,vehicle_id,service_id,recurring_plan_id,completed_at,base_value,addon_value,discount_amount,final_value").in("id",missingPaidIds);if(rr.error)throw rr.error;otherApps=rr.data||[]}
    const allApps=[...monthApps,...otherApps],allClientIds=[...allApps.map(x=>x.client_id),...packageMonthRows.map(x=>x.client_id),...packagePaidRows.map(x=>x.client_id)],allVehicleIds=[...allApps.map(x=>x.vehicle_id),...packageMonthRows.map(x=>x.vehicle_id),...packagePaidRows.map(x=>x.vehicle_id)],allServiceIds=[...allApps.map(x=>x.service_id),...packageMonthRows.map(x=>x.service_id),...packagePaidRows.map(x=>x.service_id)],clientIds=[...new Set(allClientIds.filter(Boolean))],vehicleIds=[...new Set(allVehicleIds.filter(Boolean))],serviceIds=[...new Set(allServiceIds.filter(Boolean))];
    const [cr,vr,sr]=await Promise.all([
      clientIds.length?sb.from("clients").select("id,name").in("id",clientIds):Promise.resolve({data:[],error:null}),
      vehicleIds.length?sb.from("vehicles").select("id,brand,model,plate").in("id",vehicleIds):Promise.resolve({data:[],error:null}),
      serviceIds.length?sb.from("services").select("id,name").in("id",serviceIds):Promise.resolve({data:[],error:null})
    ]);
    if(cr.error)throw cr.error;if(vr.error)throw vr.error;if(sr.error)throw sr.error;
    const maps=financeEntityMaps({clients:cr.data||[],vehicles:vr.data||[],services:sr.data||[]}),payMap=new Map(monthPayments.map(p=>[p.appointment_id,p])),appMap=new Map(allApps.map(a=>[a.id,a]));
    const serviceApps=monthApps.filter(a=>!packagePlanIds.has(a.recurring_plan_id)),paidRows=rawPaidRows.filter(p=>{const a=appMap.get(p.appointment_id);return !a||!packagePlanIds.has(a.recurring_plan_id)}),pendingApps=serviceApps.filter(a=>payMap.get(a.id)?.status!=="paid"),pendingPackage=packageMonthRows.filter(c=>c.status==="pending");
    const billedServices=serviceApps.reduce((sum,a)=>sum+Number(a.final_value||0),0),billedPackages=packageMonthRows.reduce((sum,c)=>sum+Number(c.amount||0),0),faturado=billedServices+billedPackages,receivedServices=paidRows.reduce((sum,p)=>sum+Number(p.amount||0),0),receivedPackages=packagePaidRows.reduce((sum,c)=>sum+Number(c.amount||0),0),recebido=receivedServices+receivedPackages,areceber=pendingApps.reduce((sum,a)=>sum+Number(payMap.get(a.id)?.amount??a.final_value??0),0)+pendingPackage.reduce((sum,c)=>sum+Number(c.amount||0),0),despesas=expenseRows.reduce((sum,e)=>sum+Number(e.amount||0),0);
    const serviceGroups=new Map(),paymentGroups=new Map(),expenseGroups=new Map();
    serviceApps.forEach(a=>{
      const name=maps.sm.get(a.service_id)?.name||"Serviço",g=serviceGroups.get(name)||{name,count:0,total:0};
      g.count++;g.total+=Number(a.final_value||0);serviceGroups.set(name,g)
    });
    packageMonthRows.forEach(c=>{
      const name=(maps.sm.get(c.service_id)?.name||"Pacote")+" ("+(packageFrequencyMeta(c.frequency)?.label||c.frequency)+")",g=serviceGroups.get(name)||{name,count:0,total:0};
      g.count++;g.total+=Number(c.amount||0);serviceGroups.set(name,g)
    });
    paidRows.forEach(p=>{
      const name=p.payment_method||"Não informado",g=paymentGroups.get(name)||{name,count:0,total:0};
      g.count++;g.total+=Number(p.amount||0);paymentGroups.set(name,g)
    });
    packagePaidRows.forEach(c=>{
      const name=c.payment_method||"Não informado",g=paymentGroups.get(name)||{name,count:0,total:0};
      g.count++;g.total+=Number(c.amount||0);paymentGroups.set(name,g)
    });
    expenseRows.forEach(e=>{
      const name=e.category||"Outros",g=expenseGroups.get(name)||{name,count:0,total:0};
      g.count++;g.total+=Number(e.amount||0);expenseGroups.set(name,g)
    });
    const descontos=serviceApps.reduce((sum,a)=>sum+Number(a.discount_amount||0),0),uniqueClients=new Set([...serviceApps.map(a=>a.client_id),...packageMonthRows.map(c=>c.client_id)]).size,uniqueVehicles=new Set([...serviceApps.map(a=>a.vehicle_id),...packageMonthRows.map(c=>c.vehicle_id)]).size,billedTransactions=serviceApps.length+packageMonthRows.length,ticket=billedTransactions?faturado/billedTransactions:0,competenceResult=faturado-despesas,cashResult=recebido-despesas,margin=faturado?competenceResult/faturado*100:0;
    currentFinanceMonthReport={
      keys:k,monthApps,serviceApps,paidRows,expenseRows,monthPayments,pendingApps,packageMonthRows,pendingPackage,packagePaidRows,allApps,maps,payMap,appMap,
      faturado,recebido,areceber,despesas,descontos,cashResult,competenceResult,margin,ticket,
      uniqueClients,uniqueVehicles,
      services:[...serviceGroups.values()].sort((a,b)=>b.total-a.total||b.count-a.count),
      paymentMethods:[...paymentGroups.values()].sort((a,b)=>b.total-a.total||b.count-a.count),
      expenseCategories:[...expenseGroups.values()].sort((a,b)=>b.total-a.total||b.count-a.count)
    };
    $("ffaturado").textContent=money(faturado);$("frecebido").textContent=money(recebido);$("fareceber").textContent=money(areceber);$("fdespesas").textContent=money(despesas);$("fsaldo").textContent=money(recebido-despesas);
    const monthlyClientCount=new Set(monthApps.map(a=>a.client_id).filter(Boolean)).size,monthlyDocHtml=financeMonthlyClientCards(monthApps,maps,k);
    $("fmonthdoccount").textContent="("+monthlyClientCount+")";$("fmonthdocs").innerHTML=monthlyDocHtml||'<div class="empty">Nenhum serviço concluído neste mês.</div>';
    const pendingCount=pendingApps.length+pendingPackage.length,paidCount=paidRows.length+packagePaidRows.length;
    $("fpendingcount").textContent="("+pendingCount+")";$("fpaidcount").textContent="("+paidCount+")";$("fexpensecount").textContent="("+expenseRows.length+")";
    const pendingHtml=financeReceiptGroupCards(serviceApps,payMap,maps,false)+financePackageCards(pendingPackage,maps,false,packageMonthRows)+pendingApps.map(a=>financeApptCard(a,payMap.get(a.id),maps,false)).join("");
    $("fpending").innerHTML=pendingCount?pendingHtml:'<div class="empty">Nenhum valor pendente neste mês.</div>';
    const paidHtml=financeReceiptGroupCards(serviceApps,payMap,maps,true)+financePackageCards(packagePaidRows,maps,true,packageMonthRows)+paidRows.map(p=>{const a=appMap.get(p.appointment_id);return a?financeApptCard(a,p,maps,true):""}).join("");
    $("fpaid").innerHTML=paidCount?paidHtml:'<div class="empty">Nenhum recebimento confirmado neste mês.</div>';
    $("fexpenses").innerHTML=expenseRows.length?expenseRows.map(e=>'<div class="item" style="margin-top:8px"><div class="actions" style="align-items:flex-start"><div style="flex:3"><div style="font-weight:900">'+esc(e.description)+'</div><div class="meta">'+esc(e.category)+' • '+esc(new Intl.DateTimeFormat("pt-BR").format(new Date(e.expense_date+"T12:00:00"))) +(e.notes?'<br>'+esc(e.notes):'')+'</div></div><div style="font-weight:950;font-size:18px">'+esc(money(e.amount))+'</div></div><div class="actions" style="margin-top:8px"><button type="button" class="ghost" data-exp-edit="'+e.id+'">Editar</button><button type="button" class="danger" data-exp-del="'+e.id+'">Excluir</button></div></div>').join(""):'<div class="empty">Nenhuma despesa registrada neste mês.</div>';
    document.querySelectorAll("[data-fin-pay]").forEach(b=>b.onclick=()=>openPayment(b.dataset.finPay));
    document.querySelectorAll("[data-pkg-pay]").forEach(b=>b.onclick=()=>openPackagePayment(b.dataset.pkgPay));document.querySelectorAll("[data-pkg-charge-share]").forEach(b=>b.onclick=()=>sharePackageCharge(b.dataset.pkgChargeShare));
    document.querySelectorAll("[data-pkg-group-pay]").forEach(b=>b.onclick=()=>openPackageGroupPayment((b.dataset.pkgGroupPay||"").split(",").filter(Boolean)));
    document.querySelectorAll("[data-pkg-group-share]").forEach(b=>b.onclick=()=>sharePackageChargeGroup((b.dataset.pkgGroupShare||"").split(",").filter(Boolean)));
    document.querySelectorAll("[data-fin-receipt]").forEach(b=>b.onclick=()=>openReceipt(b.dataset.finReceipt));
    document.querySelectorAll("[data-fin-group]").forEach(b=>b.onclick=()=>openReceiptGroup((b.dataset.finGroup||"").split(",").filter(Boolean)));
    document.querySelectorAll("[data-fin-month-client]").forEach(b=>b.onclick=()=>openMonthlyClientReceipt(b.dataset.finMonthClient,b.dataset.finMonth));
    document.querySelectorAll("[data-exp-edit]").forEach(b=>b.onclick=()=>openExpense(expenseRows.find(e=>e.id===b.dataset.expEdit)));
    document.querySelectorAll("[data-exp-del]").forEach(b=>b.onclick=()=>deleteExpense(b.dataset.expDel))
  }catch(e){show("msg",fail(e),"error")}
}

function financeMonthLabel(month){
  const [y,m]=String(month||"").split("-").map(Number);
  if(!y||!m)return month||"";
  const s=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(new Date(y,m-1,1));
  return s.charAt(0).toUpperCase()+s.slice(1)
}
function financeReportDate(iso){
  if(!iso)return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(iso.includes("T")?iso:iso+"T12:00:00"))
}
function financeReportText(doc,text,x,y,maxWidth,opts={}){
  const lines=doc.splitTextToSize(String(text??""),maxWidth);
  doc.text(lines,x,y,opts);
  return lines.length
}
async function generateMonthlyFinanceReportPdf(){
  if(!financeAllowed())return;
  const btn=$("fmonthreport");
  const original=btn.textContent;
  btn.disabled=true;btn.textContent="Preparando...";
  try{
    await loadFinance();
    const d=currentFinanceMonthReport;
    if(!d)throw Error("Não foi possível preparar os dados do mês.");
    const {jsPDF}=window.jspdf||{};
    if(!jsPDF)throw Error("Gerador de PDF indisponível.");

    const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
    const left=16,right=194,width=178;
    let y=16,pageNo=1;

    const newPage=()=>{
      doc.addPage();pageNo++;y=16;
      doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(125);
      doc.text("Vaporeasy • Relatório financeiro mensal",left,287);
      doc.text(String(pageNo),right,287,{align:"right"})
    };
    const ensure=need=>{if(y+need>276)newPage()};
    const section=title=>{
      ensure(16);y+=4;
      doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(19,58,77);
      doc.text(title,left,y);y+=5;
      doc.setDrawColor(200);doc.line(left,y,right,y);y+=6;
      doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(42)
    };
    const metric=(label,value,x,w)=>{
      doc.setDrawColor(224);doc.setFillColor(248,250,251);doc.roundedRect(x,y,w,18,2,2,"FD");
      doc.setFont("helvetica","normal");doc.setFontSize(7.8);doc.setTextColor(100);doc.text(label,x+4,y+5.5);
      doc.setFont("helvetica","bold");doc.setFontSize(11.5);doc.setTextColor(24,57,72);doc.text(String(value),x+4,y+13)
    };
    const row=(label,value,{bold=false}={})=>{
      ensure(7);
      doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(9);doc.setTextColor(45);
      doc.text(String(label),left,y);
      doc.setFont("helvetica",bold?"bold":"normal");doc.text(String(value),right,y,{align:"right"});
      y+=6
    };
    const tableHeader=cols=>{
      ensure(8);doc.setFillColor(239,245,247);doc.rect(left,y-4,width,7,"F");
      doc.setFont("helvetica","bold");doc.setFontSize(7.8);doc.setTextColor(68);
      cols.forEach(c=>doc.text(c.label,c.x,y,{align:c.align||"left"}));y+=5
    };
    const footer=()=>{
      doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(125);
      doc.text("Vaporeasy • Relatório financeiro mensal",left,287);
      doc.text(String(pageNo),right,287,{align:"right"})
    };

    // Header
    if(typeof brandLogoImg!=="undefined"&&brandLogoImg.complete&&brandLogoImg.naturalWidth){
      const lc=document.createElement("canvas");lc.width=500;lc.height=180;
      const lctx=lc.getContext("2d");lctx.fillStyle="#fff";lctx.fillRect(0,0,500,180);lctx.drawImage(brandLogoImg,0,0,500,180);
      doc.addImage(lc.toDataURL("image/jpeg",0.92),"JPEG",left,8,49,18)
    }else{
      doc.setFont("helvetica","bold");doc.setFontSize(19);doc.setTextColor(23,83,108);doc.text("VAPOREASY",left,19)
    }
    doc.setFont("helvetica","bold");doc.setFontSize(14);doc.setTextColor(25,48,60);doc.text("Relatório financeiro mensal",right,15,{align:"right"});
    doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(95);doc.text(financeMonthLabel(d.keys.month),right,21,{align:"right"});
    doc.setDrawColor(205);doc.line(left,29,right,29);y=38;

    // Executive metrics
    doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(24,57,72);doc.text("Resumo executivo",left,y);y+=7;
    const gap=4,w=(width-gap)/2;
    metric("Faturado no mês",money(d.faturado),left,w);
    metric("Recebido no mês",money(d.recebido),left+w+gap,w);y+=22;
    metric("A receber",money(d.areceber),left,w);
    metric("Despesas",money(d.despesas),left+w+gap,w);y+=22;
    metric("Saldo de caixa",money(d.cashResult),left,w);
    metric("Resultado por competência",money(d.competenceResult),left+w+gap,w);y+=25;

    row("Serviços concluídos",d.monthApps.length);
    row("Mensalidades de pacote faturadas",d.packageMonthRows?.length||0);
    row("Clientes atendidos",d.uniqueClients);
    row("Veículos atendidos",d.uniqueVehicles);
    row("Ticket médio",money(d.ticket));
    row("Descontos concedidos",money(d.descontos));
    row("Margem operacional aproximada",d.margin.toLocaleString("pt-BR",{maximumFractionDigits:1,minimumFractionDigits:1})+"%");
    y+=3;
    doc.setFont("helvetica","normal");doc.setFontSize(7.8);doc.setTextColor(105);
    const note="Saldo de caixa = recebimentos confirmados no mês menos despesas registradas. Resultado por competência = faturamento dos serviços avulsos concluídos e mensalidades de pacotes do mês, menos as despesas registradas.";
    y+=financeReportText(doc,note,left,y,width)*4+2;

    // Revenue by service
    section("Faturamento por serviço");
    if(!d.services.length){doc.text("Nenhum serviço concluído no mês.",left,y);y+=6}
    else{
      tableHeader([{label:"Serviço",x:left},{label:"Qtd.",x:151,align:"right"},{label:"Faturamento",x:right,align:"right"}]);
      for(const x of d.services){
        ensure(8);doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.setTextColor(45);
        const lines=doc.splitTextToSize(x.name,105);doc.text(lines,left,y);
        doc.text(String(x.count),151,y,{align:"right"});doc.text(money(x.total),right,y,{align:"right"});
        y+=Math.max(6,lines.length*4.3)
      }
    }

    // Payment methods
    section("Recebimentos por forma de pagamento");
    if(!d.paymentMethods.length){doc.text("Nenhum recebimento confirmado no mês.",left,y);y+=6}
    else d.paymentMethods.forEach(x=>row(x.name,x.count+" receb. • "+money(x.total)));

    // Expense categories
    section("Despesas por categoria");
    if(!d.expenseCategories.length){doc.text("Nenhuma despesa registrada no mês.",left,y);y+=6}
    else d.expenseCategories.forEach(x=>row(x.name,x.count+" lançamento(s) • "+money(x.total)));

    // Pending receivables
    section("Valores a receber");
    if(!d.pendingApps.length&&!(d.pendingPackage?.length)){doc.text("Nenhuma pendência neste mês.",left,y);y+=6}
    else{
      tableHeader([{label:"Cliente / serviço",x:left},{label:"Data",x:158,align:"right"},{label:"Valor",x:right,align:"right"}]);
      for(const c of (d.pendingPackage||[])){
        const cl=d.maps.cm.get(c.client_id),sv=d.maps.sm.get(c.service_id),meta=packageFrequencyMeta(c.frequency),label=(cl?.name||"Cliente")+" • "+(sv?.name||"Pacote")+" • "+(meta?.label||c.frequency);
        ensure(10);doc.setFont("helvetica","normal");doc.setFontSize(8.2);doc.setTextColor(45);
        const lines=doc.splitTextToSize(label,112);doc.text(lines,left,y);
        doc.text(financePackageDate(c.due_date),158,y,{align:"right"});
        doc.text(money(c.amount||0),right,y,{align:"right"});
        y+=Math.max(6,lines.length*4.2)
      }
      for(const a of d.pendingApps){
        const cl=d.maps.cm.get(a.client_id),sv=d.maps.sm.get(a.service_id),p=d.payMap.get(a.id);
        const label=(cl?.name||"Cliente")+" • "+(sv?.name||"Serviço");
        ensure(10);doc.setFont("helvetica","normal");doc.setFontSize(8.2);doc.setTextColor(45);
        const lines=doc.splitTextToSize(label,112);doc.text(lines,left,y);
        doc.text(financeReportDate(a.completed_at),158,y,{align:"right"});
        doc.text(money(p?.amount??a.final_value??0),right,y,{align:"right"});
        y+=Math.max(6,lines.length*4.2)
      }
      row("Total a receber",money(d.areceber),{bold:true})
    }

    // Cash receipts detail
    section("Recebimentos do mês");
    if(!d.paidRows.length&&!(d.packagePaidRows?.length)){doc.text("Nenhum recebimento confirmado no mês.",left,y);y+=6}
    else{
      tableHeader([{label:"Cliente / serviço",x:left},{label:"Forma",x:151,align:"right"},{label:"Valor",x:right,align:"right"}]);
      for(const c of (d.packagePaidRows||[])){
        const cl=d.maps.cm.get(c.client_id),sv=d.maps.sm.get(c.service_id),meta=packageFrequencyMeta(c.frequency),label=(cl?.name||"Cliente")+" • "+(sv?.name||"Pacote")+" • "+(meta?.label||c.frequency)+" • "+financeReportDate(c.paid_at);
        ensure(10);doc.setFont("helvetica","normal");doc.setFontSize(8.1);doc.setTextColor(45);
        const lines=doc.splitTextToSize(label,108);doc.text(lines,left,y);
        doc.text(String(c.payment_method||"—"),151,y,{align:"right"});
        doc.text(money(c.amount||0),right,y,{align:"right"});
        y+=Math.max(6,lines.length*4.2)
      }
      for(const p of d.paidRows){
        const a=d.appMap.get(p.appointment_id),cl=a?d.maps.cm.get(a.client_id):null,sv=a?d.maps.sm.get(a.service_id):null;
        const label=(cl?.name||"Cliente")+" • "+(sv?.name||"Serviço")+" • "+financeReportDate(p.paid_at);
        ensure(10);doc.setFont("helvetica","normal");doc.setFontSize(8.1);doc.setTextColor(45);
        const lines=doc.splitTextToSize(label,108);doc.text(lines,left,y);
        doc.text(String(p.payment_method||"—"),151,y,{align:"right"});
        doc.text(money(p.amount||0),right,y,{align:"right"});
        y+=Math.max(6,lines.length*4.2)
      }
      row("Total recebido",money(d.recebido),{bold:true})
    }

    // Expense details
    section("Detalhamento de despesas");
    if(!d.expenseRows.length){doc.text("Nenhuma despesa registrada no mês.",left,y);y+=6}
    else{
      tableHeader([{label:"Descrição",x:left},{label:"Categoria",x:151,align:"right"},{label:"Valor",x:right,align:"right"}]);
      for(const e of d.expenseRows){
        const label=financeReportDate(e.expense_date)+" • "+(e.description||"Despesa");
        ensure(10);doc.setFont("helvetica","normal");doc.setFontSize(8.1);doc.setTextColor(45);
        const lines=doc.splitTextToSize(label,104);doc.text(lines,left,y);
        doc.text(String(e.category||"Outros"),151,y,{align:"right"});
        doc.text(money(e.amount||0),right,y,{align:"right"});
        y+=Math.max(6,lines.length*4.2)
      }
      row("Total de despesas",money(d.despesas),{bold:true})
    }

    // Closing
    ensure(28);y+=6;doc.setDrawColor(205);doc.line(left,y,right,y);y+=8;
    doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(30,58,72);doc.text("Observação",left,y);y+=5;
    doc.setFont("helvetica","normal");doc.setFontSize(7.8);doc.setTextColor(95);
    const closing="Relatório interno gerencial. Os valores refletem os lançamentos registrados no Vaporeasy até a data de geração e não substituem demonstrações contábeis ou fiscais oficiais.";
    y+=financeReportText(doc,closing,left,y,width)*4+3;
    doc.text("Gerado em "+new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date())+" por "+($("pname").textContent||"Vaporeasy")+".",left,y);
    footer();

    const file="relatorio-financeiro-vaporeasy-"+d.keys.month+".pdf";
    const blob=doc.output("blob"),pdfFile=new File([blob],file,{type:"application/pdf"});
    if(navigator.share&&navigator.canShare?.({files:[pdfFile]})){
      await navigator.share({title:"Relatório financeiro Vaporeasy • "+financeMonthLabel(d.keys.month),files:[pdfFile]});
      return
    }
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
    show("msg","Relatório financeiro mensal gerado em PDF.","ok")
  }catch(e){
    if(e?.name!=="AbortError")show("msg",fail(e),"error")
  }finally{
    btn.disabled=false;btn.textContent=original
  }
}
function openExpense(e=null){
  if(!financeAllowed())return;$("exf").reset();show("exmsg","");$("exid").value=e?.id||"";$("extitle").textContent=e?"Editar despesa":"Nova despesa";$("exdate").value=e?.expense_date||today();$("excat").value=e?.category||"Outros";$("exdesc").value=e?.description||"";$("examount").value=e?.amount??"";$("exnotes").value=e?.notes||"";$("exd").showModal()
}
async function saveExpense(e){
  e.preventDefault();if(!financeAllowed())return;
  const id=$("exid").value,p={expense_date:$("exdate").value,category:$("excat").value,description:$("exdesc").value.trim(),amount:Number($("examount").value||0),notes:$("exnotes").value.trim(),updated_by:currentUserId};
  if(!p.expense_date||!p.description||p.amount<0)return show("exmsg","Preencha data, descrição e valor.","error");
  try{
    let r;if(id)r=await sb.from("finance_expenses").update(p).eq("id",id);else r=await sb.from("finance_expenses").insert({...p,created_by:currentUserId});
    if(r.error)throw r.error;$("exd").close();show("msg",id?"Despesa atualizada.":"Despesa registrada.","ok");await loadFinance()
  }catch(err){show("exmsg",fail(err),"error")}
}
async function deleteExpense(id){
  if(!financeAllowed()||!confirm("Excluir esta despesa?"))return;
  const r=await sb.from("finance_expenses").delete().eq("id",id);if(r.error)return show("msg",fail(r.error),"error");show("msg","Despesa excluída.","ok");await loadFinance()
}
let agendaCalendarMonth="",agendaViewMode="day",agendaListLoadSeq=0,agendaFocusAppointmentId="";
