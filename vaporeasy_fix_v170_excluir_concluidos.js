/* Vaporeasy V170 — botão de exclusão em atendimentos concluídos da agenda
   Carregar depois do V169:
   <script src="./vaporeasy_fix_v170_excluir_concluidos.js?v=170"></script>
*/
(function(){
  function profile(){
    try{return window.vpGetCurrentProfile?.()||null}catch(_){return null}
  }
  function canManage(){
    return ['owner','admin'].includes(profile()?.role||'');
  }
  function safe(v){
    try{
      if(typeof esc==='function') return esc(v);
      return String(v??'')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }catch(_){return ''}
  }
  function norm(v){
    try{
      if(typeof normalizeText==='function') return normalizeText(v||'');
      return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
    }catch(_){return String(v||'').trim().toLowerCase()}
  }

  function installStyle(){
    if(document.getElementById('vp-v170-style')) return;
    const s=document.createElement('style');
    s.id='vp-v170-style';
    s.textContent=`
      .vp-v170-completed-actions{
        display:flex;justify-content:flex-end;margin-top:12px;padding-top:10px;
        border-top:1px solid rgba(255,255,255,.08)
      }
      .vp-v170-delete-completed{
        min-height:40px!important;padding:9px 14px!important;border-radius:12px!important;
        border:1px solid rgba(255,90,105,.55)!important;
        background:rgba(180,35,50,.14)!important;color:#ffd7dc!important;
        font-weight:700!important
      }
    `;
    document.head.appendChild(s);
  }

  function completedConsultationV170(date,search,collaborator,vehicleLabel){
    const completed=(typeof getAppointments==='function'?getAppointments():[])
      .filter(a=>String(a.date||'')===date && (typeof agendaStatusGroup==='function'?agendaStatusGroup(a.status):norm(a.status))==='completed')
      .filter(a=>collaborator==='all'||String(a.collaborator||'')===collaborator)
      .map(a=>({
        a,
        label:vehicleLabel
          ? vehicleLabel(a)
          : (typeof appointmentVehicleLabel==='function'
              ? appointmentVehicleLabel(a.plate||a.vehicle||'')
              : (a.vehicle||a.plate||''))
      }))
      .filter(({a,label})=>!search||norm([a.client,a.vehicle,a.plate,label,a.service,a.collaborator,a.status].join(' ')).includes(search))
      .sort((x,y)=>String(x.a.time||'').localeCompare(String(y.a.time||'')));

    const count=document.getElementById('agendaSummaryCompleted');
    if(count) count.textContent=String(completed.length);
    if(!completed.length) return '';

    const manager=canManage();

    return '<section class="agenda-completed-consult" aria-label="Carros concluídos"><h3>Concluídos neste dia • '+completed.length+'</h3>'+
      completed.map(({a,label})=>'<details class="vp-agenda-item agenda-completed-record"><summary>'+
        '<div class="vp-agenda-item-time">'+safe(String(a.time||'').slice(0,5))+'</div>'+
        '<div class="vp-agenda-item-main"><strong>'+safe(a.client||'Cliente')+'</strong><span>'+safe(label||'Veículo não informado')+'</span></div>'+
        '<span class="vp-agenda-item-status done">Concluído</span><span class="vp-agenda-item-chevron">＋</span></summary>'+
        '<div class="vp-agenda-item-body"><div class="vp-agenda-item-grid">'+
        '<div class="vp-agenda-info"><span>Veículo</span><b>'+safe(label||'Veículo não informado')+'</b></div>'+
        '<div class="vp-agenda-info"><span>Serviço realizado</span><b>'+safe(a.service||'Não informado')+'</b></div>'+
        '<div class="vp-agenda-info"><span>Equipe / colaborador</span><b>'+safe(a.collaborator||'Não informado')+'</b></div>'+
        '<div class="vp-agenda-info"><span>Data do serviço</span><b>'+safe(String(a.date||'').split('-').reverse().join('/'))+'</b></div>'+
        '</div>'+(a.notes?'<div class="vp-agenda-notes">'+safe(a.notes)+'</div>':'')+
        (manager
          ? '<div class="vp-v170-completed-actions"><button type="button" class="vp-v170-delete-completed" data-v170-delete-completed="'+safe(a.id||a.cloudId||'')+'">Excluir definitivamente</button></div>'
          : '')+
        '</div></details>').join('')+
      '</section>';
  }

  function install(){
    installStyle();
    try{window.agendaCompletedConsultation=completedConsultationV170}catch(_){}
    try{agendaCompletedConsultation=completedConsultationV170}catch(_){}
    try{if(typeof renderAgendaTimeline==='function')renderAgendaTimeline()}catch(_){}
  }

  document.addEventListener('click',async function(ev){
    const b=ev.target.closest?.('[data-v170-delete-completed]');
    if(!b)return;
    ev.preventDefault();
    ev.stopPropagation();

    if(!canManage()){
      try{showToast?.('Somente proprietário ou administrador pode excluir serviços concluídos.','error')}catch(_){}
      return;
    }

    const id=b.getAttribute('data-v170-delete-completed')||'';
    if(!id)return;

    try{
      if(typeof window.deleteAppointment==='function'){
        await window.deleteAppointment(id);
      }else if(typeof deleteAppointment==='function'){
        await deleteAppointment(id);
      }else{
        throw new Error('Rotina de exclusão indisponível.');
      }
    }catch(e){
      console.error('V170 delete completed',e);
      try{showToast?.('Não foi possível excluir este atendimento.','error')}catch(_){}
    }
  },true);

  install();
  [500,1400,3000].forEach(ms=>setTimeout(install,ms));
  console.info('Vaporeasy patch ativo: v170-excluir-concluidos-2026-09-23');
})();
