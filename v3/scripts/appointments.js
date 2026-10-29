function normalizeApptClientSearch(v){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()
}
function clearApptClientPicker(keepText=false){
  $("ac").value="";
  if(!keepText)$("acsearch").value="";
  $("acselected").classList.add("hidden");
  $("acselected").innerHTML="";
  $("acsuggestions").classList.add("hidden");
  $("acsuggestions").innerHTML="";
  $("av").innerHTML='<option value="">Selecione o cliente primeiro</option>';
  $("av").value="";
  apptRecurringByVehicle=new Map();
  $("avmulti").innerHTML='<div class="empty">Selecione o cliente primeiro.</div>';
  $("avmultisummary").textContent="Nenhum veículo selecionado.";
  $("avselectall").textContent="Selecionar todos";
  setApptVehicleMode(!!$("aid").value);
  loadAvailableSlots()
}
function renderApptClientSuggestions(){
  const q=normalizeApptClientSearch($("acsearch").value);
  const box=$("acsuggestions");
  if(!q){
    box.innerHTML="";
    box.classList.add("hidden");
    return
  }
  const ranked=clients.map(c=>{
    const name=normalizeApptClientSearch(c.name),words=name.split(/\s+/);
    let rank=9;
    if(name===q)rank=0;
    else if(name.startsWith(q))rank=1;
    else if(words.some(w=>w.startsWith(q)))rank=2;
    else if(name.includes(q))rank=3;
    return {c,rank}
  }).filter(x=>x.rank<9).sort((a,b)=>a.rank-b.rank||a.c.name.localeCompare(b.c.name,"pt-BR")).slice(0,8);

  if(!ranked.length){
    box.innerHTML='<div class="appt-client-noresult">Nenhum cliente encontrado.</div>';
    box.classList.remove("hidden");
    return
  }

  box.innerHTML=ranked.map(({c})=>
    '<button type="button" class="appt-client-suggestion" data-ac-pick="'+c.id+'">'+
      '<span><b>'+esc(c.name)+'</b><small>'+esc(c.phone||c.whatsapp||"Sem telefone")+'</small></span>'+
      '<span class="appt-client-chevron">›</span>'+
    '</button>'
  ).join("");
  box.classList.remove("hidden");
  box.querySelectorAll("[data-ac-pick]").forEach(b=>b.onclick=()=>selectApptClient(b.dataset.acPick))
}
async function selectApptClient(id){
  const c=clients.find(x=>x.id===id);if(!c)return;
  $("ac").value=c.id;
  $("acsearch").value=c.name;
  $("acsuggestions").classList.add("hidden");
  $("acsuggestions").innerHTML="";
  $("acselected").innerHTML='<span><b>'+esc(c.name)+'</b><small>'+esc(c.phone||c.whatsapp||"")+'</small></span><button type="button" class="ghost" data-ac-clear>Trocar</button>';
  $("acselected").classList.remove("hidden");
  const clear=$("acselected").querySelector("[data-ac-clear]");
  if(clear)clear.onclick=()=>{clearApptClientPicker();$("acsearch").focus()};
  await fillVehicles(c.id);
  await loadAvailableSlots()
}
function syncApptClientPicker(id){
  const c=clients.find(x=>x.id===id);
  if(!c){clearApptClientPicker();return}
  $("ac").value=c.id;
  $("acsearch").value=c.name;
  $("acsuggestions").classList.add("hidden");
  $("acsuggestions").innerHTML="";
  $("acselected").innerHTML='<span><b>'+esc(c.name)+'</b><small>'+esc(c.phone||c.whatsapp||"")+'</small></span><button type="button" class="ghost" data-ac-clear>Trocar</button>';
  $("acselected").classList.remove("hidden");
  const clear=$("acselected").querySelector("[data-ac-clear]");
  if(clear)clear.onclick=()=>{clearApptClientPicker();$("acsearch").focus()}
}
function setApptVehicleMode(editing){
  $("avsinglewrap").classList.toggle("hidden",!editing);
  $("avmultiwrap").classList.toggle("hidden",editing)
}
function selectedBatchVehicleIds(){
  if($("aid").value)return $("av").value?[$("av").value]:[];
  return [...$("avmulti").querySelectorAll('input[data-avmulti]:checked')].map(x=>x.value)
}
function appointmentSubmitLabel(){
  if($("aid").value)return "Salvar alterações";
  const n=selectedBatchVehicleIds().length;
  return n>1?"Agendar "+n+" veículos":"Agendar"
}
function recurringFrequencyLabel(v){
  return v==="weekly"?"Semanal":v==="biweekly"?"Quinzenal":"Somente esta vez"
}
function serviceUsesVehicleSizePricing(s){return !!s?.size_pricing_enabled}
function serviceIsPackage(s){return /^pacote/i.test(String(s?.category||"").trim())}
function packageFrequencyMeta(freq){
  if(freq==="weekly")return{label:"Semanal",visits:4,units:2};
  if(freq==="biweekly")return{label:"Quinzenal",visits:2,units:1};
  return null
}
function packageMonthlyAmount(s,size,freq){
  const meta=packageFrequencyMeta(freq),unit=servicePriceByVehicleSize(s,size);
  if(!meta||unit===null)return null;
  return Math.round(Number(unit||0)*meta.units*100)/100
}
function servicePriceByVehicleSize(s,size){
  if(!s)return 0;
  if(!serviceUsesVehicleSizePricing(s))return Number(s.price||0);
  if(size==="g")return Number(s.price_g??s.price??0);
  if(size==="pm")return Number(s.price_pm??s.price??0);
  return null
}
function appointmentSelectedPackageSizes(){
  if($("aid").value){
    const size=$("appackagesize")?.value||"";
    return ["pm","g"].includes(size)?[size]:[]
  }
  return [...$("avmulti").querySelectorAll('input[data-avmulti]:checked')].map(c=>{
    const z=appointmentVehicleSizeSelect(c.value);
    return z?.value||""
  }).filter(size=>["pm","g"].includes(size))
}
function appointmentSelectedPackageFrequencies(){
  if($("aid").value)return[];
  return selectedBatchVehicleIds().map(id=>$("avmulti").querySelector('[data-avfreq="'+CSS.escape(id)+'"]')?.value||"")
}
function serviceOptionPriceLabel(s){
  if(!financeAllowed())return "";
  if(serviceIsPackage(s)&&!$("aid").value){
    const ids=selectedBatchVehicleIds();
    if(ids.length===1){
      const id=ids[0],size=appointmentVehicleSizeSelect(id)?.value||"",freq=$("avmulti").querySelector('[data-avfreq="'+CSS.escape(id)+'"]')?.value||"",monthly=packageMonthlyAmount(s,size,freq);
      if(monthly!==null)return " • "+money(monthly)+"/mês";
      return ""
    }
    if(ids.length>1){
      let total=0,ready=true;
      ids.forEach(id=>{
        const size=appointmentVehicleSizeSelect(id)?.value||"",freq=$("avmulti").querySelector('[data-avfreq="'+CSS.escape(id)+'"]')?.value||"",m=packageMonthlyAmount(s,size,freq);
        if(m===null)ready=false;else total+=m
      });
      return ready?" • total "+money(total)+"/mês":""
    }
  }
  if(!serviceUsesVehicleSizePricing(s))return " • "+money(s.price);
  const sizes=appointmentSelectedPackageSizes(),unique=[...new Set(sizes)];
  if(unique.length===1)return " • "+money(servicePriceByVehicleSize(s,unique[0]));
  if(unique.length>1)return " • conforme porte";
  return ""
}
function refreshAppointmentServiceOptions(){
  const current=$("as").value;
  $("as").innerHTML='<option value="">Selecione</option>'+services.map(s=>'<option value="'+s.id+'">'+esc(s.name)+esc(serviceOptionPriceLabel(s))+'</option>').join("");
  if(current&&services.some(s=>s.id===current))$("as").value=current
}
function appointmentServiceHelpText(s){
  const n=$("aid").value?1:selectedBatchVehicleIds().length;
  let parts=["Duração por veículo: "+durationLabel(s.duration_minutes)];
  if(serviceIsPackage(s)&&!$("aid").value){
    const ids=selectedBatchVehicleIds();
    if(!ids.length){
      parts.push("Selecione o veículo, o porte e a frequência do pacote")
    }else{
      const rows=ids.map(id=>{
        const size=appointmentVehicleSizeSelect(id)?.value||"",freq=$("avmulti").querySelector('[data-avfreq="'+CSS.escape(id)+'"]')?.value||"",meta=packageFrequencyMeta(freq),monthly=packageMonthlyAmount(s,size,freq);
        return{size,freq,meta,monthly}
      });
      if(rows.some(x=>!["pm","g"].includes(x.size)))parts.push("Defina P/M ou G");
      else if(rows.some(x=>!x.meta))parts.push("Escolha Quinzenal ou Semanal");
      else if(rows.length===1){
        const x=rows[0];
        parts.push((x.size==="g"?"G":"P/M")+" • "+x.meta.label+" • "+x.meta.visits+" estéticas/mês • "+money(x.monthly)+"/mês")
      }else{
        parts.push("Cobrança mensal calculada por veículo conforme porte e frequência")
      }
    }
  }else if(serviceUsesVehicleSizePricing(s)){
    const sizes=appointmentSelectedPackageSizes(),unique=[...new Set(sizes)];
    if(unique.length===1){
      const size=unique[0],label=size==="g"?"G":"P/M";
      parts.push(label+": "+money(servicePriceByVehicleSize(s,size)))
    }else if(unique.length>1){
      parts.push("Valores aplicados conforme o porte de cada veículo")
    }else{
      parts.push("Defina P/M ou G para calcular o valor do pacote")
    }
  }
  if(n>1)parts.push("Bloco total: "+durationLabel(Number(s.duration_minutes||0)*n));
  if(s.first_slot_time)parts.push("Primeiro horário obrigatório: "+String(s.first_slot_time).slice(0,5));
  if(s.booking_mode==="request")parts.push("Agendamento público sujeito à confirmação");
  return parts.join(" • ")
}
function appointmentVehicleSizeSelect(id){
  return $("avmulti").querySelector('[data-avsize="'+CSS.escape(id)+'"]')
}
function refreshAppointmentPackageFrequencyUI(){
  if($("aid").value)return;
  const svc=services.find(x=>x.id===$("as").value),isPackage=serviceIsPackage(svc);
  $("avmulti").querySelectorAll("[data-avfreq]").forEach(sel=>{
    const id=sel.dataset.avfreq,cb=$("avmulti").querySelector('[data-avmulti][value="'+CSS.escape(id)+'"]'),plan=apptRecurringByVehicle.get(id);
    let current=sel.value;
    if(isPackage){
      if(!["weekly","biweekly"].includes(current))current=["weekly","biweekly"].includes(plan?.frequency)?plan.frequency:"";
      sel.innerHTML='<option value="">Escolha: Quinzenal ou Semanal</option><option value="biweekly">Quinzenal — 2 estéticas/mês</option><option value="weekly">Semanal — 4 estéticas/mês</option>';
    }else{
      if(!["once","weekly","biweekly"].includes(current))current="once";
      sel.innerHTML='<option value="once">Somente esta vez</option><option value="weekly">Semanal — até eu alterar</option><option value="biweekly">Quinzenal — até eu alterar</option>';
    }
    sel.value=current;
    sel.disabled=!cb?.checked
  })
}
function syncSingleAppointmentPackageSize(updatePrice=true){
  if(!$("aid").value)return;
  const v=findVehicleLocal($("av").value),size=v?.package_size==="g"?"g":(v?.package_size==="pm"?"pm":"");
  $("appackagesize").value=size;
  if(updatePrice)updateSingleAppointmentPackagePrice()
}
function updateSingleAppointmentPackagePrice(){
  const s=services.find(x=>x.id===$("as").value),editing=!!$("aid").value,uses=serviceUsesVehicleSizePricing(s);
  $("appackagesizewrap").classList.toggle("hidden",!(editing&&uses));
  if(!editing||!uses)return;
  const price=servicePriceByVehicleSize(s,$("appackagesize").value);
  if(price!==null&&financeAllowed()&&!window.__appointmentValueTouched){
    $("apvalue").value=(Number(price||0)+Number(window.__editingAppointmentAddonValue||0)).toFixed(2);
    updateAppointmentDiscountPreview()
  }
}
function refreshAppointmentPackageSizeUI(){
  const s=services.find(x=>x.id===$("as").value),uses=serviceUsesVehicleSizePricing(s),editing=!!$("aid").value;
  if(editing){
    $("appackagesizewrap").classList.toggle("hidden",!uses);
    updateSingleAppointmentPackagePrice()
  }else{
    $("appackagesizewrap").classList.add("hidden");
    $("avmulti").querySelectorAll("[data-avsize]").forEach(sel=>{
      const cb=$("avmulti").querySelector('[data-avmulti][value="'+CSS.escape(sel.dataset.avsize)+'"]');
      const visible=uses&&!!cb?.checked;
      const wrap=sel.closest("[data-avsizewrap]");
      if(wrap)wrap.classList.toggle("hidden",!visible);
      sel.disabled=!visible
    })
  }
}
function renderMultiVehiclePicker(list){
  const box=$("avmulti");
  if(!list.length){
    box.innerHTML='<div class="empty">Este cliente não possui veículos ativos.</div>';
    $("avmultisummary").textContent="Nenhum veículo disponível.";
    $("avselectall").classList.add("hidden");
    return
  }
  $("avselectall").classList.remove("hidden");
  box.innerHTML=list.map(v=>{
    const plan=apptRecurringByVehicle.get(v.id),freq=plan?.frequency==="weekly"||plan?.frequency==="biweekly"?plan.frequency:"once";
    return '<div class="multi-vehicle-item" data-avrow="'+esc(v.id)+'">'+
      '<label class="multi-vehicle-main">'+
        '<input type="checkbox" data-avmulti value="'+esc(v.id)+'">'+
        '<span><b>'+esc(v.brand+" "+v.model)+'</b><small>'+esc(v.plate||"Sem placa")+(plan?'<br>Recorrência atual: '+esc(recurringFrequencyLabel(freq)):'')+'</small></span>'+
      '</label>'+
      '<select data-avfreq="'+esc(v.id)+'" disabled aria-label="Frequência de '+esc(v.brand+" "+v.model)+'">'+
        '<option value="once">Somente esta vez</option>'+
        '<option value="weekly">Semanal — até eu alterar</option>'+
        '<option value="biweekly">Quinzenal — até eu alterar</option>'+
      '</select>'+
      '<label data-avsizewrap class="hidden" style="margin-top:7px">Porte do veículo'+
        '<select data-avsize="'+esc(v.id)+'" disabled aria-label="Porte de '+esc(v.brand+" "+v.model)+'">'+
          '<option value="">Selecione P/M ou G</option>'+
          '<option value="pm">P/M — hatch ou sedã</option>'+
          '<option value="g">G — SUV, picape, minivan ou 7+ lugares</option>'+
        '</select>'+
      '</label>'+
    '</div>'
  }).join("");
  list.forEach(v=>{
    const plan=apptRecurringByVehicle.get(v.id),freq=plan?.frequency==="weekly"||plan?.frequency==="biweekly"?plan.frequency:"once";
    const f=box.querySelector('[data-avfreq="'+CSS.escape(v.id)+'"]');
    if(f)f.value=freq;
    const z=appointmentVehicleSizeSelect(v.id);
    if(z)z.value=v.package_size==="g"?"g":(v.package_size==="pm"?"pm":"")
  });
  box.querySelectorAll("[data-avmulti]").forEach(c=>c.onchange=()=>{
    const f=box.querySelector('[data-avfreq="'+CSS.escape(c.value)+'"]');
    if(f)f.disabled=!c.checked;
    const z=appointmentVehicleSizeSelect(c.value),svc=services.find(x=>x.id===$("as").value);
    if(z)z.disabled=!c.checked||!serviceUsesVehicleSizePricing(svc);
    updateMultiVehicleSelection()
  });
  box.querySelectorAll("[data-avfreq]").forEach(f=>f.onchange=()=>updateMultiVehicleSelection(false));
  box.querySelectorAll("[data-avsize]").forEach(z=>z.onchange=()=>updateMultiVehicleSelection(false));
  refreshAppointmentPackageSizeUI();
  refreshAppointmentPackageFrequencyUI();
  updateMultiVehicleSelection(false)
}
function selectedBatchRecurrences(){
  if($("aid").value)return[];
  const svc=services.find(x=>x.id===$("as").value),fallback=serviceIsPackage(svc)?"":"once";
  return selectedBatchVehicleIds().map(id=>({
    vehicle_id:id,
    frequency:$("avmulti").querySelector('[data-avfreq="'+CSS.escape(id)+'"]')?.value||fallback
  }))
}
function updateMultiVehicleSelection(refreshSlots=true){
  const all=[...$("avmulti").querySelectorAll('input[data-avmulti]')],ids=all.filter(x=>x.checked).map(x=>x.value),n=ids.length;
  $("av").value=ids[0]||"";
  $("avselectall").textContent=all.length&&n===all.length?"Desmarcar todos":"Selecionar todos";
  const s=services.find(x=>x.id===$("as").value),total=s?Number(s.duration_minutes||0)*n:0,recs=selectedBatchRecurrences();
  const weekly=recs.filter(x=>x.frequency==="weekly").length,biweekly=recs.filter(x=>x.frequency==="biweekly").length;
  let parts=[n?n+" veículo"+(n===1?" selecionado":"s selecionados"):"Nenhum veículo selecionado."];
  if(total)parts.push("bloco de "+durationLabel(total));
  if(serviceIsPackage(s)&&n){
    const missingSize=ids.filter(id=>!["pm","g"].includes(appointmentVehicleSizeSelect(id)?.value||""));
    const missingFreq=recs.filter(x=>!["weekly","biweekly"].includes(x.frequency));
    if(missingSize.length)parts.push("defina P/M ou G em "+missingSize.length+" veículo"+(missingSize.length===1?"":"s"));
    if(missingFreq.length)parts.push("escolha Quinzenal ou Semanal");
    if(!missingSize.length&&!missingFreq.length){
      if(n===1){
        const id=ids[0],freq=recs[0].frequency,meta=packageFrequencyMeta(freq),monthly=packageMonthlyAmount(s,appointmentVehicleSizeSelect(id)?.value||"",freq);
        parts.push(meta.label+" • "+meta.visits+" estéticas/mês");
        if(financeAllowed())parts.push("mensalidade: "+money(monthly))
      }else if(financeAllowed()){
        const monthlyTotal=ids.reduce((sum,id)=>{
          const freq=recs.find(x=>x.vehicle_id===id)?.frequency||"";
          return sum+Number(packageMonthlyAmount(s,appointmentVehicleSizeSelect(id)?.value||"",freq)||0)
        },0);
        parts.push("mensalidades: "+money(monthlyTotal)+"/mês")
      }
    }
  }else{
    if(weekly)parts.push(weekly+" semanal"+(weekly===1?"":"is"));
    if(biweekly)parts.push(biweekly+(biweekly===1?" quinzenal":" quinzenais"));
    if(serviceUsesVehicleSizePricing(s)&&n){
      const missing=ids.filter(id=>!["pm","g"].includes(appointmentVehicleSizeSelect(id)?.value||""));
      if(missing.length)parts.push("defina P/M ou G em "+missing.length+" veículo"+(missing.length===1?"":"s"));
      else if(financeAllowed()){
        const packageTotal=ids.reduce((sum,id)=>sum+Number(servicePriceByVehicleSize(s,appointmentVehicleSizeSelect(id)?.value)||0),0);
        parts.push("pacote"+(n>1?"s":"")+": "+money(packageTotal))
      }
    }
  }
  $("avmultisummary").textContent=parts.join(" • ");
  refreshAppointmentServiceOptions();
  if(s){
    const h=$("shelp");
    h.textContent=appointmentServiceHelpText(s);h.classList.remove("hidden")
  }
  syncPackageCommercialDiscountUI();
  $("apsave").textContent=appointmentSubmitLabel();
  if(refreshSlots)loadAvailableSlots()
}
function toggleAllAppointmentVehicles(){
  const all=[...$("avmulti").querySelectorAll('input[data-avmulti]')];
  if(!all.length)return;
  const shouldCheck=!all.every(x=>x.checked);
  all.forEach(x=>{
    x.checked=shouldCheck;
    const f=$("avmulti").querySelector('[data-avfreq="'+CSS.escape(x.value)+'"]');
    if(f)f.disabled=!shouldCheck;
    const z=appointmentVehicleSizeSelect(x.value),svc=services.find(q=>q.id===$("as").value);
    if(z)z.disabled=!shouldCheck||!serviceUsesVehicleSizePricing(svc)
  });
  updateMultiVehicleSelection()
}
function fillSelects(){
  $("ac").innerHTML='<option value=""></option>'+clients.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join("");
  refreshAppointmentServiceOptions();
  const activeTeams=teams.filter(t=>t.active);
  let html='<option value="">Equipe não definida</option>';
  if(activeTeams.length)html+='<optgroup label="Equipes">'+activeTeams.map(t=>'<option value="team:'+t.id+'">'+esc(teamDisplay(t.id))+'</option>').join("")+'</optgroup>';
  html+='<optgroup label="Colaborador individual">'+collabs.map(c=>'<option value="collab:'+c.id+'">'+esc(c.name)+'</option>').join("")+'</optgroup>';
  $("acol").innerHTML=html
}
function selectedAssignment(){const v=$("acol").value||"";return{team_id:v.startsWith("team:")?v.slice(5):null,collaborator_id:v.startsWith("collab:")?v.slice(7):null}}
function durationLabel(m){m=Number(m||0);if(m%60===0)return (m/60)+" h";if(m>60)return Math.floor(m/60)+" h "+(m%60)+" min";return m+" min"}
function appointmentDiscountCalc(){
  const gross=Number($("apvalue").value||0),type=$("apdiscounttype").value,raw=Number($("apdiscountvalue").value||0);
  let discount=0,percent=0,error="";
  if(!Number.isFinite(gross)||gross<0)error="Informe um valor válido para o atendimento.";
  if(!error&&type==="percent"){
    if(raw<0||raw>100)error="O desconto percentual deve ficar entre 0% e 100%.";
    else{percent=raw;discount=Math.round(gross*percent)/100}
  }else if(!error&&type==="fixed"){
    if(raw<0)error="O desconto não pode ser negativo.";
    else if(raw>gross)error="O desconto não pode ser maior que o valor do atendimento.";
    else{discount=Math.round(raw*100)/100;percent=gross?discount/gross*100:0}
  }
  const final=Math.max(0,Math.round((gross-discount)*100)/100);
  return{gross,type,raw,discount,percent,final,error}
}
function syncPackageCommercialDiscountUI(){
  if(!$("apdiscountblock")||$("aid").value)return;
  const svc=services.find(x=>x.id===$("as").value),ids=selectedBatchVehicleIds();
  const isPlan=serviceIsPackage(svc),single=isPlan&&ids.length===1,vehicleId=single?ids[0]:"";
  const size=vehicleId?(appointmentVehicleSizeSelect(vehicleId)?.value||""):"";
  const freq=vehicleId?($("avmulti").querySelector('[data-avfreq="'+CSS.escape(vehicleId)+'"]')?.value||""):"";
  const gross=single?packageMonthlyAmount(svc,size,freq):null;
  const visible=financeAllowed()&&single&&gross!==null;
  const context=visible?(svc.id+"|"+vehicleId):"";
  if(context&&window.__packageDiscountContext!==context){
    $("apdiscounttype").value="none";$("apdiscountvalue").value="";
  }
  window.__packageDiscountContext=context;
  $("apvaluewrap").classList.add("hidden");
  $("apdiscountblock").classList.toggle("hidden",!visible);
  if($("apdiscounttitle"))$("apdiscounttitle").textContent="Desconto comercial do plano";
  if(visible){
    $("apvalue").value=Number(gross).toFixed(2);
    updateAppointmentDiscountPreview()
  }else if(!isPlan||ids.length!==1){
    $("apdiscounttype").value="none";$("apdiscountvalue").value="";$("apvalue").value=""
  }
}
function updateAppointmentDiscountPreview(){
  if(!$("apdiscountpreview")||$("apdiscountblock").classList.contains("hidden"))return;
  const type=$("apdiscounttype").value,wrap=$("apdiscountwrap"),input=$("apdiscountvalue");
  wrap.classList.toggle("hidden",type==="none");
  $("apdiscountlabel").textContent=type==="percent"?"Percentual de desconto (%)":"Valor do desconto (R$)";
  input.max=type==="percent"?"100":String(Math.max(0,Number($("apvalue").value||0)));
  const q=appointmentDiscountCalc();
  $("apdiscountpreview").className="payment-preview"+(q.error?" has-error":"");
  const planCommercial=!$("aid").value&&serviceIsPackage(services.find(x=>x.id===$("as").value));
  $("apdiscountpreview").innerHTML=
    '<div><span>'+(planCommercial?"Mensalidade de tabela":"Valor original")+'</span><b>'+esc(money(q.gross))+'</b></div>'+
    '<div><span>'+(planCommercial?"Desconto comercial":"Desconto")+'</span><b>− '+esc(money(q.discount))+'</b></div>'+
    '<div class="payment-preview-final"><span>'+(planCommercial?"Mensalidade contratada":"Valor final")+'</span><strong>'+esc(money(q.final))+'</strong></div>'+
    (q.error?'<div class="meta payment-preview-error">'+esc(q.error)+'</div>':'')
}
async function applyServiceRule(){
  const s=services.find(x=>x.id===$("as").value),h=$("shelp");
  if(!s){
    h.textContent="";h.classList.add("hidden");
    if(!$("aid").value)updateMultiVehicleSelection(false);
    await loadAvailableSlots();return
  }
  refreshAppointmentPackageFrequencyUI();
  h.textContent=appointmentServiceHelpText(s);h.classList.remove("hidden");
  refreshAppointmentPackageSizeUI();
  if($("aid").value&&financeAllowed()&&!window.__appointmentValueTouched){
    const base=serviceUsesVehicleSizePricing(s)?servicePriceByVehicleSize(s,$("appackagesize").value):Number(s.price||0);
    if(base!==null){
      $("apvalue").value=(Number(base||0)+Number(window.__editingAppointmentAddonValue||0)).toFixed(2);
      updateAppointmentDiscountPreview()
    }
  }
  if(!$("aid").value)updateMultiVehicleSelection(false);
  await loadAvailableSlots()
}
function adminScheduleOverrideAllowed(){return ["owner","admin"].includes(currentRole)&&!$("aid").value&&!serviceIsPackage(services.find(x=>x.id===$("as").value))}
function adminScheduleOverrideSelected(){return adminScheduleOverrideAllowed()&&$("apoverride").checked}
function syncAdminScheduleOverride(){
  const allowed=adminScheduleOverrideAllowed();
  $("apoverridewrap").classList.toggle("hidden",!allowed);
  if(!allowed)$("apoverride").checked=false;
  const active=allowed&&$("apoverride").checked;
  $("apoverridefields").classList.toggle("hidden",!active);
  $("apoverridetime").required=active;$("apoverridereason").required=active;
  $("atm").required=!active;
  $("atm").closest("label").classList.toggle("hidden",active);
  return active;
}
$("apoverride").addEventListener("change",()=>loadAvailableSlots());
async function loadAvailableSlots(preferred=""){
  const req=++slotRequestSeq,t=$("atm"),help=$("slothelp"),service=$("as").value,date=$("adt").value,assignment=selectedAssignment(),collab=assignment.collaborator_id,team=assignment.team_id,id=$("aid").value||null,b=$("apsave"),vehicleIds=selectedBatchVehicleIds();
  const override=syncAdminScheduleOverride();
  if(override){
    ++slotRequestSeq;t.disabled=true;t.innerHTML='<option value="">Encaixe manual</option>';
    if(!$("apoverridetime").value)$("apoverridetime").value=preferred||"08:00";
    b.textContent="Confirmar encaixe";
    b.disabled=!service||!vehicleIds.length||!date;
    help.textContent="Atenção: este encaixe pode sobrepor atendimentos da equipe e ultrapassar a capacidade do dia. Confirme a capacidade real antes de salvar.";
    return;
  }
  t.disabled=true;t.innerHTML='<option value="">Verificando disponibilidade...</option>';b.disabled=true;b.textContent="Verificando...";
  if(!service||!vehicleIds.length||!date){
    if(req!==slotRequestSeq)return;
    t.innerHTML='<option value="">Selecione serviço, veículo e data</option>';
    help.textContent=id?"Escolha serviço, veículo e data para ver os horários disponíveis.":"Selecione um ou mais veículos, serviço e data.";
    b.textContent=appointmentSubmitLabel();return
  }
  const r=id
    ?await sb.rpc("get_available_slots",{p_date:date,p_service_id:service,p_vehicle_id:vehicleIds[0],p_collaborator_id:collab,p_exclude_appointment_id:id,p_team_id:team})
    :await sb.rpc("get_multi_vehicle_slots",{p_date:date,p_service_id:service,p_vehicle_ids:vehicleIds,p_collaborator_id:collab,p_team_id:team});
  if(req!==slotRequestSeq)return;
  b.textContent=appointmentSubmitLabel();
  if(r.error){t.innerHTML='<option value="">Não foi possível consultar</option>';help.textContent=fail(r.error);b.disabled=true;return}
  const rows=r.data||[];
  if(!rows.length){
    if(id&&preferred){
      t.innerHTML='<option value="'+esc(preferred)+'">'+esc(preferred)+' • horário atual</option>';
      t.value=preferred;t.disabled=false;b.disabled=false;
      help.textContent="Horário atual preservado. Você pode alterar observações sem remanejar o atendimento.";
      show("apmsg","");
      return
    }
    t.innerHTML='<option value="">Nenhum horário disponível</option>';
    const selectedLabel=$("acol").selectedOptions?.[0]?.textContent?.trim()||"responsável selecionado";
    const msg=id&&($("acol").value||"")
      ?selectedLabel+" não está disponível nesse horário. Escolha outro responsável ou outro horário."
      :(id
        ?"Não há horário compatível nesta data para esse serviço. Escolha outro dia, serviço ou equipe."
        :"Não há um bloco contínuo disponível para todos os veículos selecionados. Reduza a seleção, mude o horário/equipe ou escolha outro dia.");
    help.textContent=msg;
    if(id)show("apmsg",msg,"error");
    b.disabled=true;b.textContent=appointmentSubmitLabel();return
  }
  t.innerHTML=rows.map(x=>'<option value="'+esc(x.local_time)+'">'+esc(x.local_time)+'</option>').join("");
  if(preferred){
    if(rows.some(x=>x.local_time===preferred))t.value=preferred;
    else if(id){
      t.insertAdjacentHTML("afterbegin",'<option value="'+esc(preferred)+'">'+esc(preferred)+' • horário atual</option>');
      t.value=preferred
    }
  }
  t.disabled=false;b.disabled=false;
  help.textContent=id
    ?(preferred&&!rows.some(x=>x.local_time===preferred)
      ?"Horário atual preservado. Para remanejar, escolha outro horário disponível."
      :rows.length+" horário"+(rows.length===1?" disponível":"s disponíveis")+" nesta data.")
    :rows.length+" início"+(rows.length===1?" disponível":"s disponíveis")+" para "+vehicleIds.length+" veículo"+(vehicleIds.length===1?"":"s")+" em sequência."
}
async function fillVehicles(cid){
  const [r,rr]=await Promise.all([
    sb.from("vehicles").select("*").eq("client_id",cid).is("archived_at",null).order("brand").order("model"),
    sb.from("recurring_plans").select("id,vehicle_id,service_id,frequency,local_time,start_date,team_id,collaborator_id").eq("client_id",cid).eq("active",true)
  ]);
  if(r.error)return show("msg",fail(r.error),"error");
  const list=r.data||[];
  apptRecurringByVehicle=new Map((rr.error?[]:(rr.data||[])).map(x=>[x.vehicle_id,x]));
  vehicles.set(cid,list);
  $("av").innerHTML='<option value="">Selecione</option>'+list.map(v=>'<option value="'+v.id+'">'+esc(v.brand+" "+v.model+(v.plate?" • "+v.plate:""))+'</option>').join("");
  setApptVehicleMode(!!$("aid").value);
  if(!$("aid").value)renderMultiVehiclePicker(list)
}
function spDateTime(iso){const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date(iso)),g=t=>p.find(x=>x.type===t)?.value||"";return{date:g("year")+"-"+g("month")+"-"+g("day"),time:g("hour")+":"+g("minute")}}
async function openAppt(){try{window.__appointmentIdempotencyKey=crypto.randomUUID();window.__appointmentSaveInFlight=false;window.__appointmentValueTouched=false;window.__packageDiscountContext="";window.__editingAppointmentAddonValue=0;$("apf").reset();$("aid").value="";syncAdminScheduleOverride();$("aptitle").textContent="Novo agendamento";$("apsave").textContent="Agendar";$("apvaluewrap").classList.add("hidden");$("apdiscountblock").classList.add("hidden");$("apvalue").value="";$("apdiscounttype").value="none";$("apdiscountvalue").value="";$("appackagesize").value="";$("appackagesizewrap").classList.add("hidden");show("apmsg","");await refs();fillSelects();setApptVehicleMode(false);clearApptClientPicker();$("adt").value=$("date").value||today();$("atm").innerHTML='<option value="">Selecione serviço, veículos e data</option>';$("atm").disabled=true;$("apsave").disabled=true;$("slothelp").textContent="Selecione um ou mais veículos, serviço e data.";$("shelp").textContent="";$("shelp").classList.add("hidden");$("ad").showModal()}catch(e){show("msg",fail(e),"error")}}
async function openAppointmentDetail(id){
  try{
    const a=currentApps.find(x=>x.id===id);
    if(!a)throw Error("Atendimento não encontrado.");
    const client=clients.find(x=>x.id===a.client_id),vehicle=findVehicleLocal(a.vehicle_id),service=services.find(x=>x.id===a.service_id),responsible=collabs.find(x=>x.id===a.collaborator_id),assignedTeam=teams.find(x=>x.id===a.team_id),responsibleLabel=assignedTeam?teamDisplay(assignedTeam.id):(responsible?.name||"Não definido"),packageVisit=serviceIsPackage(service)&&!!a.recurring_plan_id;
    const [ph,exr]=await Promise.all([
      sb.from("appointment_completion_photos").select("*").eq("appointment_id",id).maybeSingle(),
      sb.from("appointment_completion_exceptions").select("*").eq("appointment_id",id).maybeSingle()
    ]);
    if(ph.error)throw ph.error;if(exr.error)throw exr.error;
    const photo=ph.data||null,completionException=exr.data||null;
    let packageCharge=null;
    if(packageVisit&&financeAllowed()){
      const psr=await sb.from("package_subscriptions").select("id").eq("recurring_plan_id",a.recurring_plan_id).maybeSingle();
      if(psr.error)throw psr.error;
      if(psr.data?.id){
        const competence=spDateTime(a.starts_at).date.slice(0,7)+"-01";
        const pcr=await sb.from("package_charges").select("*").eq("subscription_id",psr.data.id).eq("competence_month",competence).neq("status","cancelled").order("created_at",{ascending:false}).limit(1).maybeSingle();
        if(pcr.error)throw pcr.error;
        packageCharge=pcr.data||null
      }
    }
    let photoUrl="";
    if(photo?.storage_path){
      const su=await sb.storage.from("completion-photos").createSignedUrl(photo.storage_path,900);
      if(!su.error)photoUrl=su.data?.signedUrl||""
    }
    const scheduled=spDateTime(a.starts_at);
    const completed=a.completed_at?spDateTime(a.completed_at):null;
    const captured=photo?.captured_at?spDateTime(photo.captured_at):null;
    const exceptionAt=completionException?.recorded_at?spDateTime(completionException.recorded_at):null;
    const finisher=photo?.collaborator_id?(collabs.find(x=>x.id===photo.collaborator_id)?.name||responsibleLabel||"Equipe Vaporeasy"):(assignedTeam?teamDisplay(assignedTeam.id):(responsible?.name||photo?.uploaded_by_name||"Equipe Vaporeasy"));
    const status=statusLabel(a.status);
    const packageChargeLabel=packageVisit
      ?(packageCharge
        ?("Mensalidade "+money(packageCharge.amount)+" • "+(packageCharge.status==="paid"?"paga":packageCharge.status==="covered"?"quitada por crédito":"pagamento pendente"))
        :"Incluído na mensalidade do pacote")
      :"";
    $("ddcontent").innerHTML=
      '<div class="item" style="margin:0">'+
        '<h3 style="margin-top:0">'+esc(client?.name||"Cliente")+'</h3>'+
        '<div class="meta"><b>'+esc(vehicle?(vehicle.brand+" "+vehicle.model+(vehicle.plate?" • "+vehicle.plate:"")):"Veículo")+'</b></div>'+
      '</div>'+
      '<div class="item" style="margin-top:10px">'+
        '<div class="meta"><b>Serviço</b><br>'+esc(service?.name||"Serviço")+'</div>'+
        '<div class="meta" style="margin-top:10px"><b>Status</b><br>'+esc(status)+'</div>'+
        '<div class="meta" style="margin-top:10px"><b>Agendado para</b><br>'+esc(scheduled.date+" • "+scheduled.time)+'</div>'+
        '<div class="meta" style="margin-top:10px"><b>Equipe / responsável</b><br>'+esc(responsibleLabel)+'</div>'+(financeAllowed()?'<div class="meta" style="margin-top:10px"><b>'+esc(packageVisit?"Cobrança":"Valor")+'</b><br>'+esc(packageVisit?packageChargeLabel:money(a.final_value))+'</div>':'')+
        (a.notes?'<div class="meta" style="margin-top:10px"><b>Observações</b><br>'+esc(a.notes)+'</div>':'')+
      '</div>'+
      (a.status==="completed"?
        '<div class="item" style="margin-top:10px">'+
          '<h3 style="margin-top:0">Finalização interna</h3>'+
          '<div class="meta"><b>Horário da conclusão</b><br>'+esc(completed?(completed.date+" • "+completed.time):"Não registrado")+'</div>'+
          '<div class="meta" style="margin-top:10px"><b>Responsável pela finalização</b><br>'+esc(finisher)+'</div>'+
          (completionException?'<div class="notice finish-exception-history" style="margin-top:10px"><b>Concluído sem foto — com justificativa</b><br><span>'+esc(completionException.reason)+'</span><div class="meta" style="margin-top:7px">Registrado por '+esc(completionException.recorded_by_name||"Equipe Vaporeasy")+(exceptionAt?' • '+esc(exceptionAt.date+" • "+exceptionAt.time):'')+'</div></div>':'')+
          (photo?'<div class="meta" style="margin-top:10px"><b>Foto interna registrada</b><br>'+esc(captured?(captured.date+" • "+captured.time):"Registrada")+'</div>':(!completionException?'<div class="notice" style="margin-top:10px">Foto final não registrada.</div>':''))+
          (photoUrl?'<img src="'+esc(photoUrl)+'" alt="Foto final interna do veículo" style="width:100%;max-height:420px;object-fit:cover;border-radius:14px;border:1px solid #31576a;margin-top:12px;display:block">':'')+
          '<div class="meta" style="margin-top:8px">Uso interno da Vaporeasy. Fotos e justificativas de exceção não são enviadas ao cliente.</div>'+
        '</div>':'')+
      '<div class="actions" style="margin-top:12px">'+
        (packageVisit&&packageCharge&&["pending","paid"].includes(packageCharge.status)&&financeAllowed()?'<button class="primary" type="button" data-detail-package-charge="'+esc(packageCharge.id)+'">'+(packageCharge.status==="paid"?"Recibo de pagamento":"Mensalidade / Pix")+'</button>':'')+
        (a.status!=="completed"&&a.status!=="cancelled"?'<button class="ghost" type="button" data-detail-edit="'+esc(a.id)+'">Editar agendamento</button>':'')+
      '</div>';
    $("dd").showModal();
    const eb=$("dd").querySelector("[data-detail-edit]"),cb=$("dd").querySelector("[data-detail-package-charge]");
    if(eb)eb.onclick=()=>{$("dd").close();openEditAppt(id)};
    if(cb)cb.onclick=()=>sharePackageCharge(cb.dataset.detailPackageCharge)
  }catch(e){show("msg",fail(e),"error")}
}
async function openEditAppt(id){try{window.__appointmentIdempotencyKey="";window.__appointmentSaveInFlight=false;window.__appointmentValueTouched=false;window.__editingAppointmentAddonValue=0;const fresh=await sb.from("appointments").select("*").eq("id",id).single();if(fresh.error)throw fresh.error;const x=fresh.data;if(!x)throw Error("Agendamento não encontrado.");const idx=currentApps.findIndex(a=>String(a.id)===String(id));if(idx>=0)currentApps[idx]={...currentApps[idx],...x};if(x.status==="completed"||x.status==="cancelled"){agendaMonthCache.clear();await loadApps();throw Error(x.status==="completed"?"Este agendamento já foi concluído e não pode mais ser editado.":"Este agendamento já foi cancelado e não pode mais ser editado.");}$("apf").reset();show("apmsg","");await refs();fillSelects();$("aid").value=x.id;syncAdminScheduleOverride();setApptVehicleMode(true);$("aptitle").textContent="Editar agendamento";$("apsave").textContent="Salvar alterações";window.__editingAppointmentAddonValue=Number(x.addon_value||0);window.__editingAppointmentDiscountAmount=Number(x.discount_amount||0);window.__editingAppointmentDiscountPercent=Number(x.discount_percent||0);$("apvalue").value=(Number(x.base_value||0)+Number(x.addon_value||0)).toFixed(2);$("apvaluewrap").classList.toggle("hidden",!financeAllowed());$("apdiscountblock").classList.toggle("hidden",!financeAllowed());const existingDiscount=Number(x.discount_amount||0),existingPercent=Number(x.discount_percent||0);if(existingDiscount>0&&existingPercent>0){$("apdiscounttype").value="percent";$("apdiscountvalue").value=existingPercent.toFixed(2)}else if(existingDiscount>0){$("apdiscounttype").value="fixed";$("apdiscountvalue").value=existingDiscount.toFixed(2)}else{$("apdiscounttype").value="none";$("apdiscountvalue").value=""}updateAppointmentDiscountPreview();syncApptClientPicker(x.client_id);await fillVehicles(x.client_id);$("av").value=x.vehicle_id;$("as").value=x.service_id;syncSingleAppointmentPackageSize(false);$("appackagesizewrap").classList.toggle("hidden",!serviceUsesVehicleSizePricing(services.find(q=>q.id===x.service_id)));$("acol").value=x.team_id?"team:"+x.team_id:(x.collaborator_id?"collab:"+x.collaborator_id:"");const dt=spDateTime(x.starts_at);$("adt").value=dt.date;$("an").value=x.notes||"";$("ad").showModal();const s=services.find(q=>q.id===x.service_id),h=$("shelp");const expectedBase=s?(serviceUsesVehicleSizePricing(s)?servicePriceByVehicleSize(s,$("appackagesize").value):Number(s.price||0)):null;window.__appointmentValueTouched=!!(s&&expectedBase!==null&&Math.abs(Number(x.base_value||0)-Number(expectedBase||0))>0.009);if(s){let parts=["Duração estimada: "+durationLabel(s.duration_minutes)];if(s.first_slot_time)parts.push("Primeiro horário obrigatório: "+String(s.first_slot_time).slice(0,5));if(s.booking_mode==="request")parts.push("Agendamento público sujeito à confirmação");h.textContent=parts.join(" • ");h.classList.remove("hidden")}await loadAvailableSlots(dt.time)}catch(e){show("msg",fail(e),"error")}}
async function saveAppt(e){
  e.preventDefault();
  if(window.__appointmentSaveInFlight)return;
  const b=$("apsave"),id=$("aid").value,clientId=$("ac").value,vehicleIds=selectedBatchVehicleIds(),serviceId=$("as").value,date=$("adt").value,time=adminScheduleOverrideSelected()?$("apoverridetime").value:$("atm").value,
    requestKey=id?"":(window.__appointmentIdempotencyKey||(window.__appointmentIdempotencyKey=crypto.randomUUID()));
  show("apmsg","");
  if(!clientId)return show("apmsg","Selecione o cliente.","error");
  if(!vehicleIds.length)return show("apmsg","Selecione pelo menos um veículo.","error");
  if(!serviceId)return show("apmsg","Selecione o serviço.","error");
  if(!date)return show("apmsg","Selecione a data.","error");
  if(!time)return show("apmsg","Selecione um horário disponível.","error");
  if(!id&&date<today())return show("apmsg","Para datas passadas, use Ações da agenda → Registrar serviço realizado. Isso registra o histórico sem criar ou alterar recorrências futuras.","error");
  const s=services.find(x=>x.id===serviceId);
  if(!s)return show("apmsg","Serviço inválido. Feche e abra o agendamento novamente.","error");
  const packageSizes=serviceUsesVehicleSizePricing(s)
    ?vehicleIds.map(vehicle_id=>({vehicle_id,size:id?$("appackagesize").value:(appointmentVehicleSizeSelect(vehicle_id)?.value||"")}))
    :[];
  if(packageSizes.some(x=>!["pm","g"].includes(x.size)))return show("apmsg","Defina o porte P/M ou G de todos os veículos selecionados para aplicar o preço correto do pacote.","error");
  const selectedRecurrences=selectedBatchRecurrences();
  if(!id&&serviceIsPackage(s)&&selectedRecurrences.some(x=>!["weekly","biweekly"].includes(x.frequency)))return show("apmsg","Para contratar o pacote, escolha Quinzenal ou Semanal.","error");
  const override=adminScheduleOverrideSelected();
  if(override){
    if(selectedRecurrences.some(x=>x.frequency!=="once"))return show("apmsg","O encaixe é pontual. Selecione Avulso / sem recorrência para todos os veículos.","error");
    if($("apoverridereason").value.trim().length<10)return show("apmsg","Informe uma justificativa com pelo menos 10 caracteres.","error");
    if(!window.confirm("Confirmar encaixe às "+time+"? A equipe pode ter atendimentos sobrepostos. Você confirma que há capacidade para atender?"))return;
  }
  const assignment=selectedAssignment();
  window.__appointmentSaveInFlight=true;
  b.disabled=true;b.textContent=id?"Salvando...":"Agendando...";
  try{
    if(serviceUsesVehicleSizePricing(s)){
      for(const item of packageSizes){
        const local=findVehicleLocal(item.vehicle_id);
        if(local?.package_size===item.size)continue;
        const ur=await sb.from("vehicles").update({package_size:item.size,updated_by:currentUserId,updated_at:new Date().toISOString()}).eq("id",item.vehicle_id);
        if(ur.error)throw ur.error;
        if(local)local.package_size=item.size
      }
    }
    if(id){
      const existing=currentApps.find(x=>x.id===id),addonValue=Number(existing?.addon_value??window.__editingAppointmentAddonValue??0),localIso=date+"T"+time+":00",localDate=new Date(localIso);
      if(Number.isNaN(localDate.getTime()))throw Error("Data ou horário inválido. Selecione o horário novamente.");
      const standardBase=serviceUsesVehicleSizePricing(s)?Number(servicePriceByVehicleSize(s,packageSizes[0]?.size)||0):Number(s.price||0);const q=financeAllowed()?appointmentDiscountCalc():{gross:standardBase+addonValue,discount:Number(window.__editingAppointmentDiscountAmount||0),percent:Number(window.__editingAppointmentDiscountPercent||0),final:Math.max(0,standardBase+addonValue-Number(window.__editingAppointmentDiscountAmount||0)),error:""};
      if(q.error)throw Error(q.error);
      if(q.gross+0.009<addonValue)throw Error("O valor do atendimento não pode ser menor que os extras já vinculados ("+money(addonValue)+").");
      const customBase=Math.round(Math.max(0,q.gross-addonValue)*100)/100,customTotal=Math.round(q.final*100)/100,discountAmount=Math.round(q.discount*100)/100,discountPercent=Math.round(q.percent*10000)/10000;
      const p={client_id:clientId,vehicle_id:vehicleIds[0],service_id:s.id,team_id:assignment.team_id,collaborator_id:assignment.collaborator_id,starts_at:localDate.toISOString(),duration_minutes:s.duration_minutes,base_value:customBase,discount_amount:discountAmount,discount_percent:discountPercent,final_value:customTotal,notes:$("an").value};
      const r=await sb.from("appointments").update(p).eq("id",id).select("id,starts_at,base_value,discount_amount,discount_percent,final_value").single();
      if(r.error)throw r.error
    }else{
      let recurrences=selectedRecurrences;
      if(serviceIsPackage(s)&&vehicleIds.length===1&&financeAllowed()){
        syncPackageCommercialDiscountUI();
        const q=appointmentDiscountCalc();
        if(q.error)throw Error(q.error);
        recurrences=recurrences.map(x=>({...x,commercial_discount_type:q.type,commercial_discount_value:q.type==="none"?0:q.raw}))
      }
      const r=await sb.rpc(override?"create_admin_schedule_override":"create_multi_vehicle_booking_recurring",{
        p_client_id:clientId,
        p_vehicle_ids:vehicleIds,
        p_service_id:s.id,
        p_date:date,
        p_local_time:time,
        ...(override?{p_reason:$("apoverridereason").value.trim()}:{p_recurrences:recurrences}),
        p_team_id:assignment.team_id,
        p_collaborator_id:assignment.collaborator_id,
        p_notes:$("an").value.trim(),
        p_idempotency_key:requestKey
      });
      if(r.error)throw r.error;
      const result=r.data||{},weekly=Number(result.weekly_count||0),biweekly=Number(result.biweekly_count||0),billing=Array.isArray(result.package_billing)?result.package_billing:[];
      let msg=override?"Encaixe autorizado e salvo. Justificativa registrada.":(vehicleIds.length>1?vehicleIds.length+" veículos agendados em sequência.":"Agendamento salvo com sucesso.");
      if(billing.length){
        let chargeMap=new Map();
        const chargeIds=billing.map(x=>x.charge_id).filter(Boolean);
        if(chargeIds.length){
          const cr=await sb.from("package_charges").select("id,amount,gross_monthly_amount,credit_applied,status").in("id",chargeIds);
          if(!cr.error)(cr.data||[]).forEach(c=>chargeMap.set(c.id,c))
        }
        if(billing.length===1){
          const x=billing[0],meta=packageFrequencyMeta(x.frequency),c=chargeMap.get(x.charge_id),gross=Number(c?.gross_monthly_amount??x.monthly_amount??0),credit=Number(c?.credit_applied||0),due=Number(c?.amount??x.monthly_amount??0);
          const commercialDiscount=Math.max(0,gross-credit-due);
          if(x.scheduled_change){
            const effective=x.effective_on?new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(new Date(String(x.effective_on)+"T12:00:00")):"próximo mês";
            msg="Downgrade agendado para "+effective+": "+(meta?.label||"Recorrente")+" • "+Number(x.visits_per_month||meta?.visits||0)+" estéticas/mês • nova mensalidade "+money(x.monthly_amount)+"/mês. O pacote atual permanece válido até o fim deste mês e nenhuma cobrança adicional foi criada agora."
          }else if(credit>0)msg="Pacote alterado: "+(meta?.label||"Recorrente")+" • "+Number(x.visits_per_month||meta?.visits||0)+" estéticas/mês • mensalidade "+money(gross)+" • crédito de "+money(credit)+" já pago • cobrança complementar de "+money(due)+" criada no Financeiro.";
          else if(commercialDiscount>0)msg="Plano contratado: "+(meta?.label||"Recorrente")+" • "+Number(x.visits_per_month||meta?.visits||0)+" estéticas/mês • valor de tabela "+money(gross)+" • desconto comercial "+money(commercialDiscount)+" • mensalidade "+money(due)+". Cobrança criada no Financeiro.";
          else msg="Pacote contratado: "+(meta?.label||"Recorrente")+" • "+Number(x.visits_per_month||meta?.visits||0)+" estéticas/mês • cobrança de "+money(due)+" criada no Financeiro."
        }else{
          const total=billing.reduce((sum,x)=>sum+Number(chargeMap.get(x.charge_id)?.amount??x.monthly_amount??0),0);
          msg=billing.length+" pacotes contratados. Cobranças mensais criadas no Financeiro: "+money(total)+"."
        }
      }else{
        const rp=[];
        if(weekly)rp.push(weekly+" semanal"+(weekly===1?"":"is"));
        if(biweekly)rp.push(biweekly+(biweekly===1?" quinzenal":" quinzenais"));
        if(rp.length)msg+=" Recorrência ativa: "+rp.join(" e ")+" — até você alterar."
      }
      window.__lastAppointmentSaveMessage=msg
    }
    if(!id)window.__appointmentIdempotencyKey="";
    $("ad").close();$("date").value=date;agendaMonthCache.clear();
    show("msg",id?"Agendamento atualizado.":(window.__lastAppointmentSaveMessage||"Agendamento salvo com sucesso."),"ok");
    window.__lastAppointmentSaveMessage="";
    tab("age")
  }catch(err){show("apmsg",fail(err),"error")}
  finally{window.__appointmentSaveInFlight=false;b.disabled=false;b.textContent=appointmentSubmitLabel()}
}



