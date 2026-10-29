// Conclusão direta: não exige fotografia nem justificativa.
// Impede duplo envio e preserva a validação de atribuição/perfil no RPC do operador.
const completionInFlight=new Set();
async function openCompletion(id){
  const a=currentApps.find(x=>String(x.id)===String(id));
  if(!a)return show("msg","Atendimento não encontrado.","error");
  if(a.status!=="in_progress")return show("msg","Inicie o atendimento antes de concluir.","error");
  if(completionInFlight.has(id))return;
  completionInFlight.add(id);
  try{
    if(currentRole==="operator"){
      const u=await sb.rpc("operator_complete_job",{p_appointment_id:id});
      if(u.error)throw u.error;
    }else{
      const u=await sb.from("appointments")
        .update({status:"completed",completed_at:new Date().toISOString()})
        .eq("id",id).eq("status","in_progress").is("deleted_at",null).select("id");
      if(u.error)throw u.error;
      if(!u.data?.length)throw Error("Atendimento não está em execução ou já foi concluído.");
    }
    agendaMonthCache.clear();operatorMonthCache.clear();waterCounterLoadedAt=0;
    show("msg","Atendimento concluído.","ok");
    if(currentRole==="operator")await Promise.all([loadOperatorJobs(operatorSelectedDate,false),loadOperatorMonth(true)]);
    else await loadApps();
  }catch(e){show("msg",fail(e),"error")}
  finally{completionInFlight.delete(id)}
}
async function loadRemoteImage(url){
  if(!url)return null;
  try{
    const r=await fetch(url);if(!r.ok)return null;const blob=await r.blob(),obj=URL.createObjectURL(blob);
    const im=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=reject;x.src=obj});
    setTimeout(()=>URL.revokeObjectURL(obj),1000);return im
  }catch{return null}
}
async function loadCompletionPhotoImage(d){
  const path=d?.photo?.storage_path;
  if(!path)return d?.photo_url?await loadRemoteImage(d.photo_url):null;
  try{
    const dl=await sb.storage.from("completion-photos").download(path);
    if(dl.error||!dl.data)throw dl.error||Error("Foto indisponível");
    if("createImageBitmap" in window){
      return await createImageBitmap(dl.data)
    }
    const obj=URL.createObjectURL(dl.data);
    const im=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(Error("Não foi possível decodificar a foto final."));x.src=obj});
    setTimeout(()=>URL.revokeObjectURL(obj),2000);
    return im
  }catch(e){
    const fallback=d?.photo_url?await loadRemoteImage(d.photo_url):null;
    if(fallback)return fallback;
    throw Error("A foto final está salva, mas não pôde ser incorporada ao comprovante. Tente novamente.")
  }
}
function drawImageCover(ctx,img,x,y,w,h,r=14){
  if(!img)return false;
  const iw=Number(img.width||img.naturalWidth||0),ih=Number(img.height||img.naturalHeight||0);
  if(!iw||!ih)return false;
  const s=Math.max(w/iw,h/ih),sw=w/s,sh=h/s,sx=(iw-sw)/2,sy=(ih-sh)/2;
  ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);
  if(r){ctx.strokeStyle="#d9d5ce";ctx.lineWidth=2;ctx.strokeRect(x,y,w,h)}
  return true
}
function verifyCanvasPhoto(cv){
  const raw=cv.dataset.completionPhotoRect;
  if(!raw)return false;
  const [sx,sy,sw,sh]=raw.split(",").map(Number);
  if(![sx,sy,sw,sh].every(Number.isFinite))return false;
  const tc=document.createElement("canvas");tc.width=48;tc.height=32;
  const tctx=tc.getContext("2d",{willReadFrequently:true});
  tctx.drawImage(cv,sx,sy,sw,sh,0,0,48,32);
  const d=tctx.getImageData(0,0,48,32).data;
  let min=255,max=0,sum=0,n=0;
  for(let i=0;i<d.length;i+=4){
    const lum=(d[i]+d[i+1]+d[i+2])/3;
    min=Math.min(min,lum);max=Math.max(max,lum);sum+=lum;n++
  }
  const avg=sum/Math.max(1,n);
  return (max-min)>8 || avg<235
}
async function settleCanvas(cv){
  try{cv.getContext("2d").getImageData(0,0,1,1)}catch{}
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,40)))
}
const financeAllowed=()=>["owner","admin"].includes(currentRole);
const receiptDate=i=>new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(i));
function findVehicleLocal(id){for(const list of vehicles.values()){const v=(list||[]).find(x=>x.id===id);if(v)return v}return null}
async function getReceiptData(id){
  let x=currentApps.find(a=>a.id===id);
  if(!x){const ar=await sb.from("appointments").select("*").eq("id",id).single();if(ar.error)throw ar.error;x=ar.data}
  let client=clients.find(c=>c.id===x.client_id);if(!client){const cr=await sb.from("clients").select("*").eq("id",x.client_id).single();if(!cr.error)client=cr.data}
  let vehicle=findVehicleLocal(x.vehicle_id);if(!vehicle){const vr=await sb.from("vehicles").select("*").eq("id",x.vehicle_id).single();if(!vr.error)vehicle=vr.data}
  let service=services.find(s=>s.id===x.service_id);if(!service){const sr=await sb.from("services").select("*").eq("id",x.service_id).single();if(!sr.error)service=sr.data}
  const [ax,py,bs,wc,ph]=await Promise.all([sb.from("appointment_addons").select("*").eq("appointment_id",id).order("created_at"),sb.from("appointment_payments").select("*").eq("appointment_id",id).maybeSingle(),sb.from("business_payment_settings").select("*").eq("id",1).single(),sb.from("appointments").select("id",{count:"exact",head:true}).eq("status","completed").is("deleted_at",null).gte("completed_at",WATER_BASE_AT),sb.from("appointment_completion_photos").select("*").eq("appointment_id",id).maybeSingle()]);
  if(ax.error)throw ax.error;if(py.error)throw py.error;if(bs.error)throw bs.error;if(ph.error)throw ph.error;
  let photo_url="";if(ph.data?.storage_path){const su=await sb.storage.from("completion-photos").createSignedUrl(ph.data.storage_path,3600);if(!su.error)photo_url=su.data?.signedUrl||""}
  const totalWater=WATER_BASE_LITERS+(wc.count||0)*WATER_PER_COMPLETED_SERVICE;return{x,client,vehicle,service,addons:ax.data||[],payment:py.data||{status:"pending",amount:x.final_value},bank:bs.data,totalWater,photo:ph.data||null,photo_url}
}
function receiptAmounts(d){
  const addonItems=(d.addons||[]).reduce((sum,a)=>sum+Number(a.unit_price||0),0);
  const addon=Math.max(0,Number(d.x?.addon_value||0),addonItems);
  const discount=Math.max(0,Number(d.x?.discount_amount||0));
  const storedBase=Math.max(0,Number(d.x?.base_value||0));
  const storedFinal=Math.max(0,Number(d.x?.final_value||0));
  const paidAmount=Math.max(0,Number(d.payment?.amount||0));
  const servicePrice=Math.max(0,Number(d.service?.price||0));
  const finalSeed=storedFinal>0?storedFinal:paidAmount;
  let gross=storedBase+addon;
  if(gross<=0&&finalSeed+discount>0)gross=finalSeed+discount;
  if(gross<=0&&servicePrice+addon>0)gross=servicePrice+addon;
  const base=Math.max(0,gross-addon);
  const finalValue=(storedFinal>0||paidAmount>0||gross===discount)?finalSeed:Math.max(0,gross-discount);
  return{base,addon,discount,gross,final:finalValue}
}
function receiptText(d){
  const paid=d.payment?.status==="paid",amt=receiptAmounts(d),lines=[
    paid?"RECIBO DE PAGAMENTO VAPOREASY":"COMPROVANTE DE SERVIÇO REALIZADO — VAPOREASY",
    "Cliente: "+(d.client?.name||"Cliente"),
    "Veículo: "+(d.vehicle?(d.vehicle.brand+" "+d.vehicle.model+(d.vehicle.plate?" • "+d.vehicle.plate:"")):"Veículo"),
    "Serviço: "+(d.service?.name||"Serviço"),
    "Valor do serviço: "+money(amt.base)
  ];
  d.addons.forEach(a=>lines.push("Extra: "+a.addon_name+" — "+money(a.unit_price)));
  if(amt.discount>0)lines.push("Valor original: "+money(amt.gross),"Desconto: - "+money(amt.discount));
  lines.push("Valor total: "+money(amt.final));
  if(paid){
    lines.push("Pagamento recebido: "+receiptDate(d.payment.paid_at||new Date()),"Forma: "+(d.payment.payment_method||"—"))
  }else{
    lines.push("Pagamento pendente","Chave Pix: "+d.bank.pix_key,"Banco: "+d.bank.bank_name+" • Ag. "+d.bank.branch+" • C/C "+d.bank.account_number,"Favorecido: "+d.bank.account_holder)
  }
  lines.push("","Obrigado por escolher a Vaporeasy. Neste atendimento você participou diretamente de uma economia estimada de "+WATER_PER_COMPLETED_SERVICE+" litros de água.","A Vaporeasy já contribuiu para uma economia estimada de "+new Intl.NumberFormat("pt-BR").format(d.totalWater)+" litros de água.");
  return lines.join("\n")
}
function receiptHtml(d){
  const paid=d.payment?.status==="paid",amt=receiptAmounts(d),veh=d.vehicle?(d.vehicle.brand+" "+d.vehicle.model+(d.vehicle.plate?" • "+d.vehicle.plate:"")):"Veículo",when=d.x.completed_at||d.x.starts_at,extras=d.addons.map(a=>'<div class="receipt-line"><span>'+esc(a.addon_name)+'</span><b>'+esc(money(a.unit_price))+'</b></div>').join(""),discountLine=amt.discount>0?'<div class="receipt-line receipt-discount"><span>Desconto</span><b>− '+esc(money(amt.discount))+'</b></div>':"";
  if(!paid){
    return '<div style="background:#f3f1ec;border:1px solid #dedbd4;border-radius:18px;padding:20px;color:#172832">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #d7d3cb;padding-bottom:14px"><div><img src="'+BRAND_LOGO+'" alt="Vaporeasy" style="width:190px;max-width:48vw;height:auto;display:block"></div><div style="font-size:10px;color:#7b878d;text-align:right;line-height:1.5">ATENDIMENTO CONCLUÍDO<br>'+esc(receiptDate(when))+'</div></div>'+
      '<div style="margin-top:22px;font-family:Georgia,serif;font-size:24px;line-height:1.25;color:#172832">Estética concluída.<br>Obrigado pela confiança.</div>'+
      '<div style="margin-top:20px;padding:15px 0;border-top:1px solid #d7d3cb;border-bottom:1px solid #d7d3cb"><div style="font-size:10px;color:#7b878d;font-weight:800;letter-spacing:1px">CLIENTE</div><div style="font-size:16px;font-weight:850;margin-top:4px">'+esc(d.client?.name||"Cliente")+'</div><div style="margin-top:13px;font-size:10px;color:#7b878d;font-weight:800;letter-spacing:1px">VEÍCULO</div><div style="font-size:16px;font-weight:850;margin-top:4px">'+esc(veh)+'</div><div style="margin-top:13px;font-size:10px;color:#7b878d;font-weight:800;letter-spacing:1px">SERVIÇO</div><div style="font-size:15px;margin-top:4px">'+esc(d.service?.name||"Serviço")+'</div></div>'+
      '<div class="receipt-lines" style="border:0;margin:14px 0 0;padding:0"><div class="receipt-line"><span>'+esc(d.service?.name||"Serviço")+'</span><b>'+esc(money(amt.base))+'</b></div>'+extras+discountLine+'</div>'+
      '<div style="display:flex;justify-content:space-between;align-items:end;border-top:1px solid #d7d3cb;margin-top:13px;padding-top:15px"><span style="font-size:11px;color:#6c797f;font-weight:800;letter-spacing:.8px">TOTAL DO ATENDIMENTO</span><span style="font-size:27px;font-weight:950;color:#172832">'+esc(money(amt.final))+'</span></div>'+
      '<div style="margin-top:20px;background:#fff;border:1px solid #dedbd4;border-radius:13px;padding:15px"><div style="font-size:10px;color:#7b878d;font-weight:800;letter-spacing:1px">PAGAMENTO PENDENTE</div><div style="margin-top:8px;font-size:10px;color:#7b878d;font-weight:800;letter-spacing:.8px">CHAVE PIX</div><div style="margin-top:3px;font-size:17px;font-weight:900;color:#27485a">'+esc(d.bank.pix_key)+'</div><div style="font-size:11px;line-height:1.7;color:#5d6b72;margin-top:7px">'+esc(d.bank.bank_name)+' · Ag. '+esc(d.bank.branch)+' · C/C '+esc(d.bank.account_number)+'<br>'+esc(d.bank.account_holder)+'</div></div>'+
      '<div style="margin-top:18px;padding-top:15px;border-top:1px solid #d7d3cb"><div style="font-size:10px;color:#7b878d;font-weight:800;letter-spacing:1px">IMPACTO POSITIVO</div><div style="margin-top:6px;color:#3f5159;line-height:1.55">Este atendimento representa uma economia estimada de <b>'+WATER_PER_COMPLETED_SERVICE+' litros de água</b>.<br><span style="font-size:11px;color:#7b878d">Economia acumulada estimada da Vaporeasy: '+esc(new Intl.NumberFormat("pt-BR").format(d.totalWater))+' litros.</span></div></div>'+
      '<div style="margin-top:20px;font-size:10px;color:#90999d">Vaporeasy · cuidado automotivo com discrição, conveniência e responsabilidade.</div></div>'
  }
  return '<div class="receipt-sheet"><div class="receipt-head"><div><img src="'+BRAND_LOGO+'" alt="Vaporeasy" style="width:180px;height:auto;display:block"></div><div style="text-align:right"><div class="receipt-title">Recibo de pagamento</div><div class="receipt-muted">'+esc(receiptDate(d.payment.paid_at||when))+'</div></div></div><div class="receipt-grid"><div class="receipt-box"><b>Cliente</b>'+esc(d.client?.name||"Cliente")+'</div><div class="receipt-box"><b>Veículo</b>'+esc(veh)+'</div><div class="receipt-box"><b>Serviço</b>'+esc(d.service?.name||"Serviço")+'</div><div class="receipt-box"><b>Forma de pagamento</b>'+esc(d.payment.payment_method||"—")+'</div></div><div class="receipt-lines"><div class="receipt-line"><span>'+esc(d.service?.name||"Serviço")+'</span><b>'+esc(money(amt.base))+'</b></div>'+extras+discountLine+'</div><div class="receipt-total"><span>Valor recebido</span><span>'+esc(money(amt.final))+'</span></div><div class="receipt-pay"><span class="paid-pill">PAGAMENTO RECEBIDO</span><div style="margin-top:8px"><b>Recebido em:</b> '+esc(receiptDate(d.payment.paid_at||new Date()))+'<br><b>Forma:</b> '+esc(d.payment.payment_method||"—")+'<br><b>Favorecido:</b> '+esc(d.bank.account_holder)+'</div></div><p class="receipt-muted" style="margin-top:14px">Documento gerado pelo sistema Vaporeasy.</p></div>'
}
async function getReceiptGroupData(ids){
  const unique=[...new Set((ids||[]).filter(Boolean))];
  if(unique.length<2)throw Error("Selecione pelo menos dois atendimentos para o documento conjunto.");
  const items=await Promise.all(unique.map(getReceiptData));
  const first=items[0];
  if(items.some(d=>d.x.client_id!==first.x.client_id))throw Error("O documento conjunto só pode reunir atendimentos do mesmo cliente.");
  const days=[...new Set(items.map(d=>agendaLocalDateKey(d.x.completed_at||d.x.starts_at)))];
  if(days.length!==1)throw Error("O documento conjunto só pode reunir atendimentos do mesmo dia.");
  const allPaid=items.every(d=>d.payment?.status==="paid");
  const nonePaid=items.every(d=>d.payment?.status!=="paid");
  const total=items.reduce((sum,d)=>sum+receiptAmounts(d).final,0);
  const gross=items.reduce((sum,d)=>sum+receiptAmounts(d).gross,0);
  const discount=items.reduce((sum,d)=>sum+receiptAmounts(d).discount,0);
  const methods=[...new Set(items.filter(d=>d.payment?.status==="paid").map(d=>d.payment?.payment_method).filter(Boolean))];
  const paidAt=items.filter(d=>d.payment?.paid_at).map(d=>new Date(d.payment.paid_at)).sort((a,b)=>b-a)[0]||null;
  return{
    isGroup:true,items,client:first.client,bank:first.bank,dateKey:days[0],
    allPaid,nonePaid,total,gross,discount,methods,paidAt,
    waterForGroup:items.length*WATER_PER_COMPLETED_SERVICE,
    totalWater:Math.max(...items.map(d=>Number(d.totalWater||0)))
  }
}
function groupReceiptVehicleGroups(g){
  const map=new Map();
  for(const d of g.items){
    const key=d.x?.vehicle_id||"unknown",a=receiptAmounts(d);
    let row=map.get(key);
    if(!row){
      const veh=d.vehicle?(d.vehicle.brand+" "+d.vehicle.model+(d.vehicle.plate?" • "+d.vehicle.plate:"")):"Veículo";
      row={key,vehicle:veh,items:[],gross:0,discount:0,total:0};
      map.set(key,row)
    }
    row.items.push(d);row.gross+=a.gross;row.discount+=a.discount;row.total+=a.final
  }
  return [...map.values()].map(row=>({
    ...row,
    dates:row.items.map(d=>agendaLocalDateKey(d.x?.starts_at||d.x?.completed_at)).filter(Boolean).sort(),
    services:[...new Set(row.items.map(d=>d.service?.name||"Serviço"))]
  }))
}
function groupReceiptHtml(g){
  const paid=g.allPaid,dateLabel=new Intl.DateTimeFormat("pt-BR").format(new Date(g.dateKey+"T12:00:00")),groups=groupReceiptVehicleGroups(g);
  const rows=groups.map(v=>{
    const dates=v.dates.map(x=>new Intl.DateTimeFormat("pt-BR").format(new Date(x+"T12:00:00"))).join(" · ");
    const services=v.services.join(" + ");
    return '<div style="padding:15px 0;border-bottom:1px solid #dedbd4">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div style="font-weight:900;color:#172832">'+esc(v.vehicle)+'</div><b style="color:#172832;white-space:nowrap">'+esc(money(v.total))+'</b></div>'+
      '<div style="margin-top:5px;color:#5d6b72;font-weight:700">'+v.items.length+' estética'+(v.items.length===1?"":"s")+' realizada'+(v.items.length===1?"":"s")+'</div>'+
      '<div style="font-size:12px;color:#71808a;margin-top:4px">'+esc(services)+'</div>'+
      '<div style="font-size:11px;color:#71808a;margin-top:4px">Datas: '+esc(dates)+'</div>'+
      (v.discount>0?'<div style="font-size:11px;color:#7d4d28;margin-top:5px">Valor original '+esc(money(v.gross))+' · descontos − '+esc(money(v.discount))+'</div>':'')+
      '</div>'
  }).join("");
  const statusBlock=paid
    ?'<div style="margin-top:20px;background:#edf8f1;border:1px solid #bfdfca;border-radius:13px;padding:15px"><div style="font-size:10px;color:#437157;font-weight:900;letter-spacing:1px">PAGAMENTO RECEBIDO</div><div style="margin-top:7px;color:#36584a"><b>Forma:</b> '+esc(g.methods.join(", ")||"—")+(g.paidAt?'<br><b>Último recebimento:</b> '+esc(receiptDate(g.paidAt)):'')+'</div></div>'
    :'<div style="margin-top:20px;background:#fff;border:1px solid #dedbd4;border-radius:13px;padding:15px"><div style="font-size:10px;color:#7b878d;font-weight:900;letter-spacing:1px">PAGAMENTO PENDENTE</div><div style="margin-top:8px;font-size:10px;color:#7b878d;font-weight:800;letter-spacing:.8px">CHAVE PIX</div><div style="margin-top:3px;font-size:17px;font-weight:900;color:#27485a">'+esc(g.bank.pix_key)+'</div><div style="font-size:11px;line-height:1.7;color:#5d6b72;margin-top:7px">'+esc(g.bank.bank_name)+' · Ag. '+esc(g.bank.branch)+' · C/C '+esc(g.bank.account_number)+'<br>'+esc(g.bank.account_holder)+'</div></div>';
  return '<div style="background:#f3f1ec;border:1px solid #dedbd4;border-radius:18px;padding:20px;color:#172832">'+
    '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #d7d3cb;padding-bottom:14px"><div><img src="'+BRAND_LOGO+'" alt="Vaporeasy" style="width:190px;max-width:48vw;height:auto;display:block"></div><div style="font-size:10px;color:#7b878d;text-align:right;line-height:1.5">'+(paid?'RECIBO DE PAGAMENTO':'ATENDIMENTOS CONCLUÍDOS')+'<br>'+esc(dateLabel)+'</div></div>'+
    '<div style="margin-top:22px;font-family:Georgia,serif;font-size:24px;line-height:1.25;color:#172832">'+g.items.length+' estética'+(g.items.length===1?"":"s")+' realizada'+(g.items.length===1?"":"s")+' em '+groups.length+' veículo'+(groups.length===1?"":"s")+'.<br>Obrigado pela confiança.</div>'+
    '<div style="margin-top:20px;padding:15px 0;border-top:1px solid #d7d3cb"><div style="font-size:10px;color:#7b878d;font-weight:800;letter-spacing:1px">CLIENTE</div><div style="font-size:17px;font-weight:900;margin-top:4px">'+esc(g.client?.name||"Cliente")+'</div></div>'+
    '<div>'+rows+'</div>'+
    (g.discount>0?'<div style="display:flex;justify-content:space-between;margin-top:12px;color:#7d4d28"><span>Descontos concedidos</span><b>− '+esc(money(g.discount))+'</b></div>':'')+
    '<div style="display:flex;justify-content:space-between;align-items:end;border-top:1px solid #d7d3cb;margin-top:14px;padding-top:15px"><span style="font-size:11px;color:#6c797f;font-weight:800;letter-spacing:.8px">TOTAL '+(paid?'RECEBIDO':'DO ATENDIMENTO')+'</span><span style="font-size:27px;font-weight:950;color:#172832">'+esc(money(g.total))+'</span></div>'+
    statusBlock+
    '<div style="margin-top:18px;padding-top:15px;border-top:1px solid #d7d3cb"><div style="font-size:10px;color:#7b878d;font-weight:800;letter-spacing:1px">IMPACTO POSITIVO</div><div style="margin-top:6px;color:#3f5159;line-height:1.55">Estas '+g.items.length+' estéticas representam uma economia estimada de <b>'+esc(new Intl.NumberFormat("pt-BR").format(g.waterForGroup))+' litros de água</b>.<br><span style="font-size:11px;color:#7b878d">Economia acumulada estimada da Vaporeasy: '+esc(new Intl.NumberFormat("pt-BR").format(g.totalWater))+' litros.</span></div></div>'+
    '<div style="margin-top:20px;font-size:10px;color:#90999d">Vaporeasy · cuidado automotivo com discrição, conveniência e responsabilidade.</div></div>'
}
async function openReceiptGroup(ids){
  currentPackageReceipt=null;currentPackageGroup=null;currentMonthlyReceipt=null;
  if(!financeAllowed())return show("msg","Seu nível de acesso não permite visualizar valores e dados bancários.","error");
  try{
    currentReceipt=null;
    currentReceiptGroup=await getReceiptGroupData(ids);
    $("rcontent").innerHTML=groupReceiptHtml(currentReceiptGroup);
    $("rshare").textContent=currentReceiptGroup.allPaid?"Compartilhar recibo conjunto":"Compartilhar comprovante conjunto";
    show("rgroupmsg","");
    $("rgroup").classList.add("hidden");
    $("rdiscount").textContent="Aplicar desconto";
    $("rdiscount").classList.toggle("hidden",currentReceiptGroup.allPaid);
    $("rcharge").classList.toggle("hidden",currentReceiptGroup.allPaid);
    $("rprint").textContent="Compartilhar PDF";
    $("rd").showModal()
  }catch(e){show("msg",fail(e),"error")}
}
async function openReceipt(id){
  currentPackageReceipt=null;currentPackageGroup=null;currentMonthlyReceipt=null;
  if(!financeAllowed())return show("msg","Seu nível de acesso não permite visualizar valores e dados bancários.","error");
  try{
    currentReceiptGroup=null;
    currentReceipt=await getReceiptData(id);
    const paid=currentReceipt.payment?.status==="paid";
    $("rcontent").innerHTML=receiptHtml(currentReceipt);
    $("rshare").textContent=paid?"Compartilhar recibo":"Compartilhar comprovante";
    show("rgroupmsg","");
    $("rgroup").textContent=paid?"Agrupar recibos deste cliente":"Agrupar comprovantes deste cliente";
    $("rgroup").classList.remove("hidden");
    $("rdiscount").classList.toggle("hidden",paid);
    $("rcharge").classList.toggle("hidden",paid);
    $("rprint").textContent="Compartilhar PDF";
    $("rd").showModal();
  }catch(e){show("msg",fail(e),"error")}
}
async function openSameClientReceiptGroup(){
  if(!currentReceipt||currentReceiptGroup)return;
  const clientId=currentReceipt.x?.client_id,baseId=currentReceipt.x?.id;
  if(!clientId||!baseId)return;
  const paid=currentReceipt.payment?.status==="paid";
  const dateKey=agendaLocalDateKey(currentReceipt.x.completed_at||currentReceipt.x.starts_at);
  const startIso=new Date(dateKey+"T00:00:00-03:00").toISOString();
  const nextDate=new Date(dateKey+"T12:00:00-03:00");nextDate.setDate(nextDate.getDate()+1);
  const nextKey=nextDate.getFullYear()+"-"+String(nextDate.getMonth()+1).padStart(2,"0")+"-"+String(nextDate.getDate()).padStart(2,"0");
  const nextIso=new Date(nextKey+"T00:00:00-03:00").toISOString();
  try{
    show("rgroupmsg","Procurando outros atendimentos deste cliente...","");
    const ar=await sb.from("appointments")
      .select("id,completed_at")
      .eq("client_id",clientId)
      .eq("status","completed")
      .is("deleted_at",null)
      .gte("completed_at",startIso)
      .lt("completed_at",nextIso)
      .order("completed_at");
    if(ar.error)throw ar.error;
    const ids=(ar.data||[]).map(x=>x.id);
    if(!ids.length)return show("rgroupmsg","Não há outros atendimentos deste cliente neste dia.","error");
    const pr=await sb.from("appointment_payments").select("appointment_id,status").in("appointment_id",ids);
    if(pr.error)throw pr.error;
    const pm=new Map((pr.data||[]).map(x=>[x.appointment_id,x]));
    const eligible=ids.filter(id=>(pm.get(id)?.status==="paid")===paid);
    if(!eligible.includes(baseId))eligible.unshift(baseId);
    const unique=[...new Set(eligible)];
    if(unique.length<2){
      return show("rgroupmsg",paid?"Não há outro recibo pago deste cliente para agrupar neste dia.":"Não há outro comprovante pendente deste cliente para agrupar neste dia.","error")
    }
    if($("rd").open)$("rd").close();
    await openReceiptGroup(unique)
  }catch(e){show("rgroupmsg",fail(e),"error")}
}
function openReceiptDiscount(){
  if(currentMonthlyReceipt){
    if(currentMonthlyReceipt.allPaid||currentMonthlyReceipt.isSnapshot)return;
    if($("rd").open)$("rd").close();
    openMonthlyDiscount(currentMonthlyReceipt);
    return
  }
  if(currentReceiptGroup){
    if(currentReceiptGroup.allPaid)return;
    const ids=currentReceiptGroup.items.map(d=>d.x?.id).filter(Boolean);
    if(ids.length<2)return;
    if($("rd").open)$("rd").close();
    openGroupDiscount(ids,currentReceiptGroup);
    return
  }
  if(!currentReceipt||currentReceipt.payment?.status==="paid")return;
  const id=currentReceipt.x?.id;
  if(!id)return;
  if($("rd").open)$("rd").close();
  openPayment(id,"discount")
}
async function openMonthlyDiscount(g){
  if(!financeAllowed())return show("msg","Seu nível de acesso não permite aplicar descontos.","error");
  try{
    const ids=(g.apps||[]).map(a=>a.id).filter(Boolean);
    if(!ids.length)throw Error("Nenhum atendimento encontrado neste documento.");
    const details=await Promise.all(ids.map(id=>getReceiptData(id)));
    const eligible=details.filter(d=>d.payment?.status!=="paid");
    if(!eligible.length)throw Error("Não há estética pendente disponível para desconto.");
    const monthlyGroup={
      isGroup:true,items:details,client:g.client,bank:g.bank,dateKey:g.month+"-01",
      allPaid:false,nonePaid:false,total:eligible.reduce((s,d)=>s+receiptAmounts(d).final,0),
      gross:eligible.reduce((s,d)=>s+receiptAmounts(d).gross,0),
      discount:eligible.reduce((s,d)=>s+receiptAmounts(d).discount,0),
      methods:[],paidAt:null,waterForGroup:details.length*WATER_PER_COMPLETED_SERVICE,totalWater:g.waterForGroup
    };
    openGroupDiscount(ids,monthlyGroup,"monthly_discount")
  }catch(e){
    show("msg",fail(e),"error");
    if(!$("rd").open)$("rd").showModal()
  }
}
function openGroupDiscount(ids,g,mode="group_discount"){
  if(!financeAllowed())return show("msg","Seu nível de acesso não permite aplicar descontos.","error");
  currentPaymentMode=mode;
  const visible=mode==="monthly_discount"?g.items.filter(d=>ids.includes(d.x?.id)):g.items.filter(d=>ids.includes(d.x?.id)&&d.payment?.status!=="paid"),eligible=visible.filter(d=>d.payment?.status!=="paid"),groups=groupReceiptVehicleGroups({...g,items:visible});
  currentPaymentGroupIds=eligible.map(d=>d.x.id);
  $("payf").reset();$("payid").value="";show("paymsg","");
  $("paytitle").textContent="Escolher estéticas para desconto";
  $("payreceivefields").classList.add("hidden");$("paymethod").required=false;$("paysubmit").textContent="Salvar desconto";
  const cards=groups.map(v=>{
    const itemRows=v.items.map(d=>{
      const a=receiptAmounts(d),id=d.x.id,date=agendaLocalDateKey(d.x.starts_at||d.x.completed_at),label=new Intl.DateTimeFormat("pt-BR").format(new Date(date+"T12:00:00"));
      const paid=d.payment?.status==="paid";
      return '<label class="discount-item-row" style="'+(paid?'opacity:.55':'')+'"><input class="group-discount-item" type="checkbox" value="'+esc(id)+'" data-gross="'+esc(String(a.gross))+'" '+(paid?'disabled':'checked')+'><span class="discount-item-text"><b>'+esc(label)+'</b><br><span class="meta">'+esc(d.service?.name||"Serviço")+(paid?' · Pago — desconto bloqueado':'')+'</span></span><b class="discount-item-value">'+esc(money(a.gross))+'</b></label>'
    }).join("");
    return '<div class="discount-vehicle-card" style="border:1px solid #31576a;border-radius:12px;margin:8px 0"><label class="discount-vehicle-head"><input class="group-discount-vehicle" type="checkbox" data-vehicle="'+esc(v.key)+'" checked><span>'+esc(v.vehicle)+'</span></label><div data-vehicle-items="'+esc(v.key)+'" class="discount-item-list">'+itemRows+'</div></div>'
  }).join("");
  $("pd").classList.add("discount-picker");
  $("paysummary").innerHTML='<div class="discount-scope-box" style="border:1px solid #31576a;border-radius:12px;margin-bottom:10px"><div style="font-weight:900;margin-bottom:8px">Onde aplicar o desconto?</div><div class="discount-scope-actions"><button type="button" class="primary" id="discScopeAll">Documento inteiro</button><button type="button" class="ghost" id="discScopeVehicle">Por veículo</button><button type="button" class="ghost" id="discScopeItem">Por estética</button></div><div id="discScopeHelp" class="meta discount-scope-help">Todas as estéticas deste documento estão selecionadas.</div></div>'+cards;
  $("paypreview").innerHTML="";$("paydiscountwrap").classList.add("hidden");
  let discountScope="all";
  const setScope=scope=>{
    discountScope=scope;
    const allBtn=$("discScopeAll"),vehBtn=$("discScopeVehicle"),itemBtn=$("discScopeItem"),help=$("discScopeHelp");
    [[allBtn,"all"],[vehBtn,"vehicle"],[itemBtn,"item"]].forEach(([b,key])=>{if(b)b.className=key===scope?"primary":"ghost"});
    document.querySelectorAll(".group-discount-item").forEach(x=>{
      if(scope==="all")x.checked=true;
      x.disabled=scope==="all"||scope==="vehicle";
      x.closest("label").style.opacity=scope==="vehicle"?"0.55":"1"
    });
    document.querySelectorAll(".group-discount-vehicle").forEach(x=>{
      if(scope==="all")x.checked=true;
      x.disabled=scope==="all"||scope==="item";
    });
    if(help)help.textContent=scope==="all"?"Todas as estéticas deste documento receberão o desconto.":scope==="vehicle"?"Marque um ou mais veículos. O desconto será aplicado às estéticas desses carros.":"Marque somente as estéticas específicas que receberão o desconto.";
  };
  const sync=()=>{
    const selected=[...document.querySelectorAll(".group-discount-item:checked")];
    currentPaymentGroupIds=selected.map(x=>x.value);
    const gross=selected.reduce((s,x)=>s+Number(x.dataset.gross||0),0);
    currentPaymentQuote={id:null,gross,status:"completed"};
    document.querySelectorAll(".group-discount-vehicle").forEach(v=>{
      const boxes=[...document.querySelectorAll('[data-vehicle-items="'+CSS.escape(v.dataset.vehicle)+'"] .group-discount-item')];
      v.checked=boxes.length>0&&boxes.every(x=>x.checked);v.indeterminate=boxes.some(x=>x.checked)&&!v.checked
    });
    updatePaymentDiscountPreview()
  };
  document.querySelectorAll(".group-discount-item").forEach(x=>x.addEventListener("change",sync));
  document.querySelectorAll(".group-discount-vehicle").forEach(x=>x.addEventListener("change",()=>{
    document.querySelectorAll('[data-vehicle-items="'+CSS.escape(x.dataset.vehicle)+'"] .group-discount-item').forEach(i=>i.checked=x.checked);sync()
  }));
  $("discScopeAll").onclick=()=>{setScope("all");sync()};
  $("discScopeVehicle").onclick=()=>{
    document.querySelectorAll(".group-discount-vehicle").forEach(x=>x.checked=false);
    document.querySelectorAll(".group-discount-item").forEach(x=>x.checked=false);
    setScope("vehicle");sync()
  };
  $("discScopeItem").onclick=()=>{
    document.querySelectorAll(".group-discount-vehicle").forEach(x=>x.checked=false);
    document.querySelectorAll(".group-discount-item").forEach(x=>x.checked=false);
    setScope("item");sync()
  };
  $("paydiscounttype").value="none";$("paydiscountvalue").value="";setScope("all");sync();$("pd").showModal()
}
function cancelPaymentDialog(){
  const reopenSingle=currentPaymentMode==="discount"&&currentReceipt&&!currentReceiptGroup;
  const reopenGroup=currentPaymentMode==="group_discount"&&currentReceiptGroup;
  const reopenMonthly=currentPaymentMode==="monthly_discount"&&currentMonthlyReceipt;
  if($("pd").open)$("pd").close();
  currentPaymentQuote=null;currentPaymentGroupIds=[];
  if(reopenSingle||reopenGroup||reopenMonthly)$("rd").showModal()
}
async function openPackageGroupPayment(ids){
  if(!financeAllowed())return show("msg","Seu nível de acesso não permite confirmar pagamentos.","error");
  const chargeIds=[...new Set((ids||[]).filter(Boolean))];
  if(chargeIds.length<2)return show("msg","Grupo de mensalidades não identificado.","error");
  currentPaymentMode="package_group_receive";currentPaymentGroupIds=chargeIds;
  $("payf").reset();$("payid").value="";show("paymsg","");
  $("paytitle").textContent="Confirmar mensalidade conjunta";
  $("paydiscountlabelwrap").classList.add("hidden");$("paydiscountwrap").classList.add("hidden");
  $("payreceivefields").classList.remove("hidden");$("paymethod").required=true;$("paysubmit").textContent="Confirmar recebimento conjunto";
  $("paysummary").innerHTML='<div class="empty">Carregando mensalidades...</div>';$("paypreview").innerHTML="";currentPaymentQuote=null;
  $("pd").showModal();
  try{
    const d=await getPackageChargeGroupShareData(chargeIds),m=packageGroupDocumentModel(d);
    if(m.paid)throw Error("Estas mensalidades já estão pagas.");
    currentPaymentQuote={id:"group",gross:Number(m.total||0),status:"package_group"};
    $("paysummary").innerHTML=m.items.map(x=>'<div><span>'+esc(x.vehicle)+'<br><small>'+esc(x.plan+(x.size?" • "+x.size:""))+' • '+x.units+' plano'+(x.units===1?"":"s")+'</small></span><b>'+esc(money(x.amount))+'</b></div>').join("")+'<div class="payment-preview-final"><span>Total</span><strong>'+esc(money(m.total))+'</strong></div>';
    $("paydiscounttype").value="none";$("paydiscountvalue").value="";updatePaymentDiscountPreview()
  }catch(err){$("paysummary").innerHTML="";show("paymsg",fail(err),"error")}
}
async function openPackagePayment(id){
  if(!financeAllowed())return show("msg","Seu nível de acesso não permite confirmar pagamentos.","error");
  currentPaymentMode="package_receive";currentPaymentGroupIds=[];
  $("payf").reset();$("payid").value=id;show("paymsg","");
  $("paytitle").textContent="Confirmar mensalidade do plano";
  $("paydiscountlabelwrap").classList.add("hidden");$("paydiscountwrap").classList.add("hidden");
  $("payreceivefields").classList.remove("hidden");$("paymethod").required=true;$("paysubmit").textContent="Confirmar recebimento";
  $("paysummary").innerHTML='<div class="empty">Carregando cobrança...</div>';$("paypreview").innerHTML="";currentPaymentQuote=null;
  $("pd").showModal();
  try{
    const r=await sb.from("package_charges").select("*").eq("id",id).single();
    if(r.error)throw r.error;
    const c=r.data,maps=currentFinanceMonthReport?.maps,cl=maps?.cm.get(c.client_id),v=maps?.vm.get(c.vehicle_id),sv=maps?.sm.get(c.service_id),meta=packageFrequencyMeta(c.frequency);
    currentPaymentQuote={id,gross:Number(c.amount||0),status:"package"};
    $("paysummary").innerHTML='<div><span>'+esc(financePlanDisplayName(sv?.name))+' • '+esc(meta?.label||c.frequency)+' • '+Number(c.visits_per_month||meta?.visits||0)+' estéticas/mês</span><b>'+esc(money(c.amount))+'</b></div><div class="meta">'+esc(cl?.name||"Cliente")+' • '+esc(v?(v.brand+" "+v.model):"Veículo")+'</div>';
    $("paydiscounttype").value="none";$("paydiscountvalue").value="";updatePaymentDiscountPreview()
  }catch(err){$("paysummary").innerHTML="";show("paymsg",fail(err),"error")}
}
async function openPayment(id,mode="receive"){
  $("pd").classList.remove("discount-picker");
  if(!financeAllowed())return show("msg","Seu nível de acesso não permite confirmar pagamentos.","error");
  currentPaymentMode=mode==="discount"?"discount":"receive";currentPaymentGroupIds=[];
  $("payf").reset();$("payid").value=id;show("paymsg","");
  $("paydiscountlabelwrap").classList.remove("hidden");
  $("paytitle").textContent=currentPaymentMode==="discount"?"Aplicar desconto":"Confirmar pagamento";
  $("payreceivefields").classList.toggle("hidden",currentPaymentMode==="discount");
  $("paymethod").required=currentPaymentMode==="receive";
  $("paysubmit").textContent=currentPaymentMode==="discount"?"Salvar desconto":"Confirmar recebimento";
  $("paysummary").innerHTML='<div class="empty">Carregando valores...</div>';
  $("paypreview").innerHTML="";
  $("paydiscountwrap").classList.add("hidden");
  currentPaymentQuote=null;
  $("pd").showModal();
  try{
    const ar=await sb.from("appointments").select("id,status,base_value,addon_value,final_value,discount_amount,discount_percent").eq("id",id).single();
    if(ar.error)throw ar.error;
    const a=ar.data,gross=Math.max(0,Number(a.base_value||0)+Number(a.addon_value||0)),existingDiscount=Number(a.discount_amount||0);
    currentPaymentQuote={id,gross,status:a.status};
    $("paysummary").innerHTML='<div><span>Valor do atendimento</span><b>'+esc(money(gross))+'</b></div>';
    if(existingDiscount>0){
      $("paydiscounttype").value="fixed";
      $("paydiscountvalue").value=existingDiscount.toFixed(2);
    }else{
      $("paydiscounttype").value="none";
      $("paydiscountvalue").value="";
    }
    updatePaymentDiscountPreview()
  }catch(err){
    $("paysummary").innerHTML="";
    show("paymsg",fail(err),"error")
  }
}
function paymentDiscountCalc(){
  const gross=Number(currentPaymentQuote?.gross||0),type=$("paydiscounttype").value,raw=Number($("paydiscountvalue").value||0);
  let discount=0,percent=0,error="";
  if(type==="percent"){
    if(raw<0||raw>100)error="O desconto percentual deve ficar entre 0% e 100%.";
    else{percent=raw;discount=Math.round(gross*percent)/100}
  }else if(type==="fixed"){
    if(raw<0)error="O desconto não pode ser negativo.";
    else if(raw>gross)error="O desconto não pode ser maior que o valor do atendimento.";
    else{discount=Math.round(raw*100)/100;percent=gross?discount/gross*100:0}
  }
  const final=Math.max(0,Math.round((gross-discount)*100)/100);
  return{gross,type,raw,discount,percent,final,error}
}
function updatePaymentDiscountPreview(){
  const type=$("paydiscounttype").value,wrap=$("paydiscountwrap"),input=$("paydiscountvalue");
  wrap.classList.toggle("hidden",type==="none");
  $("paydiscountlabel").textContent=type==="percent"?"Percentual de desconto (%)":"Valor do desconto (R$)";
  input.max=type==="percent"?"100":String(currentPaymentQuote?.gross??"");
  if(type==="none")input.value="";
  const q=paymentDiscountCalc();
  $("paypreview").className="payment-preview"+(q.error?" has-error":"");
  $("paypreview").innerHTML=
    '<div><span>Valor original</span><b>'+esc(money(q.gross))+'</b></div>'+
    '<div><span>Desconto</span><b>− '+esc(money(q.discount))+'</b></div>'+
    '<div class="payment-preview-final"><span>Valor a receber</span><strong>'+esc(money(q.final))+'</strong></div>'+
    (q.error?'<div class="meta payment-preview-error">'+esc(q.error)+'</div>':'')
}
async function savePayment(e){
  e.preventDefault();
  const id=$("payid").value,packageReceive=currentPaymentMode==="package_receive",packageGroupReceive=currentPaymentMode==="package_group_receive",receive=currentPaymentMode==="receive"||packageReceive||packageGroupReceive,monthlyDiscount=currentPaymentMode==="monthly_discount",groupDiscount=currentPaymentMode==="group_discount"||monthlyDiscount,method=$("paymethod").value,q=paymentDiscountCalc();
  if(!groupDiscount&&!packageGroupReceive&&!id)return show("paymsg",packageReceive?"Cobrança de pacote não identificada.":"Atendimento não identificado.","error");
  if(packageGroupReceive&&currentPaymentGroupIds.length<2)return show("paymsg","Grupo de mensalidades não identificado.","error");
  if(groupDiscount&&currentPaymentGroupIds.length<1)return show("paymsg","Selecione pelo menos uma estética para aplicar o desconto.","error");
  if(receive&&!method)return show("paymsg","Selecione a forma de pagamento.","error");
  if(!currentPaymentQuote)return show("paymsg","Os valores da cobrança ainda não foram carregados.","error");
  if(q.error)return show("paymsg",q.error,"error");
  const submit=e.submitter;submit.disabled=true;submit.textContent=receive?"Confirmando...":"Salvando...";
  try{
    const r=packageGroupReceive
      ?await sb.rpc("confirm_package_charge_group",{
        p_charge_ids:currentPaymentGroupIds,
        p_payment_method:method,
        p_notes:$("paynotes").value.trim()
      })
      :packageReceive
      ?await sb.rpc("confirm_package_charge",{
        p_charge_id:id,
        p_payment_method:method,
        p_notes:$("paynotes").value.trim()
      })
      :currentPaymentMode==="receive"
        ?await sb.rpc("confirm_payment_with_discount",{
          p_appointment_id:id,
          p_payment_method:method,
          p_discount_type:q.type,
          p_discount_value:q.type==="none"?0:q.raw,
          p_notes:$("paynotes").value.trim()
        })
      :groupDiscount
        ?(monthlyDiscount
          ?await sb.rpc("apply_pending_monthly_discount",{
            p_appointment_ids:currentPaymentGroupIds,
            p_discount_type:q.type,
            p_discount_value:q.type==="none"?0:q.raw
          })
          :currentPaymentGroupIds.length===1
            ?await sb.rpc("apply_pending_discount",{
              p_appointment_id:currentPaymentGroupIds[0],
              p_discount_type:q.type,
              p_discount_value:q.type==="none"?0:q.raw
            })
            :await sb.rpc("apply_pending_group_discount",{
              p_appointment_ids:currentPaymentGroupIds,
              p_discount_type:q.type,
              p_discount_value:q.type==="none"?0:q.raw
            }))
        :await sb.rpc("apply_pending_discount",{
          p_appointment_id:id,
          p_discount_type:q.type,
          p_discount_value:q.type==="none"?0:q.raw
        });
    if(r.error)throw r.error;
    const groupIds=(groupDiscount||packageGroupReceive)?[...currentPaymentGroupIds]:[];
    const monthlyReturn=monthlyDiscount&&currentMonthlyReceipt?{clientId:currentMonthlyReceipt.client?.id,month:currentMonthlyReceipt.month}:null;
    $("pd").close();currentPaymentQuote=null;currentPaymentGroupIds=[];agendaMonthCache.clear();
    if(packageGroupReceive){
      show("msg","Mensalidades confirmadas em uma única baixa.","ok")
    }else if(packageReceive){
      show("msg","Mensalidade do pacote confirmada como recebida.","ok")
    }else if(receive){
      show("msg",q.discount>0?"Pagamento confirmado com desconto de "+money(q.discount)+".":"Pagamento confirmado. O documento agora é um recibo de pagamento.","ok")
    }else if(groupDiscount){
      show("msg",q.discount>0?"Desconto conjunto aplicado. Total pendente atualizado para "+money(q.final)+".":"Desconto conjunto removido. Total pendente atualizado.","ok")
    }else{
      show("msg",q.discount>0?"Desconto aplicado. Valor pendente atualizado para "+money(q.final)+".":"Desconto removido. Valor pendente atualizado.","ok")
    }
    if(monthlyReturn?.clientId&&monthlyReturn?.month){
      currentMonthlyReceipt=null;
      await openMonthlyClientReceipt(monthlyReturn.clientId,monthlyReturn.month);
      await Promise.all([loadApps(),financeAllowed()?loadFinance():Promise.resolve()]);
      return
    }
    await Promise.all([loadApps(),financeAllowed()?loadFinance():Promise.resolve()]);
    if(packageGroupReceive){await sharePackageChargeGroup(groupIds);return;}
    if(packageReceive){await sharePackageCharge(id);return;}
    if(groupDiscount)await openReceiptGroup(groupIds);else await openReceipt(id)
  }catch(err){show("paymsg",fail(err),"error")}
  finally{submit.disabled=false;submit.textContent=receive?"Confirmar recebimento":"Salvar desconto"}
}
function cleanFileName(s){return String(s||"cliente").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").toLowerCase()}
function canvasRoundRect(ctx,x,y,w,h,r,fill,stroke){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
  if(fill){ctx.fillStyle=fill;ctx.fill()}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}
}
function canvasText(ctx,text,x,y,maxWidth,lineHeight,font,fill){
  ctx.font=font;ctx.fillStyle=fill;
  const words=String(text).split(/\s+/),lines=[];let line="";
  for(const word of words){
    const t=line?line+" "+word:word;
    if(ctx.measureText(t).width>maxWidth&&line){lines.push(line);line=word}else line=t
  }
  if(line)lines.push(line);
  lines.forEach((l,i)=>ctx.fillText(l,x,y+i*lineHeight));
  return y+lines.length*lineHeight
}
async function receiptVisualCanvas(d){
  const paid=d.payment?.status==="paid";
  if(paid)return await paidReceiptCanvas(d);
  const amt=receiptAmounts(d),rows=[{n:d.service?.name||"Serviço",v:amt.base},...d.addons.map(a=>({n:a.addon_name,v:Number(a.unit_price||0)}))];
  const width=1080,height=1400+Math.max(0,rows.length-2)*46,cv=document.createElement("canvas");cv.width=width;cv.height=height;
  const ctx=cv.getContext("2d"),pad=86,right=width-pad;
  ctx.fillStyle="#f3f1ec";ctx.fillRect(0,0,width,height);

  if(brandLogoImg.complete&&brandLogoImg.naturalWidth){ctx.drawImage(brandLogoImg,pad,48,300,120)}
  else{ctx.font="900 50px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.fillText("Vaporeasy",pad,105)}

  ctx.textAlign="right";ctx.font="800 17px system-ui, sans-serif";ctx.fillStyle="#7b878d";
  ctx.fillText("ATENDIMENTO CONCLUÍDO",right,96);
  ctx.font="600 16px system-ui, sans-serif";ctx.fillText(receiptDate(d.x.completed_at||d.x.starts_at),right,126);
  ctx.textAlign="left";

  ctx.strokeStyle="#d4d0c8";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(pad,170);ctx.lineTo(right,170);ctx.stroke();

  ctx.font="400 46px Georgia, serif";ctx.fillStyle="#172832";ctx.fillText("Estética concluída.",pad,238);
  ctx.fillText("Obrigado pela confiança.",pad,292);

  let y=360;
  const info=[
    ["CLIENTE",d.client?.name||"Cliente"],
    ["VEÍCULO",d.vehicle?d.vehicle.brand+" "+d.vehicle.model+(d.vehicle.plate?"  ·  "+d.vehicle.plate:""):"Veículo"],
    ["SERVIÇO",d.service?.name||"Serviço"]
  ];
  for(const [k,v] of info){
    ctx.font="800 17px system-ui, sans-serif";ctx.fillStyle="#7b878d";ctx.fillText(k,pad,y);
    ctx.font="800 27px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.fillText(String(v),pad,y+36);
    y+=92;
  }

  ctx.strokeStyle="#d4d0c8";ctx.beginPath();ctx.moveTo(pad,y-18);ctx.lineTo(right,y-18);ctx.stroke();
  y+=18;
  for(const row of rows){
    ctx.font="500 24px system-ui, sans-serif";ctx.fillStyle="#485b64";ctx.fillText(row.n,pad,y);
    ctx.font="700 24px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.textAlign="right";ctx.fillText(money(row.v),right,y);ctx.textAlign="left";
    y+=40;
  }
  if(amt.discount>0){
    ctx.font="600 22px system-ui, sans-serif";ctx.fillStyle="#7d4d28";ctx.fillText("Desconto",pad,y);
    ctx.font="700 22px system-ui, sans-serif";ctx.textAlign="right";ctx.fillText("− "+money(amt.discount),right,y);ctx.textAlign="left";
    y+=40
  }
  y+=8;ctx.strokeStyle="#d4d0c8";ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(right,y);ctx.stroke();y+=54;
  ctx.font="800 18px system-ui, sans-serif";ctx.fillStyle="#6d797f";ctx.fillText("TOTAL DO ATENDIMENTO",pad,y);
  ctx.font="900 47px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.textAlign="right";ctx.fillText(money(amt.final),right,y+7);ctx.textAlign="left";
  y+=88;

  canvasRoundRect(ctx,pad,y,width-pad*2,205,18,"#fff","#ddd9d1");
  ctx.font="800 17px system-ui, sans-serif";ctx.fillStyle="#7b878d";ctx.fillText("PAGAMENTO PENDENTE",pad+28,y+36);
  ctx.font="800 15px system-ui, sans-serif";ctx.fillStyle="#7b878d";ctx.fillText("CHAVE PIX",pad+28,y+70);
  ctx.font="900 29px system-ui, sans-serif";ctx.fillStyle="#27485a";ctx.fillText(d.bank.pix_key,pad+28,y+108);
  ctx.font="500 20px system-ui, sans-serif";ctx.fillStyle="#596970";
  ctx.fillText(d.bank.bank_name+"  ·  Ag. "+d.bank.branch+"  ·  C/C "+d.bank.account_number,pad+28,y+148);
  ctx.fillText(d.bank.account_holder,pad+28,y+180);
  y+=245;

  ctx.strokeStyle="#d4d0c8";ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(right,y);ctx.stroke();y+=43;
  ctx.font="800 17px system-ui, sans-serif";ctx.fillStyle="#7b878d";ctx.fillText("IMPACTO POSITIVO",pad,y);
  y+=40;ctx.font="500 22px system-ui, sans-serif";ctx.fillStyle="#40525a";
  ctx.fillText("Economia estimada neste atendimento",pad,y);
  ctx.font="900 36px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.textAlign="right";ctx.fillText(WATER_PER_COMPLETED_SERVICE+" L",right,y+3);ctx.textAlign="left";
  y+=43;ctx.font="500 18px system-ui, sans-serif";ctx.fillStyle="#7b878d";
  ctx.fillText("Economia acumulada estimada da Vaporeasy: "+new Intl.NumberFormat("pt-BR").format(d.totalWater)+" litros",pad,y);

  ctx.font="500 16px system-ui, sans-serif";ctx.fillStyle="#949da1";
  ctx.fillText("Vaporeasy · cuidado automotivo com discrição, conveniência e responsabilidade.",pad,height-60);
  return cv
}
async function paidReceiptCanvas(d){
  const width=1080,height=1350,cv=document.createElement("canvas");cv.width=width;cv.height=height;
  const ctx=cv.getContext("2d"),pad=82,amt=receiptAmounts(d);ctx.fillStyle="#ffffff";ctx.fillRect(0,0,width,height);
  if(brandLogoImg.complete&&brandLogoImg.naturalWidth){ctx.drawImage(brandLogoImg,pad,48,300,120)}
  else{ctx.font="900 48px system-ui, sans-serif";ctx.fillStyle="#102532";ctx.fillText("Vaporeasy",pad,110)}
  ctx.font="700 22px system-ui, sans-serif";ctx.fillStyle="#697d88";ctx.fillText("RECIBO DE PAGAMENTO",pad,178);
  ctx.strokeStyle="#d7e1e6";ctx.beginPath();ctx.moveTo(pad,205);ctx.lineTo(width-pad,205);ctx.stroke();

  let y=273;ctx.font="900 34px system-ui, sans-serif";ctx.fillStyle="#102532";ctx.fillText("Pagamento recebido",pad,y);
  y+=58;ctx.font="600 26px system-ui, sans-serif";ctx.fillStyle="#405965";
  const lines=[
    ["Cliente",d.client?.name||"Cliente"],
    ["Veículo",d.vehicle?d.vehicle.brand+" "+d.vehicle.model+(d.vehicle.plate?" • "+d.vehicle.plate:""):"Veículo"],
    ["Serviço",d.service?.name||"Serviço"],
    ["Data",receiptDate(d.payment?.paid_at||d.x.completed_at||d.x.starts_at)],
    ["Forma de pagamento",d.payment?.payment_method||"—"]
  ];
  for(const [k,v] of lines){ctx.font="700 22px system-ui, sans-serif";ctx.fillStyle="#7b8d96";ctx.fillText(k.toUpperCase(),pad,y);ctx.font="700 28px system-ui, sans-serif";ctx.fillStyle="#172f3b";ctx.fillText(v,pad,y+35);y+=92}
  ctx.strokeStyle="#d7e1e6";ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(width-pad,y);ctx.stroke();y+=52;
  if(amt.discount>0){
    ctx.font="600 22px system-ui, sans-serif";ctx.fillStyle="#667b86";ctx.fillText("Valor original",pad,y);
    ctx.textAlign="right";ctx.fillText(money(amt.gross),width-pad,y);ctx.textAlign="left";y+=38;
    ctx.fillText("Desconto",pad,y);ctx.textAlign="right";ctx.fillText("− "+money(amt.discount),width-pad,y);ctx.textAlign="left";y+=52
  }
  ctx.font="700 28px system-ui, sans-serif";ctx.fillStyle="#536b76";ctx.fillText("VALOR RECEBIDO",pad,y);
  ctx.font="900 58px system-ui, sans-serif";ctx.fillStyle="#102532";ctx.textAlign="right";ctx.fillText(money(amt.final),width-pad,y+8);ctx.textAlign="left";
  y+=100;ctx.font="600 24px system-ui, sans-serif";ctx.fillStyle="#536b76";
  ctx.fillText("Vaporeasy • Estética automotiva ecológica",pad,y);
  ctx.fillText("Favorecido: "+d.bank.account_holder,pad,y+42);
  ctx.font="600 21px system-ui, sans-serif";ctx.fillStyle="#8a9aa2";
  ctx.fillText("Documento gerado pelo sistema Vaporeasy.",pad,height-80);
  return cv
}
function canvasBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Não foi possível gerar a imagem.")),"image/png",0.96))}
async function groupReceiptCanvas(g){
  const paid=g.allPaid,groups=groupReceiptVehicleGroups(g);
  const width=1080,height=Math.max(1450,1080+groups.length*165),cv=document.createElement("canvas");cv.width=width;cv.height=height;
  const ctx=cv.getContext("2d"),pad=82,right=width-pad;
  ctx.fillStyle="#f3f1ec";ctx.fillRect(0,0,width,height);
  if(brandLogoImg.complete&&brandLogoImg.naturalWidth)ctx.drawImage(brandLogoImg,pad,48,300,120);
  else{ctx.font="900 48px system-ui, sans-serif";ctx.fillStyle="#102532";ctx.fillText("Vaporeasy",pad,110)}
  ctx.textAlign="right";ctx.font="800 18px system-ui, sans-serif";ctx.fillStyle="#7b878d";ctx.fillText(paid?"RECIBO DE PAGAMENTO":"ATENDIMENTOS CONCLUÍDOS",right,92);
  ctx.font="600 17px system-ui, sans-serif";ctx.fillText(new Intl.DateTimeFormat("pt-BR").format(new Date(g.dateKey+"T12:00:00")),right,124);ctx.textAlign="left";
  ctx.strokeStyle="#d4d0c8";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(pad,170);ctx.lineTo(right,170);ctx.stroke();
  ctx.font="400 39px Georgia, serif";ctx.fillStyle="#172832";ctx.fillText(g.items.length+" estética"+(g.items.length===1?"":"s")+" realizada"+(g.items.length===1?"":"s")+" em "+groups.length+" veículo"+(groups.length===1?"":"s")+".",pad,238);
  ctx.fillText("Obrigado pela confiança.",pad,288);
  let y=355;
  ctx.font="800 17px system-ui, sans-serif";ctx.fillStyle="#7b878d";ctx.fillText("CLIENTE",pad,y);
  ctx.font="900 30px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.fillText(g.client?.name||"Cliente",pad,y+40);y+=92;
  ctx.strokeStyle="#d4d0c8";ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(right,y);ctx.stroke();y+=45;
  for(const v of groups){
    ctx.font="800 25px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.fillText(v.vehicle,pad,y);
    ctx.font="900 25px system-ui, sans-serif";ctx.textAlign="right";ctx.fillText(money(v.total),right,y);ctx.textAlign="left";
    ctx.font="700 20px system-ui, sans-serif";ctx.fillStyle="#5d6b72";ctx.fillText(v.items.length+" estética"+(v.items.length===1?"":"s")+" realizada"+(v.items.length===1?"":"s"),pad,y+35);
    ctx.font="500 17px system-ui, sans-serif";ctx.fillStyle="#71808a";ctx.fillText(v.services.join(" + "),pad,y+65);
    const dates=v.dates.map(x=>new Intl.DateTimeFormat("pt-BR").format(new Date(x+"T12:00:00"))).join(" · ");
    ctx.fillText("Datas: "+dates,pad,y+92);
    let extra=0;
    if(v.discount>0){ctx.font="600 17px system-ui, sans-serif";ctx.fillStyle="#7d4d28";ctx.fillText("Valor original "+money(v.gross)+" · descontos − "+money(v.discount),pad,y+119);extra=27}
    y+=145+extra;
    ctx.strokeStyle="#dedbd4";ctx.beginPath();ctx.moveTo(pad,y-20);ctx.lineTo(right,y-20);ctx.stroke()
  }
  if(g.discount>0){
    ctx.font="600 20px system-ui, sans-serif";ctx.fillStyle="#7d4d28";ctx.fillText("Descontos concedidos",pad,y);
    ctx.textAlign="right";ctx.font="800 22px system-ui, sans-serif";ctx.fillText("− "+money(g.discount),right,y);ctx.textAlign="left";y+=48
  }
  ctx.strokeStyle="#d4d0c8";ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(right,y);ctx.stroke();y+=58;
  ctx.font="800 19px system-ui, sans-serif";ctx.fillStyle="#6d797f";ctx.fillText(paid?"TOTAL RECEBIDO":"TOTAL DO ATENDIMENTO",pad,y);
  ctx.font="900 52px system-ui, sans-serif";ctx.fillStyle="#172832";ctx.textAlign="right";ctx.fillText(money(g.total),right,y+8);ctx.textAlign="left";y+=95;
  if(paid){
    canvasRoundRect(ctx,pad,y,width-pad*2,125,18,"#edf8f1","#bfdfca");
    ctx.font="900 18px system-ui, sans-serif";ctx.fillStyle="#437157";ctx.fillText("PAGAMENTO RECEBIDO",pad+28,y+38);
    ctx.font="600 21px system-ui, sans-serif";ctx.fillStyle="#36584a";ctx.fillText("Forma: "+(g.methods.join(", ")||"—"),pad+28,y+78);y+=165
  }else{
    canvasRoundRect(ctx,pad,y,width-pad*2,205,18,"#fff","#ddd9d1");
    ctx.font="900 18px system-ui, sans-serif";ctx.fillStyle="#7b878d";ctx.fillText("PAGAMENTO PENDENTE",pad+28,y+36);
    ctx.font="800 15px system-ui, sans-serif";ctx.fillText("CHAVE PIX",pad+28,y+70);
    ctx.font="900 29px system-ui, sans-serif";ctx.fillStyle="#27485a";ctx.fillText(g.bank.pix_key,pad+28,y+108);
    ctx.font="500 20px system-ui, sans-serif";ctx.fillStyle="#596970";ctx.fillText(g.bank.bank_name+" · Ag. "+g.bank.branch+" · C/C "+g.bank.account_number,pad+28,y+148);ctx.fillText(g.bank.account_holder,pad+28,y+180);y+=245
  }
  ctx.font="800 17px system-ui, sans-serif";ctx.fillStyle="#7b878d";ctx.fillText("IMPACTO POSITIVO",pad,y);
  ctx.font="600 21px system-ui, sans-serif";ctx.fillStyle="#40525a";ctx.fillText("Economia estimada nestas estéticas: "+new Intl.NumberFormat("pt-BR").format(g.waterForGroup)+" litros de água",pad,y+38);
  ctx.font="500 16px system-ui, sans-serif";ctx.fillStyle="#949da1";ctx.fillText("Vaporeasy · cuidado automotivo com discrição, conveniência e responsabilidade.",pad,height-48);
  return cv
}
function groupChargeText(g){
  const rows=g.items.map(d=>{
    const veh=d.vehicle?d.vehicle.brand+" "+d.vehicle.model+(d.vehicle.plate?" • "+d.vehicle.plate:""):"Veículo";
    return "• "+veh+" — "+(d.service?.name||"Serviço")+" — "+money(receiptAmounts(d).final)
  }).join("\n");
  return "Olá, "+(g.client?.name||"")+".\n\nSeus "+g.items.length+" atendimentos Vaporeasy foram concluídos:\n"+rows+"\n\nTotal: *"+money(g.total)+"*\n\nChave Pix: "+g.bank.pix_key+"\n"+g.bank.bank_name+" · Ag. "+g.bank.branch+" · C/C "+g.bank.account_number+"\nFavorecido: "+g.bank.account_holder+"\n\nObrigado pela confiança.\nVaporeasy"
}
async function shareReceiptVisual(){
  if(currentPackageGroup)return sharePackageGroupReceiptFile(false);
  if(currentMonthlyReceipt){
    try{
      currentMonthlyReceipt=await ensureMonthlyReceiptSnapshot(currentMonthlyReceipt);
      $("rcontent").innerHTML=monthlyReceiptHtml(currentMonthlyReceipt);
      if(currentMonthlyReceipt.isSnapshot&&currentMonthlyReceipt.issuedAt)show("rgroupmsg","Comprovante emitido em "+receiptDate(currentMonthlyReceipt.issuedAt)+". Histórico deste documento preservado.","ok");
      const cv=await monthlyReceiptCanvas(currentMonthlyReceipt);
      await shareReceiptCanvasFile(cv,{title:"Comprovante de atendimento Vaporeasy",name:"comprovante-atendimento-vaporeasy-"+cleanFileName(currentMonthlyReceipt.client?.name)+"-"+currentMonthlyReceipt.month});
      return
    }catch(e){if(e?.name!=="AbortError")show("msg",fail(e),"error");return}
  }
  if(currentPackageReceipt)return sharePackageReceiptFile(false);
  if(!currentReceipt&&!currentReceiptGroup)return;
  try{
    if(currentReceiptGroup){
      const cv=await groupReceiptCanvas(currentReceiptGroup);
      const paid=currentReceiptGroup.allPaid;
      await shareReceiptCanvasFile(cv,{title:paid?"Recibo conjunto Vaporeasy":"Atendimentos Vaporeasy",name:(paid?"recibo-conjunto":"comprovante-conjunto")+"-vaporeasy-"+cleanFileName(currentReceiptGroup.client?.name)});return
    }
    const cv=await receiptVisualCanvas(currentReceipt);
    await settleCanvas(cv);
    const blob=await canvasBlob(cv);
    const paid=currentReceipt.payment?.status==="paid",name=cleanFileName(currentReceipt.client?.name);
    const file=new File([blob],(paid?"recibo":"comprovante")+"-vaporeasy-"+name+".png",{type:"image/png"});
    if(navigator.share&&navigator.canShare?.({files:[file]})){
      await navigator.share({title:paid?"Recibo Vaporeasy":"Atendimento Vaporeasy",text:paid?"Segue seu recibo de pagamento Vaporeasy.":"Seu atendimento Vaporeasy foi concluído. Obrigado pela confiança.",files:[file]});
      return
    }
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
    show("msg","A imagem do comprovante foi gerada. Você pode enviá-la pelo WhatsApp.","ok")
  }catch(e){if(e?.name!=="AbortError")show("msg",fail(e),"error")}
}
function chargeText(d){
  const vehicle=d.vehicle?d.vehicle.brand+" "+d.vehicle.model:"",amt=receiptAmounts(d);
  return "Olá, "+(d.client?.name||"")+".\n\nSeu atendimento Vaporeasy foi concluído.\n"+(vehicle?vehicle+" · ":"")+(d.service?.name||"Serviço")+"\nValor: *"+money(amt.final)+"*\n\nChave Pix: "+d.bank.pix_key+"\n"+d.bank.bank_name+" · Ag. "+d.bank.branch+" · C/C "+d.bank.account_number+"\nFavorecido: "+d.bank.account_holder+"\n\nObrigado pela confiança.\nVaporeasy"
}
async function shareChargePix(){
  if(currentMonthlyReceipt){
    if(currentMonthlyReceipt.allPaid)return;
    const txt=monthlyChargeText(currentMonthlyReceipt);
    if(navigator.share){try{await navigator.share({title:"Pagamento mensal Vaporeasy",text:txt});return}catch(e){if(e?.name==="AbortError")return}}
    try{await navigator.clipboard.writeText(txt);show("msg","Mensagem mensal de cobrança/Pix copiada.","ok")}catch(e){show("msg",fail(e),"error")}
    return
  }
  if(currentReceiptGroup){
    if(currentReceiptGroup.allPaid)return;
    const txt=groupChargeText(currentReceiptGroup);
    if(navigator.share){try{await navigator.share({title:"Pagamento Vaporeasy",text:txt});return}catch(e){if(e?.name==="AbortError")return}}
    try{await navigator.clipboard.writeText(txt);show("msg","Mensagem conjunta de cobrança/Pix copiada.","ok")}catch(e){show("msg",fail(e),"error")}
    return
  }
  if(!currentReceipt||currentReceipt.payment?.status==="paid")return;
  const txt=chargeText(currentReceipt);
  if(navigator.share){try{await navigator.share({title:"Pagamento Vaporeasy",text:txt});return}catch(e){if(e?.name==="AbortError")return}}
  try{await navigator.clipboard.writeText(txt);show("msg","Mensagem de cobrança/Pix copiada.","ok")}catch(e){show("msg",fail(e),"error")}
}
async function generateReceiptPdf(){
  if(currentPackageGroup)return sharePackageGroupReceiptFile(true);
  if(currentMonthlyReceipt){
    try{
      currentMonthlyReceipt=await ensureMonthlyReceiptSnapshot(currentMonthlyReceipt);
      $("rcontent").innerHTML=monthlyReceiptHtml(currentMonthlyReceipt);
      if(currentMonthlyReceipt.isSnapshot&&currentMonthlyReceipt.issuedAt)show("rgroupmsg","Comprovante emitido em "+receiptDate(currentMonthlyReceipt.issuedAt)+". Histórico deste documento preservado.","ok");
      const cv=await monthlyReceiptCanvas(currentMonthlyReceipt);
      await shareReceiptCanvasFile(cv,{pdf:true,title:"Comprovante de atendimento Vaporeasy",name:"comprovante-atendimento-vaporeasy-"+cleanFileName(currentMonthlyReceipt.client?.name)+"-"+currentMonthlyReceipt.month});
      return
    }catch(e){if(e?.name!=="AbortError")show("msg",fail(e),"error");return}
  }
  if(currentPackageReceipt)return sharePackageReceiptFile(true);
  if(!currentReceipt&&!currentReceiptGroup)return;
  try{
    const {jsPDF}=window.jspdf||{};
    if(currentReceiptGroup){
      if(!jsPDF)throw Error("Gerador de PDF indisponível.");
      const cv=await groupReceiptCanvas(currentReceiptGroup);
      await shareReceiptCanvasFile(cv,{pdf:true,title:currentReceiptGroup.allPaid?"Recibo conjunto Vaporeasy":"Comprovante conjunto Vaporeasy",name:(currentReceiptGroup.allPaid?"recibo-conjunto":"comprovante-conjunto")+"-vaporeasy-"+cleanFileName(currentReceiptGroup.client?.name)});return
    }
    if(!jsPDF)throw Error("Gerador de PDF indisponível.");
    const paid=currentReceipt.payment?.status==="paid";
    const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
    if(paid){
      const d=currentReceipt,amt=receiptAmounts(currentReceipt);let y=20;
      if(brandLogoImg.complete&&brandLogoImg.naturalWidth){
        const lc=document.createElement("canvas");lc.width=400;lc.height=160;const lctx=lc.getContext("2d");
        lctx.fillStyle="#ffffff";lctx.fillRect(0,0,400,160);lctx.drawImage(brandLogoImg,0,0,400,160);
        doc.addImage(lc.toDataURL("image/jpeg",0.94),"JPEG",20,10,50,20);
        doc.setFontSize(10);doc.setTextColor(100);doc.text("RECIBO DE PAGAMENTO",78,22)
      }else{
        doc.setFont("helvetica","bold");doc.setFontSize(19);doc.text("Vaporeasy",20,y);
        doc.setFontSize(10);doc.setTextColor(100);doc.text("RECIBO DE PAGAMENTO",20,y+7)
      }
      doc.setDrawColor(210);doc.line(20,y+12,190,y+12);y+=25;
      doc.setTextColor(30);doc.setFontSize(13);doc.setFont("helvetica","bold");doc.text("Pagamento recebido",20,y);y+=12;
      doc.setFontSize(10);doc.setFont("helvetica","normal");
      const veh=d.vehicle?d.vehicle.brand+" "+d.vehicle.model+(d.vehicle.plate?" • "+d.vehicle.plate:""):"Veículo";
      const fields=[
        ["Cliente",d.client?.name||"Cliente"],["Veículo",veh],["Serviço",d.service?.name||"Serviço"],
        ["Data do recebimento",receiptDate(d.payment?.paid_at||new Date())],["Forma de pagamento",d.payment?.payment_method||"—"]
      ];
      for(const [k,v] of fields){doc.setFont("helvetica","bold");doc.text(k+":",20,y);doc.setFont("helvetica","normal");doc.text(String(v),58,y);y+=8}
      y+=4;doc.line(20,y,190,y);y+=10;
      const discount=amt.discount,gross=amt.gross;
      if(discount>0){
        doc.setFont("helvetica","normal");doc.setFontSize(10);doc.text("Valor original",20,y);doc.text(money(gross),190,y,{align:"right"});y+=7;
        doc.text("Desconto",20,y);doc.text("− "+money(discount),190,y,{align:"right"});y+=9
      }
      doc.setFont("helvetica","bold");doc.setFontSize(12);doc.text("Valor recebido",20,y);
      doc.setFontSize(18);doc.text(money(amt.final),190,y,{align:"right"});y+=22;
      doc.setFontSize(10);doc.setFont("helvetica","normal");doc.text("Favorecido: "+d.bank.account_holder,20,y);y+=7;
      doc.text("Vaporeasy • Estética automotiva ecológica",20,y)
    }else{
      const cv=await receiptVisualCanvas(currentReceipt);
      await settleCanvas(cv);
      const img=cv.toDataURL("image/jpeg",0.92);
      let pw=180,ph=pw*(cv.height/cv.width);if(ph>270){ph=270;pw=ph*(cv.width/cv.height)}
      doc.addImage(img,"JPEG",(210-pw)/2,12,pw,ph)
    }
    const file=(paid?"recibo":"comprovante")+"-vaporeasy-"+cleanFileName(currentReceipt.client?.name)+".pdf";
    const blob=doc.output("blob"),pdfFile=new File([blob],file,{type:"application/pdf"});
    if(navigator.share&&navigator.canShare?.({files:[pdfFile]})){
      await navigator.share({title:paid?"Recibo Vaporeasy":"Comprovante Vaporeasy",files:[pdfFile]});
      return
    }
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
    show("msg","PDF salvo como arquivo. Envie-o pelo WhatsApp como documento.","ok")
  }catch(e){if(e?.name!=="AbortError")show("msg",fail(e),"error")}
}
let cancelScopeResolver=null;
