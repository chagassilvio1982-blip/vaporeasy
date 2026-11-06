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
  async function openBillingSelection(){
    if(typeof financeAllowed!=="function"||!financeAllowed())return;
    const k=financeMonthKeys(),modal=el("dialog",{style:"max-width:650px;width:95%;max-height:90vh;overflow:auto;padding:20px"});
    const title=el("h3",{},"Selecionar cobrança · "+k.month),message=el("p",{},"Selecione o cliente para conferir mensalidades e serviços concluídos.");
    const client=el("select",{style:"width:100%;padding:10px;margin:8px 0"}),rows=el("div"),total=el("strong",{},"Total selecionado: "+format(0));
    const close=el("button",{type:"button"},"Fechar");close.onclick=()=>modal.close();
    modal.append(title,message,client,rows,total,el("p",{},"Prévia para conferência. Nenhuma cobrança será emitida por esta tela."),close);
    document.body.append(modal);modal.addEventListener("close",()=>modal.remove());modal.showModal();
    const [cr,ar,pc,subs]=await Promise.all([
      sb.from("clients").select("id,name").order("name"),
      sb.from("appointments").select("id,client_id,vehicle_id,service_id,recurring_plan_id,starts_at,final_value").eq("status","completed").is("deleted_at",null).gte("starts_at",k.startIso).lt("starts_at",k.nextIso),
      sb.from("package_charges").select("id,client_id,vehicle_id,subscription_id,competence_month,amount,status").eq("competence_month",k.startDate).neq("status","cancelled"),
      sb.from("package_subscriptions").select("id,client_id,vehicle_id,service_id,recurring_plan_id,starts_on,superseded_at")
    ]);
    for(const response of [cr,ar,pc,subs])if(response.error)throw response.error;
    const ids=new Set([...(ar.data||[]).map(x=>x.client_id),...(pc.data||[]).map(x=>x.client_id)]);
    const clients=(cr.data||[]).filter(x=>ids.has(x.id));
    client.append(el("option",{value:""},"Escolha um cliente"));
    clients.forEach(c=>client.append(el("option",{value:c.id},c.name)));
    client.onchange=()=>{
      rows.replaceChildren();const id=client.value;let sum=0;const checks=[];
      function addLine(name,amount,enabled,description){
        const label=el("label",{style:"display:block;padding:10px;border-bottom:1px solid #ddd"});
        const input=el("input",{type:"checkbox"});input.disabled=!enabled;
        input.onchange=()=>{sum=checks.filter(x=>x.input.checked).reduce((n,x)=>n+x.amount,0);total.textContent="Total selecionado: "+format(sum)};
        label.append(input,document.createTextNode(" "+name+" · "+format(amount)+" — "+description));rows.append(label);checks.push({input,amount});
      }
      (pc.data||[]).filter(x=>x.client_id===id).forEach(c=>addLine("Mensalidade do plano",Number(c.amount||0),c.status==="pending",c.status==="paid"?"Já paga":"Pendente"));
      (ar.data||[]).filter(x=>x.client_id===id).forEach(a=>{
        const coverage=billingCoverage(a,subs.data||[],pc.data||[],k.month);
        addLine("Atendimento "+String(a.starts_at).slice(0,10),Number(a.final_value||0),false,coverage.kind==="included_in_plan"?"Incluído no plano":"Requer conferência individual antes de cobrar");
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