function realizedVehicleIds(){
  return [...document.querySelectorAll('#rdvehicles input[data-rd-vehicle]:checked')].map(x=>x.value)
}
function updateRealizedVehicleSummary(){
  const ids=realizedVehicleIds(),box=$("rdvehiclesummary");
  box.textContent=ids.length?(ids.length+" veículo"+(ids.length===1?" selecionado":"s selecionados")+" em sequência."):"Nenhum veículo selecionado."
}
async function loadRealizedVehicles(){
  const cid=$("rdclient").value,box=$("rdvehicles");
  $("rdvehiclesummary").textContent="Nenhum veículo selecionado.";
  if(!cid){box.innerHTML='<div class="empty">Selecione o cliente primeiro.</div>';return}
  box.innerHTML='<div class="empty">Carregando veículos...</div>';
  const r=await sb.from("vehicles").select("id,brand,model,plate,package_size").eq("client_id",cid).is("archived_at",null).order("brand").order("model");
  if(r.error){box.innerHTML='<div class="notice error">'+esc(fail(r.error))+'</div>';return}
  const list=r.data||[];window.__realizedVehicles=new Map(list.map(v=>[v.id,v]));
  box.innerHTML=list.length?list.map(v=>'<div class="multi-vehicle-item"><label class="multi-vehicle-main"><input type="checkbox" data-rd-vehicle value="'+v.id+'" style="width:22px;min-height:22px"><span><b>'+esc(v.brand+" "+v.model)+'</b><small>'+esc(v.plate||"Sem placa")+'</small></span></label><label data-rd-sizewrap class="hidden" style="margin-top:7px">Porte do veículo<select data-rd-size="'+v.id+'" disabled><option value="">Selecione P/M ou G</option><option value="pm">P/M — hatch ou sedã</option><option value="g">G — SUV, picape, minivan ou 7+ lugares</option></select></label></div>').join(""):'<div class="empty">Nenhum veículo ativo para este cliente.</div>';
  list.forEach(v=>{const z=box.querySelector('[data-rd-size="'+CSS.escape(v.id)+'"]');if(z)z.value=v.package_size==="g"?"g":(v.package_size==="pm"?"pm":"")});
  box.querySelectorAll("input[data-rd-vehicle]").forEach(x=>x.onchange=()=>{syncRealizedSizeUI();updateRealizedVehicleSummary()});
  box.querySelectorAll("[data-rd-size]").forEach(x=>x.onchange=()=>{updateRealizedVehicleSummary()});
  syncRealizedSizeUI()
}
function syncRealizedSizeUI(){
  const svc=services.find(x=>x.id===$("rdservice").value),uses=serviceUsesVehicleSizePricing(svc);
  $("rdvehicles").querySelectorAll("[data-rd-sizewrap]").forEach(w=>w.classList.toggle("hidden",!uses));
  $("rdvehicles").querySelectorAll("[data-rd-size]").forEach(z=>{
    const cb=$("rdvehicles").querySelector('[data-rd-vehicle][value="'+CSS.escape(z.dataset.rdSize)+'"]');
    z.disabled=!uses||!cb?.checked
  });
  $("rdvaluewrap").classList.toggle("hidden",uses);
  $("rdvalue").required=!uses
}
function realizedSelectedPackageSizes(){
  return realizedVehicleIds().map(id=>({vehicle_id:id,size:$("rdvehicles").querySelector('[data-rd-size="'+CSS.escape(id)+'"]')?.value||""}))
}
function realizedAssignment(){
  const v=$("rdassign").value||"";
  if(v.startsWith("team:"))return{team_id:v.slice(5),collaborator_id:null};
  if(v.startsWith("collab:"))return{team_id:null,collaborator_id:v.slice(7)};
  return{team_id:null,collaborator_id:null}
}
function realizedQuote(){
  const svc=services.find(x=>x.id===$("rdservice").value);
  const raw=$("rdvalue").value;
  if(serviceUsesVehicleSizePricing(svc)){
    const selected=realizedSelectedPackageSizes(),prices=selected.map(x=>servicePriceByVehicleSize(svc,x.size)),missing=prices.some(x=>x===null);
    const type=$("rddisctype").value||"none",val=Math.max(0,Number($("rddiscvalue").value||0)||0);
    let error=missing?"Defina o porte P/M ou G de todos os veículos selecionados.":"";
    if(!error&&type==="percent"&&val>100)error="O desconto percentual não pode ultrapassar 100%.";
    if(!error&&type==="fixed"&&prices.length&&val>Math.min(...prices.map(Number)))error="O desconto em reais não pode ultrapassar o menor valor entre os veículos.";
    return{base:null,discount:0,percent:type==="percent"?Math.min(100,val):0,final:null,type,value:val,error,prices}
  }
  const base=Math.max(0,Number(raw===""?(svc?.price||0):raw)||0);
  const type=$("rddisctype").value||"none";
  const val=Math.max(0,Number($("rddiscvalue").value||0)||0);
  let discount=0,percent=0,error="";
  if(type==="percent"){
    if(val>100)error="O desconto percentual não pode ultrapassar 100%.";
    percent=Math.min(100,val);discount=base*percent/100
  }else if(type==="fixed"){
    if(val>base)error="O desconto em reais não pode ultrapassar o valor do serviço.";
    discount=Math.min(base,val);percent=base>0?discount/base*100:0
  }
  return{base,discount,percent,final:Math.max(0,base-discount),type,value:val,error}
}
function updateRealizedQuote(){
  const type=$("rddisctype").value||"none",wrap=$("rddiscwrap");
  wrap.classList.toggle("hidden",type==="none");
  $("rddisclabel").textContent=type==="percent"?"Percentual do desconto":"Valor do desconto (R$)";
  if(type==="none")$("rddiscvalue").value="";
  const q=realizedQuote(),box=$("rdpreview"),svc=services.find(x=>x.id===$("rdservice").value);
  if(q.error){box.innerHTML='<span style="color:#ff9a9a">'+esc(q.error)+'</span>';return}
  if(serviceUsesVehicleSizePricing(svc)){
    const selected=realizedSelectedPackageSizes(),rows=selected.map((x,i)=>{const base=Number(q.prices?.[i]||0),disc=q.type==="percent"?base*q.value/100:(q.type==="fixed"?q.value:0),final=Math.max(0,base-disc),v=window.__realizedVehicles?.get(x.vehicle_id);return '<div><span>'+esc((v?.brand||"Veículo")+" "+(v?.model||"")+" • "+(x.size==="g"?"G":"P/M"))+'</span><b>'+esc(money(final))+'</b></div>'});box.innerHTML=rows.length?rows.join(""):'Selecione ao menos um veículo.';
    return
  }
  box.innerHTML='Valor final por veículo: <b>'+esc(money(q.final))+'</b>'+(q.discount>0?' • desconto '+esc(money(q.discount)):'')
}
function applyRealizedService(){
  const svc=services.find(x=>x.id===$("rdservice").value);
  if(!svc){$("rdservicehelp").textContent="";$("rdvalue").value="";syncRealizedSizeUI();updateRealizedQuote();return}
  syncRealizedSizeUI();
  if(serviceUsesVehicleSizePricing(svc)){
    $("rdvalue").value="";
    $("rdservicehelp").textContent="Duração por veículo: "+durationLabel(svc.duration_minutes)+" • P/M "+money(svc.price_pm??svc.price)+" • G "+money(svc.price_g??svc.price)+" • valor aplicado automaticamente pelo porte.";
  }else{
    $("rdvalue").value=Number(svc.price||0).toFixed(2);
    $("rdservicehelp").textContent="Duração por veículo: "+durationLabel(svc.duration_minutes)+(svc.first_slot_time?" • horário padrão "+String(svc.first_slot_time).slice(0,5):"")
  }
  updateRealizedQuote()
}
async function openRealizedService(){
  if(!["owner","admin"].includes(currentRole))return show("msg","Seu nível de acesso não permite registrar serviços realizados.","error");
  try{
    await refs();
    if(!clients.length)await loadClients();
    $("rdf").reset();show("rdmsg","");
    window.__realizedIdempotencyKey=crypto.randomUUID();
    $("rdclient").innerHTML='<option value="">Selecione</option>'+clients.slice().sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join("");
    $("rdservice").innerHTML='<option value="">Selecione</option>'+services.filter(s=>s.active!==false).slice().sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join("");
    let opts='<option value="">Equipe não definida</option>';
    const activeTeams=teams.filter(t=>t.active!==false);
    if(activeTeams.length)opts+='<optgroup label="Equipes">'+activeTeams.map(t=>'<option value="team:'+t.id+'">'+esc(t.name)+'</option>').join("")+'</optgroup>';
    const activeCollabs=collabs.filter(c=>c.active!==false);
    if(activeCollabs.length)opts+='<optgroup label="Colaborador individual">'+activeCollabs.map(c=>'<option value="collab:'+c.id+'">'+esc(c.name)+'</option>').join("")+'</optgroup>';
    $("rdassign").innerHTML=opts;
    $("rddate").value=$("date").value||today();$("rddate").max=today();$("rdtime").value="";
    $("rdvehicles").innerHTML='<div class="empty">Selecione o cliente primeiro.</div>';$("rdvehiclesummary").textContent="Nenhum veículo selecionado.";
    $("rdpreview").innerHTML="";$("rdservicehelp").textContent="";
    $("rdd").showModal()
  }catch(e){show("msg",fail(e),"error")}
}
async function saveRealizedService(e){
  e.preventDefault();
  if(window.__realizedSaveInFlight)return;
  const clientId=$("rdclient").value,vehicleIds=realizedVehicleIds(),serviceId=$("rdservice").value,date=$("rddate").value,time=$("rdtime").value,q=realizedQuote();
  show("rdmsg","");
  if(!clientId)return show("rdmsg","Selecione o cliente.","error");
  if(!vehicleIds.length)return show("rdmsg","Selecione pelo menos um veículo.","error");
  if(!serviceId)return show("rdmsg","Selecione o serviço.","error");
  if(!date||!time)return show("rdmsg","Informe a data e o horário em que o serviço foi realizado.","error");
  if(date>today())return show("rdmsg","A data do serviço realizado não pode estar no futuro.","error");
  if(q.error)return show("rdmsg",q.error,"error");
  const svc=services.find(x=>x.id===serviceId),packageSizes=serviceUsesVehicleSizePricing(svc)?realizedSelectedPackageSizes():[];
  if(packageSizes.some(x=>!["pm","g"].includes(x.size)))return show("rdmsg","Defina o porte P/M ou G de todos os veículos selecionados.","error");
  const assignment=realizedAssignment(),btn=$("rdsave");
  window.__realizedSaveInFlight=true;btn.disabled=true;btn.textContent="Registrando...";
  try{
    if(serviceUsesVehicleSizePricing(svc)){
      for(const item of packageSizes){
        const current=window.__realizedVehicles?.get(item.vehicle_id);
        if(current?.package_size===item.size)continue;
        const ur=await sb.from("vehicles").update({package_size:item.size,updated_by:currentUserId,updated_at:new Date().toISOString()}).eq("id",item.vehicle_id);
        if(ur.error)throw ur.error;
        if(current)current.package_size=item.size
      }
    }
    const r=await sb.rpc("register_completed_services",{
      p_client_id:clientId,p_vehicle_ids:vehicleIds,p_service_id:serviceId,
      p_date:date,p_local_time:time,p_team_id:assignment.team_id,p_collaborator_id:assignment.collaborator_id,
      p_notes:$("rdnotes").value.trim(),p_base_value:serviceUsesVehicleSizePricing(svc)?null:q.base,p_discount_type:q.type,
      p_discount_value:q.value,p_idempotency_key:window.__realizedIdempotencyKey||crypto.randomUUID()
    });
    if(r.error)throw r.error;
    const n=Number(r.data?.count||vehicleIds.length);
    window.__realizedIdempotencyKey="";
    $("rdd").close();$("date").value=date;agendaCalendarMonth=calendarMonthFromDate(date);
    agendaMonthCache.clear();operatorMonthCache.clear();waterCounterLoadedAt=0;
    await loadApps();
    show("msg",n+" serviço"+(n===1?" realizado registrado":"s realizados registrados")+" como concluído"+(n===1?".":"s.")+" Pagamento pendente criado no Financeiro.","ok")
  }catch(err){show("rdmsg",fail(err),"error")}
  finally{window.__realizedSaveInFlight=false;btn.disabled=false;btn.textContent="Registrar como realizado"}
}

async function fileToCompressedJpeg(file){
  if(!file)throw Error("Tire uma foto do veículo para concluir.");
  if(!String(file.type||"").startsWith("image/"))throw Error("Selecione uma imagem válida.");
  let img,cleanup=()=>{};
  try{
    if("createImageBitmap" in window){
      img=await createImageBitmap(file);
      cleanup=()=>img.close?.()
    }else{
      const url=URL.createObjectURL(file);
      img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error("Não foi possível ler a foto."));im.src=url});
      cleanup=()=>URL.revokeObjectURL(url)
    }
    const max=1600,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)),cv=document.createElement("canvas");
    cv.width=w;cv.height=h;const ctx=cv.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
    const blob=await new Promise((resolve,reject)=>cv.toBlob(b=>b?resolve(b):reject(Error("Não foi possível preparar a foto.")),"image/jpeg",0.84));
    cleanup();return blob
  }catch(e){cleanup();throw e}
}
