async function openCollaboratorsManager(){
  if(!["owner","admin"].includes(currentRole))return;
  try{
    await refs();
    const [r,a]=await Promise.all([
      sb.from("collaborators").select("*").order("active",{ascending:false}).order("name"),
      edgeCall("team-access-list",{},true)
    ]);
    if(r.error)throw r.error;
    allCollabs=r.data||[];
    collabAccess=new Map((a.accounts||[]).filter(x=>x.collaborator_id).map(x=>[x.collaborator_id,x]));
    renderCollaboratorsManager();
    if(!$("collabsd").open)$("collabsd").showModal()
  }catch(e){show("msg",fail(e),"error")}
}

function accessRoleLabel(role){return role==="admin"?"Gerente":role==="owner"?"Proprietário":"Colaborador"}
async function openCollaboratorsManager(){
  if(!["owner","admin"].includes(currentRole))return;
  try{
    await refs();
    const [r,a]=await Promise.all([
      sb.from("collaborators").select("*").order("active",{ascending:false}).order("name"),
      edgeCall("team-access-list",{},true)
    ]);
    if(r.error)throw r.error;
    allCollabs=r.data||[];
    collabAccess=new Map((a.accounts||[]).filter(x=>x.collaborator_id).map(x=>[x.collaborator_id,x]));
    renderCollaboratorsManager();
    if(!$("collabsd").open)$("collabsd").showModal()
  }catch(e){show("msg",fail(e),"error")}
}
function renderCollaboratorsManager(){
  const box=$("collabslist");
  box.innerHTML=allCollabs.length?allCollabs.map(x=>{
    const memberships=teamMembers.filter(m=>m.collaborator_id===x.id).map(m=>teams.find(t=>t.id===m.team_id)?.name).filter(Boolean);
    const access=collabAccess.get(x.id);
    const sub=[x.role_label||"Sem função",memberships.length?memberships.join(", "):""].filter(Boolean).join(" • ");
    const accessText=access?(access.active?accessRoleLabel(access.role):"Acesso bloqueado"):"Sem login";
    const accessClass=access?(access.active?"is-on":"is-blocked"):"is-off";
    return '<div class="collab-card"><div class="collab-card-head"><div class="collab-card-main"><div class="collab-card-title">'+esc(x.name)+'</div><div class="collab-card-sub">'+esc(sub)+'</div><div class="collab-status-row"><span class="status-chip '+(x.active?"is-on":"is-off")+'">'+(x.active?"Cadastro ativo":"Cadastro inativo")+'</span><span class="status-chip '+accessClass+'">'+esc(accessText)+'</span></div></div><button type="button" class="ghost" data-collab-edit="'+x.id+'">Editar</button></div></div>'
  }).join(""):'<div class="empty">Nenhum colaborador cadastrado.</div>';
  box.querySelectorAll("[data-collab-edit]").forEach(b=>b.onclick=()=>openCollaboratorEditor(allCollabs.find(x=>x.id===b.dataset.collabEdit)))
}
function switchCollaboratorSection(section){
  const data=section==="data";
  $("collabdatasection").classList.toggle("hidden",!data);
  $("collabaccesssection").classList.toggle("hidden",data);
  $("collabtabdata").classList.toggle("active",data);
  $("collabtabaccess").classList.toggle("active",!data)
}
function updateCollaboratorAccessSummary(){
  const id=$("collabid").value,existing=id?collabAccess.get(id):null,on=$("collablogin").checked;
  const chip=$("collabaccesschip"),summary=$("collabaccesssummary");
  chip.className="status-chip "+(on?"is-on":existing?"is-blocked":"is-off");
  chip.textContent=on?"Ativo":existing?"Bloqueado":"Sem login";
  summary.textContent=on
    ?accessRoleLabel($("collabaccessrole").value)+(existing?.email||$("collabemail").value?" • "+(existing?.email||$("collabemail").value):"")
    :existing?"Login desativado":"Login ainda não configurado"
}
function toggleCollaboratorAccessFields(){
  const on=$("collablogin").checked,id=$("collabid").value,existing=id?collabAccess.get(id):null;
  $("collabloginfields").classList.toggle("hidden",!on);
  $("collabemail").required=on;
  $("collabpassgenerate").textContent=existing?"Redefinir senha":"Gerar senha inicial";
  $("collabpasshint").textContent=existing
    ?"A senha atual nunca é exibida. Gere outra somente quando precisar redefinir o acesso."
    :"Gere uma senha provisória para o primeiro acesso.";
  if(!on){
    $("collabpassword").value="";
    $("collabpassbox").classList.add("hidden");
    $("collabpassvalue").textContent="—"
  }
  updateCollaboratorAccessSummary()
}
function secureRandomIndex(max){
  const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%max
}
function generateCollaboratorPassword(){
  const groups=["ABCDEFGHJKLMNPQRSTUVWXYZ","abcdefghijkmnopqrstuvwxyz","23456789","!@#$"];
  const all=groups.join("");
  let chars=groups.map(g=>g[secureRandomIndex(g.length)]);
  while(chars.length<12)chars.push(all[secureRandomIndex(all.length)]);
  for(let i=chars.length-1;i>0;i--){const j=secureRandomIndex(i+1);[chars[i],chars[j]]=[chars[j],chars[i]]}
  const pass=chars.join("");
  $("collabpassword").value=pass;
  $("collabpassvalue").textContent=pass;
  $("collabpassbox").classList.remove("hidden");
  show("collabmsg","Senha provisória gerada. Salve o colaborador para aplicá-la.","ok")
}
async function copyCollaboratorPassword(){
  const pass=$("collabpassword").value;
  if(!pass)return;
  try{await navigator.clipboard.writeText(pass);show("collabmsg","Senha provisória copiada.","ok")}
  catch{show("collabmsg","Não foi possível copiar automaticamente. Selecione a senha exibida.","error")}
}
function openCollaboratorEditor(x=null){
  $("collabf").reset();show("collabmsg","");
  const access=x?.id?collabAccess.get(x.id):null;
  $("collabid").value=x?.id||"";
  $("collabtitle").textContent=x?"Editar colaborador":"Novo colaborador";
  $("collabname").value=x?.name||"";
  $("collabphone").value=x?.phone||"";
  $("collabwhatsapp").value=x?.whatsapp||"";
  $("collabrole").value=x?.role_label||"";
  $("collabactive").checked=x?!!x.active:true;
  $("collabnotes").value=x?.notes||"";
  $("collablogin").checked=!!access?.active;
  $("collabemail").value=access?.email||"";
  $("collabaccessrole").value=["owner","admin","operator"].includes(access?.role)?access.role:"operator";
  $("collabpassword").value="";
  $("collabpassvalue").textContent="—";
  $("collabpassbox").classList.add("hidden");
  const adminOption=$("collabaccessrole").querySelector('option[value="admin"]'),ownerOption=$("collabaccessrole").querySelector('option[value="owner"]');
  if(adminOption)adminOption.disabled=currentRole!=="owner";
  if(ownerOption)ownerOption.disabled=true;
  const protectedOwner=access?.role==="owner";
  $("collablogin").disabled=protectedOwner;
  $("collabemail").disabled=protectedOwner;
  $("collabaccessrole").disabled=protectedOwner;
  $("collabpassgenerate").disabled=protectedOwner;
  if(protectedOwner)$("collabpasshint").textContent="Perfil Proprietário protegido. O acesso pode ser alterado somente pela administração técnica.";
  switchCollaboratorSection("data");
  toggleCollaboratorAccessFields();
  $("collabd").showModal()
}
async function saveCollaborator(e){
  e.preventDefault();if(!["owner","admin"].includes(currentRole))return;
  const id=$("collabid").value,name=$("collabname").value.trim(),active=$("collabactive").checked;
  if(!name){switchCollaboratorSection("data");return show("collabmsg","Informe o nome do colaborador.","error")}
  if(id&&!active){
    const member=teamMembers.find(m=>m.collaborator_id===id&&teams.find(t=>t.id===m.team_id)?.active);
    if(member){const t=teams.find(x=>x.id===member.team_id);switchCollaboratorSection("data");return show("collabmsg","Este colaborador pertence à "+(t?.name||"uma equipe ativa")+". Remova-o da equipe ou inative a equipe antes de desativá-lo.","error")}
  }
  const existing=id?collabAccess.get(id):null,protectedOwner=existing?.role==="owner",accessEnabled=active&&$("collablogin").checked;
  if(accessEnabled&&!$("collabemail").value.trim()){switchCollaboratorSection("access");return show("collabmsg","Informe o e-mail de acesso.","error")}
  if(accessEnabled&&!existing&&!$("collabpassword").value){switchCollaboratorSection("access");return show("collabmsg","Gere a senha inicial antes de salvar o primeiro acesso.","error")}
  const payload={name,phone:$("collabphone").value.trim(),whatsapp:$("collabwhatsapp").value.trim(),role_label:$("collabrole").value.trim(),active,notes:$("collabnotes").value.trim(),updated_at:new Date().toISOString()};
  const submit=e.submitter;submit.disabled=true;submit.textContent="Salvando...";
  try{
    let r;
    if(id)r=await sb.from("collaborators").update(payload).eq("id",id).select("id").single();
    else r=await sb.from("collaborators").insert(payload).select("id").single();
    if(r.error)throw r.error;
    const savedId=r.data.id,hadAccess=collabAccess.has(savedId);
    if((accessEnabled||hadAccess)&&!protectedOwner){
      await edgeCall("team-access-save",{
        collaborator_id:savedId,
        access_enabled:accessEnabled,
        email:$("collabemail").value.trim(),
        role:$("collabaccessrole").value,
        password:$("collabpassword").value
      },true)
    }
    $("collabd").close();
    await openCollaboratorsManager();
    show("msg",id?"Colaborador atualizado.":"Colaborador cadastrado.","ok")
  }catch(err){show("collabmsg",fail(err),"error")}
  finally{submit.disabled=false;submit.textContent="Salvar"}
}
function teamMemberNames(teamId){
  return teamMembers.filter(x=>x.team_id===teamId).sort((a,b)=>a.position-b.position).map(x=>collabs.find(c=>c.id===x.collaborator_id)?.name||"Colaborador")
}
function teamDisplay(teamId){
  const t=teams.find(x=>x.id===teamId);if(!t)return"Equipe";
  const names=teamMemberNames(teamId);return t.name+(names.length?" • "+names.join(" + "):"")
}
async function openTeamsManager(){
  if(!["owner","admin"].includes(currentRole))return;
  try{await refs();renderTeamsManager();$("teamsd").showModal()}catch(e){show("msg",fail(e),"error")}
}
function renderTeamsManager(){
  const box=$("teamslist");
  box.innerHTML=teams.length?teams.map(t=>'<div class="item" style="margin-top:9px"><div class="actions" style="align-items:flex-start"><div style="flex:3"><b>'+esc(t.name)+'</b><div class="meta">'+esc(teamMemberNames(t.id).join(" + ")||"Sem colaboradores")+'<br>'+(t.active?"Ativa":"Inativa")+'</div></div><button type="button" class="ghost" data-team-edit="'+t.id+'">Editar</button></div></div>').join(""):'<div class="empty">Nenhuma equipe cadastrada.</div>';
  box.querySelectorAll("[data-team-edit]").forEach(b=>b.onclick=()=>openTeamEditor(teams.find(t=>t.id===b.dataset.teamEdit)))
}
function fillTeamMemberSelects(team=null){
  const opts='<option value="">Selecione</option>'+collabs.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join("");
  $("teamm1").innerHTML=opts;$("teamm2").innerHTML='<option value="">Sem segundo colaborador</option>'+collabs.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join("");
  if(team){const ms=teamMembers.filter(x=>x.team_id===team.id).sort((a,b)=>a.position-b.position);$("teamm1").value=ms[0]?.collaborator_id||"";$("teamm2").value=ms[1]?.collaborator_id||""}
}
function openTeamEditor(team=null){
  $("teamf").reset();show("teammsg","");$("teamid").value=team?.id||"";$("teamtitle").textContent=team?"Editar equipe":"Nova equipe";$("teamname").value=team?.name||"";$("teamactive").checked=team?!!team.active:true;$("teamnotes").value=team?.notes||"";fillTeamMemberSelects(team);$("teamd").showModal()
}
async function saveTeam(e){
  e.preventDefault();if(!["owner","admin"].includes(currentRole))return;
  const id=$("teamid").value,name=$("teamname").value.trim(),m1=$("teamm1").value,m2=$("teamm2").value||null;
  if(!name)return show("teammsg","Informe o nome da equipe.","error");
  if(!m1)return show("teammsg","Selecione pelo menos um colaborador.","error");
  if(m2&&m1===m2)return show("teammsg","Os dois integrantes da equipe precisam ser colaboradores diferentes.","error");
  const chosen=[m1,m2].filter(Boolean),otherMembership=teamMembers.find(x=>chosen.includes(x.collaborator_id)&&x.team_id!==id);
  if(otherMembership){const t=teams.find(x=>x.id===otherMembership.team_id),co=collabs.find(x=>x.id===otherMembership.collaborator_id);return show("teammsg",(co?.name||"Este colaborador")+" já pertence à "+(t?.name||"outra equipe")+". Remova-o da outra equipe antes de continuar.","error")}
  try{
    let teamId=id;
    const payload={name,active:$("teamactive").checked,notes:$("teamnotes").value.trim(),updated_by:currentUserId};
    if(id){const u=await sb.from("teams").update(payload).eq("id",id);if(u.error)throw u.error}
    else{const ins=await sb.from("teams").insert({...payload,created_by:currentUserId}).select("id").single();if(ins.error)throw ins.error;teamId=ins.data.id}
    const del=await sb.from("team_members").delete().eq("team_id",teamId);if(del.error)throw del.error;
    const rows=[{team_id:teamId,collaborator_id:m1,position:1}];if(m2)rows.push({team_id:teamId,collaborator_id:m2,position:2});
    const im=await sb.from("team_members").insert(rows);if(im.error)throw im.error;
    $("teamd").close();await refs(true);renderTeamsManager();show("msg","Equipe salva.","ok")
  }catch(err){show("teammsg",fail(err),"error")}
}

