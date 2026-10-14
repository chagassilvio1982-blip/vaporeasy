/* Deterministic operational care cadence. No payments, writes or entitlement inference. */
(function(root){
 'use strict';
 const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
 const date=x=>String(x||'').slice(0,10);
 function difference(a,b){
  const parse=x=>{if(!/^\d{4}-\d\d-\d\d$/.test(date(x)))return NaN;const [y,m,d]=date(x).split('-').map(Number),n=Date.UTC(y,m-1,d);return new Date(n).toISOString().slice(0,10)===date(x)?n:NaN};
  return Math.round((parse(a)-parse(b))/86400000);
 }
 const sameMonth=(a,b)=>date(a).slice(0,7)===date(b).slice(0,7);
 const positiveInt=(v,defaultValue)=>Number.isInteger(Number(v))&&Number(v)>0?Number(v):defaultValue;
 function evaluate(defs,history,visits,visitDate){
  const ref=date(visitDate),past=(history||[]).filter(e=>date(e.date)<=ref);
  return (defs||[]).map(b=>{
   const label=String(b.label||b.service_label||'').trim(),frequency=b.frequency||b.cadence_type;
   const performed=past.filter(x=>norm(x.label)===norm(label)).sort((a,b)=>date(b.date).localeCompare(date(a.date)));
   const last=performed[0]||null,previous=last?date(last.date):null;
   const nowDone=performed.some(e=>e.appointment_id&&b.appointment_id&&e.appointment_id===b.appointment_id);
   const min=positiveInt(b.min_days??b.cadence_min_days,0),max=positiveInt(b.max_days??b.cadence_max_days,min);
   const monthly=positiveInt(b.monthly_quantity??b.quantity,1);
   const every=positiveInt(b.every_n_visits,1);
   let status='check',why='Conferir com o administrador',next=null;
   if(frequency==='interval_days'){
    if(!previous){status='check';why='Primeira aplicação não localizada';}
    else{
     const elapsed=difference(ref,previous);
     if(!Number.isFinite(elapsed)){status='check';why='Data anterior inválida';}
     else if(elapsed>=min){status='due';why=elapsed>max?'Prazo máximo ultrapassado ('+elapsed+' dias)':'Janela de manutenção: '+elapsed+' dias desde aplicação';}
     else {status='ok';why='Última aplicação há '+elapsed+' dias; intervalo de '+min+(max!==min?' a '+max:'')+' dias';}
    }
    if(previous&&min>0){const n=new Date(Date.parse(previous+'T00:00:00Z')+min*86400000);next=Number.isFinite(n.getTime())?n.toISOString().slice(0,10):null;}
   }else if(frequency==='monthly'){
    const count=performed.filter(x=>sameMonth(x.date,ref)).length;
    status=count>=monthly?'done':'due';
    why=count>=monthly?'Realizado '+count+' de '+monthly+' neste mês':'Realizados '+count+' de '+monthly+' previstos neste mês';
   }else if(frequency==='per_visit'){
    const done=performed.some(x=>x.appointment_id&&b.appointment_id&&x.appointment_id===b.appointment_id);
    status=done?'done':'due';
    why=done?'Registrado neste atendimento':'Previsto em toda estética do plano';
   }else if(frequency==='every_n_visits'){
    if(!previous){status='check';why='Definir ponto inicial do ciclo de '+every+' visitas';}
    else{
     const since=(visits||[]).filter(v=>date(v.date)>previous&&date(v.date)<=ref).length;
     status=since+1>=every?'due':'ok';why=since+' visita(s) concluídas após o último cuidado; a cada '+every+' visitas';
    }
   }
   return {label,frequency,status,why,lastDate:previous,nextDate:next,daysSince:previous?difference(ref,previous):null};
  });
 }
 function lastVisit(visits,visitDate){
  return (visits||[]).filter(v=>date(v.date)<date(visitDate)).sort((a,b)=>date(b.date).localeCompare(date(a.date)))[0]||null;
 }
 const api={evaluate,lastVisit,difference,norm};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.VaporeasyCareRhythm=api;
})(typeof window!=='undefined'?window:null);
