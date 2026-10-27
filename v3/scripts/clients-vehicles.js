async function loadClients(){
  const r=await sb.from("clients").select("*").is("archived_at",null).order("name");
  if(r.error)return show("msg",fail(r.error),"error");
  clients=r.data||[];
  if(selectedClientId&&!clients.some(c=>c.id===selectedClientId))selectedClientId="";
  renderClients()
}
function bindSelectedClientActions(scope){
  scope.querySelectorAll("[data-e]").forEach(b=>b.onclick=()=>openClient(clients.find(x=>x.id===b.dataset.e)));
  scope.querySelectorAll("[data-n]").forEach(b=>b.onclick=()=>openVehicle(b.dataset.n));
  scope.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>showVehicles(b.dataset.v));
  scope.querySelectorAll("[data-cx]").forEach(b=>b.onclick=()=>archiveClient(b.dataset.cx));
  const clear=scope.querySelector("[data-client-clear]");
  if(clear)clear.onclick=()=>{selectedClientId="";$("q").value="";$("q").focus();renderClients()}
}
function renderSelectedClient(c){
  const canDelete=["owner","admin"].includes(currentRole),box=$("clients");
  box.innerHTML='<div class="item selected-client-card">'+
    '<div class="selected-client-head"><div><div class="selected-client-kicker">Cliente selecionado</div><h3>'+esc(c.name)+'</h3><div class="meta">'+esc(c.phone||c.whatsapp||"Sem telefone")+'</div></div>'+
    '<button type="button" class="ghost selected-client-clear" data-client-clear>Trocar</button></div>'+
    '<div class="client-action-grid selected-client-actions">'+
      '<button class="primary" data-v="'+c.id+'">Ver veículos</button>'+
      '<button class="ghost" data-n="'+c.id+'">+ Veículo</button>'+
      '<button class="ghost" data-e="'+c.id+'">Editar cliente</button>'+
      (canDelete?'<button class="danger subtle-danger" data-cx="'+c.id+'">Excluir cliente</button>':"")+
    '</div>'+
    '<div id="v-'+c.id+'" class="hidden vehicle-list"></div>'+
  '</div>';
  bindSelectedClientActions(box)
}
function renderClients(){
  const box=$("clients"),input=$("q"),raw=input.value||"",q=normalizeClientSearch(raw);
  if(selectedClientId){
    const c=clients.find(x=>x.id===selectedClientId);
    if(c)return renderSelectedClient(c);
    selectedClientId=""
  }
  if(!q){
    box.innerHTML='<div class="client-search-idle"><div class="client-search-icon">⌕</div><b>Procure um cliente</b><span>Comece a digitar o nome. As sugestões aparecem aqui.</span></div>';
    return
  }
  const ranked=clients.map(c=>{
    const name=normalizeClientSearch(c.name),words=name.split(/\s+/);
    let rank=9;
    if(name===q)rank=0;
    else if(name.startsWith(q))rank=1;
    else if(words.some(w=>w.startsWith(q)))rank=2;
    else if(name.includes(q))rank=3;
    return {c,rank}
  }).filter(x=>x.rank<9).sort((a,b)=>a.rank-b.rank||a.c.name.localeCompare(b.c.name,"pt-BR")).slice(0,8);

  if(!ranked.length){
    box.innerHTML='<div class="empty">Nenhum cliente encontrado com esse nome.</div>';
    return
  }
  box.innerHTML='<div class="client-suggestions">'+ranked.map(({c})=>
    '<button type="button" class="client-suggestion" data-client-pick="'+c.id+'">'+
      '<span class="client-suggestion-main"><b>'+esc(c.name)+'</b><small>'+esc(c.phone||c.whatsapp||"Sem telefone")+'</small></span>'+
      '<span class="client-suggestion-arrow">›</span>'+
    '</button>'
  ).join("")+'</div>';
  box.querySelectorAll("[data-client-pick]").forEach(b=>b.onclick=()=>{
    const c=clients.find(x=>x.id===b.dataset.clientPick);
    if(!c)return;
    selectedClientId=c.id;
    input.value=c.name;
    renderClients()
  })
}
async function hasFutureActiveAppointment(filters){
  let q=sb.from("appointments").select("id,starts_at,status",{count:"exact"}).gte("starts_at",new Date().toISOString()).is("deleted_at",null).not("status","in","(completed,cancelled,no_show)");
  if(filters.client_id)q=q.eq("client_id",filters.client_id);
  if(filters.vehicle_id)q=q.eq("vehicle_id",filters.vehicle_id);
  const r=await q.limit(1);
  if(r.error)throw r.error;
  return (r.data||[]).length>0
}
async function archiveClient(id){
  if(!["owner","admin"].includes(currentRole))return show("msg","Seu nível de acesso não permite excluir clientes.","error");
  const client=clients.find(x=>x.id===id);if(!client)return;
  try{
    if(await hasFutureActiveAppointment({client_id:id}))return show("msg","Este cliente possui agendamento futuro ativo. Cancele ou remaneje o agendamento antes de excluir o cadastro.","error");
    if(!confirm('Excluir o cliente "'+client.name+'"?\n\nEle sairá dos cadastros e novos agendamentos. Veículos vinculados também serão arquivados. O histórico de atendimentos, fotos e recibos será preservado.'))return;
    const r=await sb.rpc("archive_client_safe",{p_client_id:id});if(r.error)throw r.error;
    vehicles.delete(id);show("msg","Cliente excluído do cadastro. Histórico preservado.","ok");await loadClients()
  }catch(e){show("msg",fail(e),"error")}
}
async function archiveVehicle(cid,id){
  if(!["owner","admin"].includes(currentRole))return show("msg","Seu nível de acesso não permite excluir veículos.","error");
  const list=vehicles.get(cid)||[],v=list.find(x=>x.id===id);
  try{
    if(await hasFutureActiveAppointment({vehicle_id:id}))return show("msg","Este veículo possui agendamento futuro ativo. Cancele ou remaneje o agendamento antes de excluir o veículo.","error");
    if(!confirm('Excluir '+(v?(v.brand+" "+v.model+(v.plate?" • "+v.plate:"")):"este veículo")+'?\n\nO veículo sairá do cadastro e de novos agendamentos. O histórico de serviços, fotos e recibos será preservado.'))return;
    const r=await sb.rpc("archive_vehicle_safe",{p_vehicle_id:id});if(r.error)throw r.error;
    vehicles.set(cid,list.filter(x=>x.id!==id));show("msg","Veículo excluído do cadastro. Histórico preservado e recorrência encerrada.","ok");
    const box=$("v-"+cid);if(box){box.classList.add("hidden");await showVehicles(cid)}
  }catch(e){show("msg",fail(e),"error")}
}
function openClient(c){$("cf").reset();$("cid").value=c?.id||"";$("cn").value=c?.name||"";$("cp").value=c?.phone||"";$("cw").value=c?.whatsapp||"";$("ca").value=c?.address||"";$("co").value=c?.notes||"";$("cc").value="";$("cd").showModal()}
async function saveClient(e){e.preventDefault();try{let condo=null, name=$("cc").value.trim();if(name){let f=await sb.from("condominiums").select("id").ilike("name",name).limit(1).maybeSingle();if(f.error)throw f.error;if(f.data)condo=f.data.id;else{let n=await sb.from("condominiums").insert({name}).select("id").single();if(n.error)throw n.error;condo=n.data.id}}const p={name:$("cn").value.trim(),phone:$("cp").value.trim(),whatsapp:$("cw").value.trim(),address:$("ca").value.trim(),notes:$("co").value.trim(),condominium_id:condo};let r=$("cid").value?await sb.from("clients").update(p).eq("id",$("cid").value):await sb.from("clients").insert(p);if(r.error)throw r.error;$("cd").close();show("msg","Cliente salvo.","ok");await loadClients()}catch(e){show("msg",fail(e),"error")}}
async function showVehicles(cid){const box=$("v-"+cid),canDelete=["owner","admin"].includes(currentRole);box.classList.toggle("hidden");if(box.classList.contains("hidden"))return;let r=await sb.from("vehicles").select("*").eq("client_id",cid).is("archived_at",null).order("brand");if(r.error){box.innerHTML='<div class="notice error">'+esc(fail(r.error))+'</div>';return}vehicles.set(cid,r.data||[]);box.innerHTML=(r.data||[]).length?(r.data||[]).map(v=>'<details class="vehicle-card"><summary><span><b>'+esc(v.brand+" "+v.model)+'</b><small>'+esc(v.plate||"Sem placa")+'</small></span><span class="vehicle-open-label">Opções</span></summary><div class="vehicle-card-actions"><button class="primary" data-rg="'+v.id+'" data-c="'+cid+'">RG / Histórico</button><button class="ghost" data-ve="'+v.id+'" data-c="'+cid+'">Editar</button>'+(canDelete?'<button class="danger subtle-danger" data-vx="'+v.id+'" data-c="'+cid+'">Excluir veículo</button>':"")+'</div></details>').join(""):'<div class="empty">Nenhum veículo.</div>';box.querySelectorAll("[data-rg]").forEach(b=>b.onclick=()=>openVehicleRG(cid,(r.data||[]).find(x=>x.id===b.dataset.rg)));box.querySelectorAll("[data-ve]").forEach(b=>b.onclick=()=>openVehicle(cid,(r.data||[]).find(x=>x.id===b.dataset.ve)));box.querySelectorAll("[data-vx]").forEach(b=>b.onclick=()=>archiveVehicle(cid,b.dataset.vx))}
let currentRGPhotos=[],currentRGIssues=[],currentRGPhotoIssueId="",currentRGQuotes=new Map();
function priorityLabel(v){return v==="immediate"?"Atenção imediata":v==="preventive"?"Preventivo":"Recomendado"}
function priorityPill(v){return '<span class="pill">'+esc(priorityLabel(v))+'</span>'}
function buildRGDiagnostics(){return{bodywork:$("rgbody").value.trim(),glass:$("rgglass").value.trim(),interior:$("rginterior").value.trim(),protection:$("rgprotection").value.trim(),issues:currentRGIssues}}
async function saveRGPhotoProfile(){
  const vid=$("rgvid").value;
  const r=await sb.from("vehicle_profiles").upsert({vehicle_id:vid,diagnostics:buildRGDiagnostics(),photos:currentRGPhotos,notes:$("rgnotes").value.trim(),updated_by:currentUserId,updated_at:new Date().toISOString()},{onConflict:"vehicle_id"});
  if(r.error)throw r.error
}
async function signedRGPhoto(path){
  if(!path)return "";
  const s=await sb.storage.from("vehicle-rg-photos").createSignedUrl(path,900);
  return !s.error&&s.data?.signedUrl?s.data.signedUrl:""
}
async function renderRGPhotos(){
  const box=$("rgphotos"),general=currentRGPhotos.map((p,i)=>({p,i})).filter(x=>!x.p.issue_id);
  if(!general.length){box.innerHTML='<div class="empty">Nenhuma foto geral cadastrada.</div>';return}
  const urls=await Promise.all(general.map(x=>signedRGPhoto(x.p.path)));
  box.innerHTML=general.map((x,j)=>{
    const p=x.p,when=p.captured_at?spDateTime(p.captured_at):null,url=urls[j],who=p.uploaded_by_name||"Equipe Vaporeasy";
    return '<div class="item" style="margin-top:8px">'+(url?'<img src="'+esc(url)+'" alt="Foto geral do RG" style="width:100%;max-height:300px;object-fit:cover;border-radius:12px;border:1px solid #31576a;display:block">':'<div class="notice">Foto indisponível para visualização.</div>')+'<div class="meta" style="margin-top:7px">'+esc(who)+(when?' • '+esc(when.date+" • "+when.time):"")+'</div>'+(["owner","admin"].includes(currentRole)?'<div class="actions" style="margin-top:7px"><button type="button" class="danger" data-rgphoto-delete="'+x.i+'">Excluir foto</button></div>':"")+'</div>'
  }).join("");
  box.querySelectorAll("[data-rgphoto-delete]").forEach(b=>b.onclick=()=>deleteRGPhoto(Number(b.dataset.rgphotoDelete)))
}
async function renderRGIssues(){
  const box=$("rgissues");
  const canQuote=["owner","admin"].includes(currentRole)&&currentRGIssues.some(i=>i.include_in_report!==false&&currentRGQuotes.has(String(i.id))&&currentRGQuotes.get(String(i.id))!==null&&Number.isFinite(Number(currentRGQuotes.get(String(i.id)))));
  $("rgquote").classList.toggle("hidden",!canQuote);
  $("rgquote").disabled=!canQuote;
  if(!currentRGIssues.length){box.innerHTML='<div class="empty">Nenhuma necessidade registrada.</div>';$("rgreport").disabled=true;return}
  $("rgreport").disabled=!currentRGIssues.some(i=>i.include_in_report!==false);
  const issuePhotoRows=currentRGPhotos.map((p,i)=>({p,i})).filter(x=>x.p.issue_id);
  const urlMap=new Map();
  await Promise.all(issuePhotoRows.map(async x=>{const u=await signedRGPhoto(x.p.path);if(u)urlMap.set(x.i,u)}));
  box.innerHTML=currentRGIssues.map(issue=>{
    const photos=issuePhotoRows.filter(x=>x.p.issue_id===issue.id),service=services.find(s=>s.id===issue.service_id);
    const operator=currentRole==="operator";const photoHtml=photos.length?'<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px">'+photos.map(x=>{const p=x.p,u=urlMap.get(x.i),when=p.captured_at?spDateTime(p.captured_at):null;return '<div style="border:1px solid #31576a;border-radius:12px;padding:7px">'+(u?'<img src="'+esc(u)+'" style="width:100%;height:120px;object-fit:cover;border-radius:9px;display:block" alt="Foto da necessidade">':'<div class="empty">Foto indisponível</div>')+(operator?'':'<label style="display:flex;grid-template-columns:auto 1fr;align-items:center;gap:6px;margin-top:7px;font-size:12px"><input type="checkbox" data-rgphoto-report="'+x.i+'" '+(p.include_in_report!==false?'checked':'')+' style="width:18px;min-height:18px">Incluir no relatório</label>')+(when?'<div class="meta">'+esc(when.date+" • "+when.time)+'</div>':'')+(["owner","admin"].includes(currentRole)?'<button type="button" class="danger" data-rgphoto-delete="'+x.i+'" style="width:100%;margin-top:6px">Excluir</button>':"")+'</div>'}).join("")+'</div>':'<div class="meta" style="margin-top:8px">Nenhuma foto vinculada a esta necessidade.</div>';
    return '<div class="item" style="margin-top:9px"><div class="actions" style="align-items:flex-start"><div style="flex:3"><div style="font-weight:900">'+esc(issue.category)+' — '+esc(issue.area)+'</div><div style="margin-top:5px">'+priorityPill(issue.priority)+'</div></div>'+(operator?'':'<label style="display:flex;grid-template-columns:auto 1fr;align-items:center;gap:6px;font-size:12px;flex:2"><input type="checkbox" data-issue-report="'+esc(issue.id)+'" '+(issue.include_in_report!==false?'checked':'')+' style="width:18px;min-height:18px">No relatório</label>')+'</div><div class="meta" style="margin-top:8px"><b>Identificado:</b> '+esc(issue.description||"—")+'</div>'+(issue.recommendation?'<div class="meta" style="margin-top:6px"><b>Recomendação:</b> '+esc(issue.recommendation)+'</div>':'')+(!operator&&(service||currentRGQuotes.has(String(issue.id)))?'<div class="meta" style="margin-top:6px">'+(service?'<b>Serviço sugerido:</b> '+esc(service.name):'')+(currentRGQuotes.has(String(issue.id))&&currentRGQuotes.get(String(issue.id))!==null?(service?' • ':'')+'<b>Orçamento:</b> '+money(currentRGQuotes.get(String(issue.id))):'')+'</div>':'')+photoHtml+'<div class="actions" style="margin-top:9px"><button type="button" class="primary" data-issue-photo="'+esc(issue.id)+'">📷 Foto desta necessidade</button><button type="button" class="ghost" data-issue-edit="'+esc(issue.id)+'">Editar</button>'+(["owner","admin"].includes(currentRole)?'<button type="button" class="danger" data-issue-delete="'+esc(issue.id)+'">Excluir</button>':"")+'</div></div>'
  }).join("");
  box.querySelectorAll("[data-issue-edit]").forEach(b=>b.onclick=()=>openRGIssue(b.dataset.issueEdit));
  box.querySelectorAll("[data-issue-photo]").forEach(b=>b.onclick=()=>captureRGIssuePhoto(b.dataset.issuePhoto));
  box.querySelectorAll("[data-issue-delete]").forEach(b=>b.onclick=()=>deleteRGIssue(b.dataset.issueDelete));
  box.querySelectorAll("[data-issue-report]").forEach(b=>b.onchange=()=>toggleRGIssueReport(b.dataset.issueReport,b.checked));
  box.querySelectorAll("[data-rgphoto-report]").forEach(b=>b.onchange=()=>toggleRGPhotoReport(Number(b.dataset.rgphotoReport),b.checked));
  box.querySelectorAll("[data-rgphoto-delete]").forEach(b=>b.onclick=()=>deleteRGPhoto(Number(b.dataset.rgphotoDelete)))
}
async function addRGPhoto(){
  const file=$("rgphoto").files?.[0];if(!file)return;
  const b=$("rgphotoadd");b.disabled=true;b.textContent="Salvando foto...";
  try{
    const vid=$("rgvid").value;if(!vid)throw Error("Veículo não identificado.");
    const blob=await fileToCompressedJpeg(file),path=vid+"/general/"+Date.now()+"-"+crypto.randomUUID()+".jpg";
    const up=await sb.storage.from("vehicle-rg-photos").upload(path,blob,{contentType:"image/jpeg",cacheControl:"3600",upsert:false});if(up.error)throw up.error;
    currentRGPhotos.push({path,issue_id:null,include_in_report:false,captured_at:new Date().toISOString(),uploaded_by:currentUserId,uploaded_by_name:$("pname").textContent||"Equipe Vaporeasy"});
    try{await saveRGPhotoProfile()}catch(e){await sb.storage.from("vehicle-rg-photos").remove([path]);currentRGPhotos=currentRGPhotos.filter(x=>x.path!==path);throw e}
    $("rgphoto").value="";await renderRGPhotos();show("rgmsg","Foto geral adicionada ao RG.","ok")
  }catch(e){show("rgmsg",fail(e),"error")}
  finally{b.disabled=false;b.textContent="📷 Tirar foto geral do veículo"}
}
function openRGIssue(id=""){
  const operator=currentRole==="operator";
  $("rgif").reset();show("rgimsg","");$("rgissueid").value=id;$("rgissuetitle").textContent=id?"Editar necessidade":"Registrar necessidade";
  setRGOperatorMode(operator);
  $("rgiservice").innerHTML=operator?'<option value="">Sem serviço definido</option>':'<option value="">Sem serviço definido</option>'+services.filter(s=>s.active!==false).map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join("");
  $("rgiservice").onchange=()=>{if(operator||$("rgibudget").value!=="")return;const item=services.find(s=>s.id===$("rgiservice").value);if(item&&Number.isFinite(Number(item.price)))$("rgibudget").value=Number(item.price).toFixed(2)};
  if(id){
    const i=currentRGIssues.find(x=>x.id===id);if(!i)return;
    $("rgicategory").value=i.category||"";
    $("rgiarea").value=i.area||"";
    $("rgidesc").value=i.description||"";
    $("rgipriority").value=i.priority||"recommended";
    $("rgirecommendation").value=i.recommendation||"";
    $("rgiservice").value=operator?"":(i.service_id||"");
    $("rgibudget").value=operator?"":(currentRGQuotes.get(String(i.id))??"");
    $("rgiinclude").checked=i.include_in_report!==false;
    $("rgishowvalue").checked=!!i.show_value
  }else{
    $("rgibudget").value="";$("rgiinclude").checked=true;$("rgishowvalue").checked=false;$("rgipriority").value="recommended"
  }
  $("rgid").showModal()
}
async function saveRGIssue(e){
  e.preventDefault();const id=$("rgissueid").value||crypto.randomUUID(),existing=currentRGIssues.find(x=>x.id===id),operator=currentRole==="operator",serviceId=operator?(existing?.service_id||null):($("rgiservice").value||null);
  const rawBudget=operator?"":$("rgibudget").value.trim(),amount=rawBudget===""?null:Number(rawBudget);
  if(!operator&&rawBudget!==""&&(!Number.isFinite(amount)||amount<0||amount>1000000))return show("rgimsg","Informe um orçamento válido, de R$ 0 a R$ 1.000.000.","error");
  if(!operator&&$("rgishowvalue").checked&&amount===null&&!(existing?.show_value&&!currentRGQuotes.has(String(id))))return show("rgimsg","Informe o valor do orçamento antes de incluí-lo no relatório.","error");
  const issue={id,category:$("rgicategory").value,area:$("rgiarea").value.trim(),description:$("rgidesc").value.trim(),priority:$("rgipriority").value,recommendation:$("rgirecommendation").value.trim(),service_id:serviceId,include_in_report:operator?(existing?.include_in_report!==false):$("rgiinclude").checked,show_value:operator?!!existing?.show_value:$("rgishowvalue").checked,created_at:existing?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};
  if(!issue.category||!issue.area||!issue.description)return show("rgimsg","Preencha categoria, local e descrição.","error");
  const prev=currentRGIssues.map(x=>({...x}));
  if(existing)currentRGIssues=currentRGIssues.map(x=>x.id===id?issue:x);else currentRGIssues.push(issue);
  let rgSaved=false;
  try{
    await saveRGPhotoProfile();rgSaved=true;
    if(!operator&&(rawBudget!==""||currentRGQuotes.has(String(id)))){
      const q=await sb.from("vehicle_service_quotes").upsert({vehicle_id:$("rgvid").value,issue_id:String(id),amount,updated_at:new Date().toISOString()},{onConflict:"vehicle_id,issue_id"});
      if(q.error)throw q.error;
      currentRGQuotes.set(String(id),amount);
    }
    $("rgid").close();await renderRGIssues();show("rgmsg","Necessidade e orçamento salvos no RG.","ok")
  }catch(err){if(!rgSaved)currentRGIssues=prev;else $("rgissueid").value=id;show("rgimsg",(rgSaved?"Necessidade salva, mas orçamento não confirmado. Tente salvar novamente: ":"")+fail(err),"error")}
}
function captureRGIssuePhoto(issueId){currentRGPhotoIssueId=issueId;$("rgissuephotofile").value="";$("rgissuephotofile").click()}
async function addRGIssuePhoto(){
  const file=$("rgissuephotofile").files?.[0],issueId=currentRGPhotoIssueId;if(!file||!issueId)return;
  try{
    const vid=$("rgvid").value,blob=await fileToCompressedJpeg(file),path=vid+"/issues/"+issueId+"/"+Date.now()+"-"+crypto.randomUUID()+".jpg";
    const up=await sb.storage.from("vehicle-rg-photos").upload(path,blob,{contentType:"image/jpeg",cacheControl:"3600",upsert:false});if(up.error)throw up.error;
    currentRGPhotos.push({path,issue_id:issueId,include_in_report:true,captured_at:new Date().toISOString(),uploaded_by:currentUserId,uploaded_by_name:$("pname").textContent||"Equipe Vaporeasy"});
    try{await saveRGPhotoProfile()}catch(e){await sb.storage.from("vehicle-rg-photos").remove([path]);currentRGPhotos=currentRGPhotos.filter(x=>x.path!==path);throw e}
    await renderRGIssues();show("rgmsg","Foto vinculada à necessidade.","ok")
  }catch(e){show("rgmsg",fail(e),"error")}
  finally{currentRGPhotoIssueId="";$("rgissuephotofile").value=""}
}
async function toggleRGIssueReport(id,checked){const x=currentRGIssues.find(i=>i.id===id);if(!x)return;x.include_in_report=checked;x.updated_at=new Date().toISOString();try{await saveRGPhotoProfile();await renderRGIssues()}catch(e){x.include_in_report=!checked;show("rgmsg",fail(e),"error")}}
async function toggleRGPhotoReport(index,checked){const p=currentRGPhotos[index];if(!p)return;p.include_in_report=checked;try{await saveRGPhotoProfile()}catch(e){p.include_in_report=!checked;show("rgmsg",fail(e),"error")}}
async function deleteRGIssue(id){
  if(!["owner","admin"].includes(currentRole))return;if(!confirm("Excluir esta necessidade e as fotos vinculadas a ela?"))return;
  const photos=currentRGPhotos.filter(p=>p.issue_id===id),prevIssues=currentRGIssues,prevPhotos=currentRGPhotos;
  try{
    if(photos.length){const rm=await sb.storage.from("vehicle-rg-photos").remove(photos.map(p=>p.path));if(rm.error)throw rm.error}
    currentRGIssues=currentRGIssues.filter(x=>x.id!==id);currentRGPhotos=currentRGPhotos.filter(p=>p.issue_id!==id);await saveRGPhotoProfile();await Promise.all([renderRGIssues(),renderRGPhotos()]);show("rgmsg","Necessidade excluída.","ok")
  }catch(e){currentRGIssues=prevIssues;currentRGPhotos=prevPhotos;show("rgmsg",fail(e),"error")}
}
async function deleteRGPhoto(index){
  if(!["owner","admin"].includes(currentRole))return;
  const p=currentRGPhotos[index];if(!p)return;if(!confirm("Excluir esta foto do RG?"))return;
  try{const rm=await sb.storage.from("vehicle-rg-photos").remove([p.path]);if(rm.error)throw rm.error;currentRGPhotos.splice(index,1);await saveRGPhotoProfile();await Promise.all([renderRGPhotos(),renderRGIssues()]);show("rgmsg","Foto excluída do RG.","ok")}catch(e){show("rgmsg",fail(e),"error")}
}
async function rgPhotoDataUrl(path){
  const d=await sb.storage.from("vehicle-rg-photos").download(path);if(d.error||!d.data)return null;
  return await new Promise(resolve=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=()=>resolve(null);fr.readAsDataURL(d.data)})
}
async function generateVehicleNeedsReport(kind="report"){
  try{
    const isQuote=kind==="quote";
    if(isQuote&&!["owner","admin"].includes(currentRole))throw Error("Acesso ao orçamento restrito ao administrador.");
    const selected=currentRGIssues.filter(i=>i.include_in_report!==false&&(!isQuote||(currentRGQuotes.has(String(i.id))&&currentRGQuotes.get(String(i.id))!==null&&Number.isFinite(Number(currentRGQuotes.get(String(i.id)))))));
    if(!selected.length)return show("rgmsg",isQuote?"Não há necessidades selecionadas com valor orçado.":"Marque pelo menos uma necessidade para incluir no relatório.","error");
    const totalCents=isQuote?selected.reduce((sum,i)=>sum+Math.round(Number(currentRGQuotes.get(String(i.id)))*100),0):0;
    const vehicle=findVehicleLocal($("rgvid").value),client=clients.find(x=>x.id===$("rgcid").value);
    if(!vehicle)throw Error("Veículo não encontrado.");
    const {jsPDF}=window.jspdf||{};if(!jsPDF)throw Error("Gerador de PDF indisponível.");
    const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"}),margin=18,maxW=174;let y=18;
    const addPageIf=(need)=>{if(y+need>280){doc.addPage();y=18}};
    // O mesmo logotipo oficial exibido no app, sem substituição por texto.
    try{await brandLogoImg.decode()}catch{throw Error("O logotipo da Vaporeasy não carregou. Reabra o orçamento e tente novamente.")}
    if(!brandLogoImg.naturalWidth||!brandLogoImg.naturalHeight)throw Error("Logotipo da Vaporeasy indisponível para o orçamento.");
    const logoWidth=46,logoHeight=logoWidth*brandLogoImg.naturalHeight/brandLogoImg.naturalWidth;
    const logoCanvas=document.createElement("canvas");
    logoCanvas.width=1028;logoCanvas.height=Math.round(logoCanvas.width*brandLogoImg.naturalHeight/brandLogoImg.naturalWidth);
    const logoCtx=logoCanvas.getContext("2d");
    if(!logoCtx)throw Error("Não foi possível preparar o logotipo da Vaporeasy.");
    logoCtx.fillStyle="#ffffff";logoCtx.fillRect(0,0,logoCanvas.width,logoCanvas.height);
    logoCtx.drawImage(brandLogoImg,0,0,logoCanvas.width,logoCanvas.height);
    // Cabeçalho em duas colunas: marca discreta à esquerda; documento e emitente à direita.
    const headerY=y,headerRight=192;
    doc.addImage(logoCanvas.toDataURL("image/png"),"PNG",margin,headerY,logoWidth,logoHeight);
    doc.setFont("helvetica","bold");doc.setTextColor(20,55,72);doc.setFontSize(isQuote?13:11);
    doc.text(isQuote?"Orçamento de serviços":"Relatório de necessidades do veículo",headerRight,headerY+6,{align:"right"});
    if(isQuote){
      doc.setFont("helvetica","normal");doc.setTextColor(75,93,103);doc.setFontSize(9);
      doc.text("CNPJ: 31.120.467/0001-07",headerRight,headerY+13,{align:"right"});
    }
    y=headerY+Math.max(logoHeight,18)+5;
    doc.setDrawColor(180);doc.line(margin,y,headerRight,y);y+=10;
    doc.setFontSize(10);doc.setTextColor(40);doc.setFont("helvetica","normal");
    const header=[["Cliente",client?.name||"Cliente"],["Veículo",vehicle.brand+" "+vehicle.model+(vehicle.plate?" • "+vehicle.plate:"")],[(isQuote?"Data do orçamento":"Data da avaliação"),new Intl.DateTimeFormat("pt-BR",{dateStyle:"short"}).format(new Date())]];
    for(const [k,v] of header){doc.setFont("helvetica","bold");doc.text(k+":",margin,y);doc.setFont("helvetica","normal");doc.text(String(v),55,y);y+=7}
    y+=5;
    for(let n=0;n<selected.length;n++){
      const issue=selected[n],service=services.find(s=>s.id===issue.service_id),photos=currentRGPhotos.filter(p=>p.issue_id===issue.id&&p.include_in_report!==false);
      addPageIf(55);doc.setFillColor(244,248,250);doc.roundedRect(margin,y,maxW,12,2,2,"F");doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(20,55,72);doc.text((n+1)+". "+issue.category+" — "+issue.area,margin+4,y+7.5);y+=17;
      doc.setFontSize(9.5);doc.setTextColor(35);doc.setFont("helvetica","bold");doc.text("Prioridade:",margin,y);doc.setFont("helvetica","normal");doc.text(priorityLabel(issue.priority),40,y);y+=7;
      const writeField=(label,value)=>{if(!value)return;doc.setFont("helvetica","bold");doc.text(label,margin,y);doc.setFont("helvetica","normal");const lines=doc.splitTextToSize(value,150);doc.text(lines,52,y);y+=Math.max(7,lines.length*5+2)};
      writeField("Identificado:",issue.description);
      writeField("Recomendação:",issue.recommendation||"Avaliação e acompanhamento conforme necessidade.");
      if(service)writeField("Serviço sugerido:",service.name);
      if(!isQuote&&issue.show_value&&currentRGQuotes.has(String(issue.id))&&currentRGQuotes.get(String(issue.id))!==null)writeField("Valor orçado:",money(currentRGQuotes.get(String(issue.id))))
      if(photos.length){
        y+=2;doc.setFont("helvetica","bold");doc.text("Fotos selecionadas:",margin,y);y+=5;
        for(let p=0;p<photos.length;p++){
          const data=await rgPhotoDataUrl(photos[p].path);if(!data)continue;
          addPageIf(58);const col=p%2,x=margin+col*88;if(col===0&&p>0)y+=58;
          try{doc.addImage(data,"JPEG",x,y,82,52)}catch{}
          if(col===1)y+=58
        }
        if(photos.length%2===1)y+=58
      }
      y+=6;doc.setDrawColor(220);doc.line(margin,y,192,y);y+=8
    }
    if(isQuote){
      addPageIf(37);y+=4;
      doc.setFillColor(233,246,251);doc.roundedRect(margin,y,maxW,22,2.5,2.5,"F");
      doc.setFont("helvetica","bold");doc.setTextColor(20,55,72);doc.setFontSize(10);doc.text("VALOR TOTAL ORÇADO",margin+5,y+7);
      doc.setFontSize(17);doc.text(money(totalCents/100),margin+5,y+17);
      y+=31;
    }
    addPageIf(28);doc.setFontSize(9);doc.setTextColor(90);doc.setFont("helvetica","normal");const foot=doc.splitTextToSize(isQuote?"Orçamento de serviços propostos. A execução e eventuais alterações de escopo ou preço dependem de confirmação prévia. Este documento não constitui cobrança nem comprovante de pagamento.":"Este relatório registra necessidades observadas visualmente no veículo e tem caráter orientativo. Serviços e valores podem depender de avaliação técnica complementar.",maxW);doc.text(foot,margin,y);y+=foot.length*5+4;doc.text("Vaporeasy · estética automotiva em domicílio",margin,y);
    const file=(isQuote?"orcamento-vaporeasy-":"relatorio-vaporeasy-")+cleanFileName(client?.name||"cliente")+"-"+cleanFileName(vehicle.brand+"-"+vehicle.model)+".pdf",blob=doc.output("blob"),pdfFile=new File([blob],file,{type:"application/pdf"});
    if(navigator.share&&navigator.canShare?.({files:[pdfFile]})){await navigator.share({title:isQuote?"Orçamento Vaporeasy":"Relatório Vaporeasy",files:[pdfFile]});return}
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);show("rgmsg",isQuote?"Orçamento gerado em PDF.":"Relatório gerado em PDF.","ok")
  }catch(e){if(e?.name!=="AbortError")show("rgmsg",fail(e),"error")}
}
function recurrenceLabel(freq){return freq==="weekly"?"Semanal":freq==="biweekly"?"Quinzenal":freq==="monthly"?"Mensal":"Sem recorrência"}
function weekdayLabel(n){return ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][Number(n)]||"—"}
function toggleRGRecurrence(){
  const on=!!$("rgfreq").value;$("rgrecfields").classList.toggle("hidden",!on)
}
async function loadVehicleHistory(vehicleId){
  const h=$("rghistory");
  const a=await sb.from("appointments").select("*").eq("vehicle_id",vehicleId).eq("status","completed").is("deleted_at",null).order("completed_at",{ascending:false}).limit(20);
  if(a.error){h.innerHTML='<div class="notice error">'+esc(fail(a.error))+'</div>';return}
  const rows=a.data||[];
  if(!rows.length){h.innerHTML='<div class="empty">Nenhum atendimento concluído para este veículo.</div>';return}
  const ids=rows.map(x=>x.id),ph=await sb.from("appointment_completion_photos").select("*").in("appointment_id",ids),photoMap=new Map();
  if(!ph.error)(ph.data||[]).forEach(p=>photoMap.set(p.appointment_id,p));
  const photoUrls=new Map();
  await Promise.all(rows.slice(0,8).map(async x=>{const p=photoMap.get(x.id);if(!p?.storage_path)return;const s=await sb.storage.from("completion-photos").createSignedUrl(p.storage_path,900);if(!s.error&&s.data?.signedUrl)photoUrls.set(x.id,s.data.signedUrl)}));
  h.innerHTML=rows.map(x=>{
    const s=services.find(q=>q.id===x.service_id),co=collabs.find(q=>q.id===x.collaborator_id),dt=spDateTime(x.completed_at||x.starts_at),p=photoMap.get(x.id),u=photoUrls.get(x.id);
    return '<div class="item" style="margin-top:8px"><div class="meta"><b>'+esc(dt.date+" • "+dt.time)+'</b></div><div style="font-weight:850;margin-top:3px">'+esc(s?.name||"Serviço")+'</div><div class="meta">'+esc(co?.name||p?.uploaded_by_name||"Equipe Vaporeasy")+(p?' • foto interna registrada':'')+'</div>'+(u?'<img src="'+esc(u)+'" alt="Foto interna do atendimento" style="width:100%;max-height:230px;object-fit:cover;border-radius:12px;border:1px solid #31576a;margin-top:9px;display:block">':'')+'</div>'
  }).join("")
}
async function openVehicleRG(cid,v){
  if(!v)return show("msg","Veículo não encontrado.","error");
  try{
    setRGOperatorMode(false);
    await refs();$("rgf").reset();show("rgmsg","");$("rgvid").value=v.id;$("rgcid").value=cid;$("rgplanid").value="";
    const client=clients.find(x=>x.id===cid);
    $("rgsummary").innerHTML='<h3 style="margin:0">'+esc(v.brand+" "+v.model)+'</h3><div class="meta" style="margin-top:5px">'+esc(v.plate||"Sem placa")+(v.year?' • '+esc(v.year):"")+(v.color?' • '+esc(v.color):"")+'<br>'+esc(client?.name||"Cliente")+'</div>';
    $("rgservice").innerHTML='<option value="">Selecione</option>'+services.filter(s=>s.active!==false).map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join("");
    const [pr,rp]=await Promise.all([sb.from("vehicle_profiles").select("*").eq("vehicle_id",v.id).maybeSingle(),sb.from("recurring_plans").select("*").eq("vehicle_id",v.id).eq("active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle()]);
    if(pr.error)throw pr.error;if(rp.error)throw rp.error;
    const profile=pr.data||{},d=profile.diagnostics||{};
    currentRGPhotos=Array.isArray(profile.photos)?profile.photos.filter(p=>p&&p.path).map(p=>({...p,issue_id:p.issue_id||null,include_in_report:p.include_in_report!==false})):[];
    currentRGIssues=Array.isArray(d.issues)?d.issues.filter(i=>i&&i.id).map(i=>({...i,include_in_report:i.include_in_report!==false})):[];
    currentRGQuotes=new Map();
    if(["owner","admin"].includes(currentRole)){
      const quoted=await sb.from("vehicle_service_quotes").select("issue_id,amount").eq("vehicle_id",v.id);
      if(quoted.error)throw quoted.error;
      currentRGQuotes=new Map((quoted.data||[]).map(row=>[String(row.issue_id),row.amount]));
    }
    $("rgbody").value=d.bodywork||"";$("rgglass").value=d.glass||"";$("rginterior").value=d.interior||"";$("rgprotection").value=d.protection||"";$("rgnotes").value=profile.notes||"";
    const plan=rp.data||null;if(plan){$("rgplanid").value=plan.id;$("rgfreq").value=plan.frequency;$("rgservice").value=plan.service_id;$("rgweekday").value=String(plan.weekday);$("rgtime").value=String(plan.local_time||"").slice(0,5)}else{$("rgfreq").value="";$("rgtime").value=""}
    toggleRGRecurrence();$("rgd").showModal();await Promise.all([renderRGIssues(),renderRGPhotos(),loadVehicleHistory(v.id)])
  }catch(e){show("msg",fail(e),"error")}
}
async function saveVehicleRG(e){
  e.preventDefault();const b=e.submitter;b.disabled=true;b.textContent="Salvando...";
  try{
    const vid=$("rgvid").value,cid=$("rgcid").value;
    const pr=await sb.from("vehicle_profiles").upsert({
      vehicle_id:vid,
      diagnostics:buildRGDiagnostics(),
      photos:currentRGPhotos,
      notes:$("rgnotes").value.trim(),
      updated_by:currentUserId,
      updated_at:new Date().toISOString()
    },{onConflict:"vehicle_id"});
    if(pr.error)throw pr.error;

    if(currentRole!=="operator"){
      const freq=$("rgfreq").value,planId=$("rgplanid").value;
      if(!freq){
        const off=await sb.from("recurring_plans").update({active:false,updated_by:currentUserId,updated_at:new Date().toISOString()}).eq("vehicle_id",vid).eq("active",true);
        if(off.error)throw off.error
      }else{
        const serviceId=$("rgservice").value,weekday=Number($("rgweekday").value),time=$("rgtime").value;
        if(!serviceId||!time)throw Error("Na recorrência, selecione serviço e horário.");
        const s=services.find(x=>x.id===serviceId);if(!s)throw Error("Serviço da recorrência inválido.");
        const v=findVehicleLocal(vid),standardPrice=servicePriceByVehicleSize(s,v?.package_size||"");
        if(serviceUsesVehicleSizePricing(s)&&standardPrice===null)throw Error("Defina o porte P/M ou G no cadastro do veículo antes de criar esta recorrência.");
        const recurringPrice=Number(standardPrice??s.price??0);
        const payload={client_id:cid,vehicle_id:vid,service_id:serviceId,frequency:freq,weekday,local_time:time,start_date:today(),base_value:recurringPrice,discount_percent:0,final_value:recurringPrice,notes:"",active:true,updated_by:currentUserId,updated_at:new Date().toISOString()};
        if(planId){
          const u=await sb.from("recurring_plans").update(payload).eq("id",planId);if(u.error)throw u.error;
          const other=await sb.from("recurring_plans").update({active:false,updated_by:currentUserId,updated_at:new Date().toISOString()}).eq("vehicle_id",vid).eq("active",true).neq("id",planId);if(other.error)throw other.error
        }else{
          const off=await sb.from("recurring_plans").update({active:false,updated_by:currentUserId,updated_at:new Date().toISOString()}).eq("vehicle_id",vid).eq("active",true);if(off.error)throw off.error;
          const ins=await sb.from("recurring_plans").insert(payload).select("id").single();if(ins.error)throw ins.error;$("rgplanid").value=ins.data.id
        }
      }
    }
    show("rgmsg",currentRole==="operator"?"Diagnóstico e observações salvos no RG.":"RG do veículo salvo.","ok")
  }catch(err){show("rgmsg",fail(err),"error")}
  finally{b.disabled=false;b.textContent="Salvar RG"}
}
function fillBrandOptions(){const s=$("vb");s.innerHTML='<option value="">Selecione</option>'+vehicleBrands.map(b=>'<option value="'+esc(b.name)+'">'+esc(b.name)+'</option>').join("")+'<option value="__other__">Outra montadora</option>'}
function fillModelOptions(brandName){const brand=vehicleBrands.find(b=>b.name===brandName),list=brand?vehicleModels.filter(m=>m.brand_id===brand.id):[];$("vm").innerHTML='<option value="">Selecione</option>'+list.map(m=>'<option value="'+esc(m.name)+'">'+esc(m.name)+'</option>').join("")+'<option value="__other__">Outro modelo</option>'}
function onBrandChange(){const other=$("vb").value==="__other__";$("vboc").classList.toggle("hidden",!other);$("vbo").required=other;if(other){$("vm").innerHTML='<option value="__other__">Outro modelo</option>';$("vm").value="__other__";$("vmoc").classList.remove("hidden");$("vmo").required=true}else{fillModelOptions($("vb").value);$("vmoc").classList.add("hidden");$("vmo").required=false;$("vmo").value=""}}
function onModelChange(){const other=$("vm").value==="__other__";$("vmoc").classList.toggle("hidden",!other);$("vmo").required=other;if(!other)$("vmo").value=""}
async function openVehicle(cid,v){try{await loadVehicleCatalog();$("vf").reset();$("vcid").value=cid;$("vid").value=v?.id||"";$("vsize").value=v?.package_size==="g"?"g":(v?.package_size==="pm"?"pm":"");fillBrandOptions();$("vboc").classList.add("hidden");$("vmoc").classList.add("hidden");$("vbo").required=false;$("vmo").required=false;const brandMatch=v?vehicleBrands.find(b=>b.name.toLowerCase()===String(v.brand||"").toLowerCase()):null;if(v&&brandMatch){$("vb").value=brandMatch.name;fillModelOptions(brandMatch.name);const modelMatch=vehicleModels.find(m=>m.brand_id===brandMatch.id&&m.name.toLowerCase()===String(v.model||"").toLowerCase());if(modelMatch){$("vm").value=modelMatch.name}else{$("vm").value="__other__";$("vmo").value=v.model||"";$("vmoc").classList.remove("hidden");$("vmo").required=true}}else if(v){$("vb").value="__other__";$("vbo").value=v.brand||"";$("vboc").classList.remove("hidden");$("vbo").required=true;$("vm").innerHTML='<option value="__other__">Outro modelo</option>';$("vm").value="__other__";$("vmo").value=v.model||"";$("vmoc").classList.remove("hidden");$("vmo").required=true}else{fillModelOptions("")}$("vp").value=v?.plate||"";$("vy").value=v?.year||"";$("vco").value=v?.color||"";$("vd").showModal()}catch(e){show("msg",fail(e),"error")}}
async function saveVehicle(e){e.preventDefault();try{const brand=$("vb").value==="__other__"?$("vbo").value.trim():$("vb").value.trim(),model=$("vm").value==="__other__"?$("vmo").value.trim():$("vm").value.trim();if(!brand)throw Error("Selecione ou informe a montadora.");if(!model)throw Error("Selecione ou informe o modelo.");const p={client_id:$("vcid").value,brand,model,plate:plate($("vp").value)||null,year:$("vy").value.trim(),color:$("vco").value.trim(),package_size:$("vsize").value||null};let r=$("vid").value?await sb.from("vehicles").update(p).eq("id",$("vid").value):await sb.from("vehicles").insert(p);if(r.error)throw r.error;$("vd").close();show("msg","Veículo salvo.","ok");renderClients()}catch(e){show("msg",fail(e),"error")}}
