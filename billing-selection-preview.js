"use strict";
/* V2 finance: read-only selection panel; never creates a charge or changes payment state. */
(function(){
  function el(tag,attrs={},text){
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs)){
      if(key==="className")node.className=value;
      else if(key==="type")node.type=value;
      else node.setAttribute(key,value);
    }
    if(text!==undefined)node.textContent=String(text);
    return node;
  }
  function format(value){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value)}
  function saoPauloDate(iso){
    if(!iso)return "";
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(iso));
    const part=type=>parts.find(p=>p.type===type)?.value||"";
    return part("year")+"-"+part("month")+"-"+part("day");
  }
  async function openBillingSelection(){
    if(typeof financeAllowed!=="function"||!financeAllowed())return;
    const k=financeMonthKeys(),modal=el("dialog",{style:"max-width:650px;width:95%;max-height:90vh;overflow:auto;padding:20px"});
    const title=el("h3",{},"Selecionar cobrança · "+k.month),message=el("p",{},"Selecione o cliente para conferir mensalidades e serviços concluídos.");
    const client=el("select",{style:"width:100%;padding:10px;margin:8px 0"}),rows=el("div"),total=el("strong",{},"Total selecionado: "+format(0));
    const exportButton=el("button",{type:"button"},"Gerar prévia para conferência");exportButton.disabled=true;
    const issueButton=el("button",{type:"button"},"Emitir cobrança selecionada (aguardando ativação segura)");issueButton.disabled=true;
    const selectedReceiptRendererReady=false; // Enable only after the dedicated billing-document migration and end-to-end verification.
    const historyButton=el("button",{type:"button"},"Consultar documento mensal");
    historyButton.onclick=async()=>{
      const clientId=client.value;
      if(!clientId){alert("Selecione um cliente.");return;}
      try{
        const result=await sb.from("monthly_billing_documents").select("id,snapshot,issued_at").eq("client_id",clientId).eq("competence_month",k.startDate).maybeSingle();
        if(result.error){
          if(result.error.code==="42P01"||result.error.code==="PGRST205"){
            alert("Histórico de documentos ainda não ativado neste ambiente. Nenhuma cobrança foi emitida por esta funcionalidade.");return;
          }
          throw result.error;
        }
        if(!result.data){alert("Nenhum documento mensal registrado para este cliente e mês.");return;}
        const snap=result.data.snapshot||{};
        if(snap.kind!=="selected_monthly_receipt"||Number(snap.schema_version)!==2){
          alert("Documento existente no histórico tradicional. Consulte a área de recibos.");return;
        }
        const chosenClient=(cr.data||[]).find(c=>c.id===clientId);
        const labels=new Map([
          ...(pc.data||[]).filter(x=>x.client_id===clientId).map(x=>["package_charge:"+x.id,"Mensalidade · "+vehicleLabel(x.vehicle_id)]),
          ...(ar.data||[]).filter(x=>x.client_id===clientId).map(x=>["appointment_extra:"+x.id,"Atendimento "+saoPauloDate(x.starts_at)+" · "+vehicleLabel(x.vehicle_id)])
        ]);
        const content=["VAPOREASY — DOCUMENTO MENSAL","Cliente: "+(chosenClient?.name||""),"Competência: "+k.month,"Emitido em: "+(result.data.issued_at||""),"Documento: "+result.data.id,"",...(snap.lines||[]).map(line=>(labels.get(line.kind+":"+line.id)||(line.kind==="package_charge"?"Mensalidade":"Atendimento avulso")+" · "+line.id)+" · "+format(Number(line.amount||0))),"","TOTAL: "+format(Number(snap.total||0)),"Documento de cobrança. Não comprova pagamento."].join("\n");
        const output=el("pre",{style:"white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:#f6f7f8;color:#111"},content);
        const view=el("dialog",{style:"width:95%;max-width:650px;max-height:85vh;overflow:auto"});
        const download=el("button",{type:"button"},"Salvar documento");
        download.onclick=()=>{
          const blob=new Blob([content],{type:"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob),link=el("a",{href:url,download:"vaporeasy-documento-"+k.month+".txt"});
          document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
        };
        const dismiss=el("button",{type:"button"},"Fechar");dismiss.onclick=()=>view.close();
        view.append(el("h3",{},"Documento mensal registrado"),output,download,dismiss);
        document.body.append(view);view.addEventListener("close",()=>view.remove());view.showModal();
      }catch(error){alert("Falha ao consultar documento: "+(error.message||String(error)));}
    };
    const close=el("button",{type:"button"},"Fechar");close.onclick=()=>modal.close();
    modal.append(title,message,client,rows,total,el("p",{},"Confira os itens antes de emitir. A emissão registra um documento mensal e não altera pagamentos."),exportButton,issueButton,historyButton,close);
    document.body.append(modal);modal.addEventListener("close",()=>modal.remove());modal.showModal();
    const [cr,ar,pc,subs,vr]=await Promise.all([
      sb.from("clients").select("id,name").order("name"),
      sb.from("appointments").select("id,client_id,vehicle_id,service_id,recurring_plan_id,starts_at,final_value").eq("status","completed").is("deleted_at",null).gte("starts_at",k.startIso).lt("starts_at",k.nextIso),
      sb.from("package_charges").select("id,client_id,vehicle_id,subscription_id,competence_month,amount,status").eq("competence_month",k.startDate).neq("status","cancelled"),
      sb.from("package_subscriptions").select("id,client_id,vehicle_id,service_id,recurring_plan_id,starts_on,superseded_at"),
      sb.from("vehicles").select("id,client_id,brand,model,plate")
    ]);
    for(const response of [cr,ar,pc,subs,vr])if(response.error)throw response.error;
    const appointmentIds=(ar.data||[]).map(x=>x.id);
    const payments=appointmentIds.length?await sb.from("appointment_payments").select("appointment_id,status,amount").in("appointment_id",appointmentIds):{data:[],error:null};
    if(payments.error)throw payments.error;
    const ids=new Set([...(ar.data||[]).map(x=>x.client_id),...(pc.data||[]).map(x=>x.client_id)]);
    const clients=(cr.data||[]).filter(x=>ids.has(x.id));
    const vehicleMap=new Map((vr.data||[]).map(v=>[v.id,[v.brand,v.model,v.plate].filter(Boolean).join(" • ")]));
    const vehicleLabel=id=>vehicleMap.get(id)||"Veículo não identificado";
    const paymentMap=new Map();
    for(const p of payments.data||[]){
      const previous=paymentMap.get(p.appointment_id);
      if(!previous||p.status==="paid")paymentMap.set(p.appointment_id,p);
    }
    client.append(el("option",{value:""},"Escolha um cliente"));
    clients.forEach(c=>client.append(el("option",{value:c.id},c.name)));
    client.onchange=()=>{
      rows.replaceChildren();const id=client.value;let sum=0;const checks=[];
      exportButton.disabled=true;issueButton.disabled=true;
      async function verifySelection(){
        const chosen=checks.filter(x=>x.input.checked).map(x=>x.line);
        if(!chosen.length)throw Error("Selecione pelo menos um item.");
        const packageIds=chosen.filter(x=>x.kind==="package_charge").map(x=>x.id);
        const appointmentIds=chosen.filter(x=>x.kind==="appointment_extra").map(x=>x.id);
        const [freshCharges,freshPayments,freshAppointments,existingDocument,freshSubscriptions]=await Promise.all([
          packageIds.length?sb.from("package_charges").select("id,client_id,competence_month,amount,status").in("id",packageIds):Promise.resolve({data:[],error:null}),
          appointmentIds.length?sb.from("appointment_payments").select("appointment_id,status").in("appointment_id",appointmentIds):Promise.resolve({data:[],error:null}),
          appointmentIds.length?sb.from("appointments").select("id,client_id,vehicle_id,service_id,starts_at,final_value,status,deleted_at,recurring_plan_id").in("id",appointmentIds):Promise.resolve({data:[],error:null}),
          sb.from("monthly_billing_documents").select("id").eq("client_id",id).eq("competence_month",k.startDate).limit(1),
          appointmentIds.length?sb.from("package_subscriptions").select("client_id,vehicle_id,service_id,starts_on,superseded_at").eq("client_id",id):Promise.resolve({data:[],error:null})
        ]);
        // The document table is absent until the isolated migration is approved.
        // Permit read-only previews while keeping issuance disabled.
        const missingDocumentTable=existingDocument.error&&(
          existingDocument.error.code==="42P01"||
          existingDocument.error.code==="PGRST205"
        );
        if(freshCharges.error||freshPayments.error||freshAppointments.error||(existingDocument.error&&!missingDocumentTable)||freshSubscriptions.error)throw freshCharges.error||freshPayments.error||freshAppointments.error||existingDocument.error||freshSubscriptions.error;
        if((existingDocument.data||[]).length)throw Error("Já existe cobrança mensal emitida para este cliente. Confira o documento antes de emitir outra.");
        for(const line of chosen){
          if(line.kind==="package_charge"){
            const latest=(freshCharges.data||[]).find(x=>x.id===line.id);
            if(!latest||latest.status!=="pending"||latest.client_id!==id||String(latest.competence_month).slice(0,7)!==k.month||Number(latest.amount)!==line.amount)throw Error("Mensalidade alterada. Atualize a conferência.");
          }else {
            const latest=(freshAppointments.data||[]).find(x=>x.id===line.id);
            if(!latest||latest.client_id!==id||latest.status!=="completed"||latest.deleted_at||saoPauloDate(latest.starts_at).slice(0,7)!==k.month||Number(latest.final_value)!==line.amount||latest.recurring_plan_id)throw Error("Atendimento alterado ou vinculado a plano. Atualize a conferência.");
            if((freshSubscriptions.data||[]).some(p=>p.client_id===id&&p.vehicle_id===latest.vehicle_id&&p.service_id===latest.service_id&&String(p.starts_on||"").slice(0,7)<=k.month&&(!p.superseded_at||String(p.superseded_at).slice(0,7)>=k.month)))throw Error("Possível vínculo com plano identificado. Atualize a conferência.");
            if((freshPayments.data||[]).some(x=>x.appointment_id===line.id&&x.status==="paid"))throw Error("Um atendimento já foi pago. Atualize a conferência.");
          }
        }
        const amount=validateBillingSelection(chosen,{client_id:id,competence:k.month});
        return {chosen,amount};
      }
      exportButton.onclick=async()=>{
        exportButton.disabled=true;
        try{
        const {chosen,amount}=await verifySelection();
        const selectedClient=clients.find(x=>x.id===id);
        const report=["VAPOREASY — PRÉVIA DE COBRANÇA (NÃO EMITIDA)","Cliente: "+(selectedClient?.name||""),"Competência: "+k.month,"",...chosen.map(x=>x.label+" | "+format(x.amount)),"","TOTAL: "+format(amount),"DOCUMENTO DE CONFERÊNCIA — NÃO É RECIBO OU COBRANÇA"];
        const blob=new Blob([report.join("\n")],{type:"text/plain;charset=utf-8"});
        const url=URL.createObjectURL(blob),link=el("a",{href:url,download:"vaporeasy-previa-"+k.month+".txt"});
        document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }catch(error){alert(error.message||String(error));}finally{exportButton.disabled=!checks.some(x=>x.input.checked);}
      };
      issueButton.onclick=async()=>{
        if(!selectedReceiptRendererReady){alert("Emissão indisponível: a estrutura de cobranças ainda não foi ativada e validada neste ambiente.");return;}
        issueButton.disabled=true;
        try{
          const {chosen,amount}=await verifySelection();
          const selectedClient=clients.find(x=>x.id===id);
          if(!window.confirm("Emitir cobrança mensal de "+(selectedClient?.name||"cliente")+" no valor de "+format(amount)+"? Esta operação registra um documento e não confirma pagamentos."))return;
          const payload=chosen.map(x=>({kind:x.kind,id:x.id,amount:x.amount}));
          const issued=await sb.rpc("issue_selected_monthly_receipt",{p_client_id:id,p_competence:k.startDate,p_lines:payload});
          if(issued.error)throw issued.error;
          alert("Cobrança registrada. Identificador: "+issued.data+". Confira o documento no histórico antes de enviá-lo.");
          modal.close();
        }catch(error){alert("Não foi possível emitir: "+(error.message||String(error)));}
        finally{issueButton.disabled=!selectedReceiptRendererReady||!checks.some(x=>x.input.checked);}
      };
      function addLine(name,amount,enabled,description,line){
        const label=el("label",{style:"display:block;padding:10px;border-bottom:1px solid #ddd"});
        const input=el("input",{type:"checkbox"});input.disabled=!enabled;
        input.onchange=()=>{sum=checks.filter(x=>x.input.checked).reduce((n,x)=>n+x.amount,0);total.textContent="Total selecionado: "+format(sum);exportButton.disabled=!checks.some(x=>x.input.checked);issueButton.disabled=!selectedReceiptRendererReady||exportButton.disabled};
        label.append(input,document.createTextNode(" "+name+" · "+format(amount)+" — "+description));rows.append(label);checks.push({input,amount,line});
      }
      (pc.data||[]).filter(x=>x.client_id===id).forEach(c=>addLine("Plano · "+vehicleLabel(c.vehicle_id),Number(c.amount||0),c.status==="pending",c.status==="paid"?"Já paga":"Pendente",{kind:"package_charge",id:c.id,amount:Number(c.amount||0),status:c.status,client_id:id,competence_month:c.competence_month,label:"Mensalidade do plano · "+vehicleLabel(c.vehicle_id)}));
      (ar.data||[]).filter(x=>x.client_id===id).forEach(a=>{
        const coverage=billingCoverage(a,subs.data||[],pc.data||[],k.month);
        const payment=paymentMap.get(a.id);
        const linkedToPlan=Boolean(a.recurring_plan_id)||(subs.data||[]).some(p=>p.client_id===a.client_id&&p.vehicle_id===a.vehicle_id&&p.service_id===a.service_id);
        const isPaid=payment?.status==="paid";
        const isAvulso=!linkedToPlan&&coverage.kind==="review_required"&&!isPaid&&Number(a.final_value)>0;
        addLine("Atendimento "+saoPauloDate(a.starts_at)+" · "+vehicleLabel(a.vehicle_id),Number(a.final_value??0),isAvulso,isPaid?"Já pago":coverage.kind==="included_in_plan"?"Incluído no plano":isAvulso?"Avulso disponível":"Exige revisão da cobertura",{kind:"appointment_extra",id:a.id,amount:Number(a.final_value??0),status:payment?.status||"pending",coverage_verified:isAvulso,covered_by_plan:coverage.kind==="included_in_plan",client_id:id,competence_month:k.startDate,label:"Atendimento "+saoPauloDate(a.starts_at)+" · "+vehicleLabel(a.vehicle_id)});
      });
      total.textContent="Total selecionado: "+format(0);
    };
  }
  window.openBillingSelection=openBillingSelection;
  window.installBillingSelection=function(){
    const month=document.getElementById("fmonth");if(!month||document.getElementById("billing-selection-open"))return;
    const btn=el("button",{type:"button",id:"billing-selection-open"},"Selecionar itens para cobrança");
    btn.onclick=()=>openBillingSelection().catch(e=>{if(typeof show==="function")show("msg",e.message||String(e),"error");});
    month.closest("label")?.after(btn);
  };
})();