function normalizeContactName(v){return String(v||"").trim().replace(/\s+/g," ")}
function contactNameKey(v){return normalizeContactName(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
function contactPhoneKey(v){
  let d=String(v||"").replace(/\D/g,"");
  if(d.startsWith("00"))d=d.slice(2);
  if(d.startsWith("55")&&d.length>=12)d=d.slice(2);
  if(d.startsWith("0")&&d.length>11)d=d.slice(1);
  return d.length>11?d.slice(-11):d
}
function formatImportedPhone(v){
  const d=contactPhoneKey(v);
  if(d.length===11)return "("+d.slice(0,2)+") "+d.slice(2,7)+"-"+d.slice(7);
  if(d.length===10)return "("+d.slice(0,2)+") "+d.slice(2,6)+"-"+d.slice(6);
  return String(v||"").trim()
}
function configureAndroidContactImport(){
  const isAndroid=/Android/i.test(navigator.userAgent||"");
  const btn=$("importcontacts");
  if(!btn)return;
  btn.classList.toggle("hidden",!isAndroid);
}
function existingContactKeys(){
  const phones=new Set(),names=new Set();
  (clients||[]).forEach(c=>{
    [c.phone,c.whatsapp].forEach(v=>{const k=contactPhoneKey(v);if(k)phones.add(k)});
    const nk=contactNameKey(c.name);if(nk)names.add(nk)
  });
  return {phones,names}
}
function contactArrayFirst(v){
  if(Array.isArray(v))return String(v.find(x=>String(x||"").trim())||"").trim();
  return String(v||"").trim()
}
async function openAndroidContactsImport(){
  show("msg","");
  if(!/Android/i.test(navigator.userAgent||""))return show("msg","A importação de contatos foi habilitada somente para Android.","error");
  if(!navigator.contacts?.select)return show("msg","Este navegador Android não oferece o seletor de contatos. Abra a Vaporeasy no Google Chrome atualizado.","error");
  try{
    const picked=await navigator.contacts.select(["name","tel"],{multiple:true});
    if(!picked?.length)return;
    const existing=existingContactKeys(),seenPhones=new Set();
    androidImportContacts=[];
    for(const raw of picked){
      const name=contactArrayFirst(raw.name),phoneRaw=contactArrayFirst(raw.tel),phoneKey=contactPhoneKey(phoneRaw);
      if(!name||!phoneKey)continue;
      if(seenPhones.has(phoneKey))continue;
      seenPhones.add(phoneKey);
      const phone=formatImportedPhone(phoneRaw),phoneDuplicate=existing.phones.has(phoneKey),nameDuplicate=existing.names.has(contactNameKey(name));
      androidImportContacts.push({
        name,phone,phoneKey,
        duplicate:phoneDuplicate,
        sameName:nameDuplicate&&!phoneDuplicate,
        selected:!phoneDuplicate&&!nameDuplicate
      })
    }
    renderAndroidContactsImport();
    $("contactsd").showModal()
  }catch(e){
    if(e?.name!=="AbortError")show("msg","Não foi possível abrir os contatos do Android. "+(e?.message||""),"error")
  }
}
function renderAndroidContactsImport(){
  const box=$("contactsimportlist"),summary=$("contactsimportsummary");
  const list=androidImportContacts||[],available=list.filter(x=>!x.duplicate).length,exact=list.filter(x=>x.duplicate).length,same=list.filter(x=>x.sameName).length;
  summary.textContent=list.length+" contato(s) lido(s) • "+available+" disponível(is)"+(exact?" • "+exact+" já cadastrado(s)":"")+(same?" • "+same+" nome(s) para revisar":"");
  if(!list.length){box.innerHTML='<div class="empty">Nenhum contato com nome e telefone foi selecionado.</div>';return}
  box.innerHTML=list.map((x,i)=>{
    const badge=x.duplicate?'<span class="pill">Já cadastrado</span>':x.sameName?'<span class="pill">Nome já existe — revisar</span>':'<span class="pill">Novo</span>';
    return '<label class="item" style="display:grid;grid-template-columns:auto 1fr;align-items:center;gap:10px;margin-top:8px;cursor:'+(x.duplicate?'not-allowed':'pointer')+'"><input type="checkbox" data-contact-import="'+i+'" '+(x.selected?'checked ':'')+(x.duplicate?'disabled ':'')+'style="width:22px;min-height:22px"><div><b>'+esc(x.name)+'</b><div class="meta">'+esc(x.phone)+'</div><div style="margin-top:5px">'+badge+'</div></div></label>'
  }).join("");
  box.querySelectorAll("[data-contact-import]").forEach(el=>el.onchange=()=>{const x=androidImportContacts[Number(el.dataset.contactImport)];if(x)x.selected=el.checked})
}
function selectAllAndroidContacts(){
  androidImportContacts.forEach(x=>{if(!x.duplicate)x.selected=true});
  renderAndroidContactsImport()
}
async function saveAndroidContactsImport(){
  const chosen=(androidImportContacts||[]).filter(x=>x.selected&&!x.duplicate);
  if(!chosen.length)return show("contactsimportmsg","Selecione ao menos um contato disponível.","error");
  const btn=$("contactsimportsave");btn.disabled=true;btn.textContent="Importando...";
  try{
    const current=existingContactKeys(),rows=[],skipped=[];
    for(const x of chosen){
      if(current.phones.has(x.phoneKey)){skipped.push(x);continue}
      current.phones.add(x.phoneKey);
      rows.push({name:x.name,phone:x.phone,whatsapp:x.phone,address:"",notes:"",condominium_id:null})
    }
    if(rows.length){
      const r=await sb.from("clients").insert(rows).select("id,name,phone,whatsapp");
      if(r.error)throw r.error
    }
    $("contactsd").close();
    androidImportContacts=[];
    await loadClients();
    show("msg",rows.length+" contato(s) importado(s) para clientes."+(skipped.length?" "+skipped.length+" duplicado(s) ignorado(s).":""),"ok")
  }catch(e){show("contactsimportmsg",fail(e),"error")}
  finally{btn.disabled=false;btn.textContent="Importar selecionados"}
}
let selectedClientId="";
const normalizeClientSearch=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
