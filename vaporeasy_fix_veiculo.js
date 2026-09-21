/* Vaporeasy — correção: preservar veículo selecionado no agendamento */
(function(){
  'use strict';

  function norm(v){
    try{
      if(typeof normalizeText==='function') return normalizeText(v||'');
    }catch(_){}
    return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  }

  let lastPlate='';
  let lastClient='';

  function remember(){
    const client=document.getElementById('agendaCliente');
    const vehicle=document.getElementById('agendaVeiculo');
    if(!client||!vehicle)return;
    if(vehicle.value){
      lastPlate=String(vehicle.value||'').trim();
      lastClient=String(client.value||'').trim();
      vehicle.dataset.vpRememberedPlate=lastPlate;
    }
  }

  function restore(){
    const client=document.getElementById('agendaCliente');
    const vehicle=document.getElementById('agendaVeiculo');
    if(!client||!vehicle||vehicle.value)return;

    const plate=String(vehicle.dataset.vpRememberedPlate||lastPlate||'').trim();
    if(!plate || norm(client.value||'')!==norm(lastClient||''))return;

    const wanted=norm(plate);
    const option=[...vehicle.options].find(o=>
      norm(o.value||'')===wanted ||
      norm(o.textContent||'').includes(wanted)
    );
    if(option){
      vehicle.value=option.value;
      vehicle.dataset.vpRememberedPlate=option.value;
    }
  }

  function install(){
    const vehicle=document.getElementById('agendaVeiculo');
    const client=document.getElementById('agendaCliente');

    if(vehicle && !vehicle.dataset.vpKeepVehicleBound){
      vehicle.dataset.vpKeepVehicleBound='1';
      vehicle.addEventListener('change',remember);
      vehicle.addEventListener('input',remember);
    }

    if(client && !client.dataset.vpKeepVehicleBound){
      client.dataset.vpKeepVehicleBound='1';
      client.addEventListener('input',()=>{
        if(lastClient && norm(client.value||'')!==norm(lastClient)){
          lastPlate='';
          lastClient='';
          if(vehicle) delete vehicle.dataset.vpRememberedPlate;
        }
      });
    }

    if(typeof window.updateAgendaVehicles==='function' && !window.updateAgendaVehicles.__vpKeepVehicleWrapped){
      const original=window.updateAgendaVehicles;
      function wrapped(){
        const c=document.getElementById('agendaCliente');
        const v=document.getElementById('agendaVeiculo');

        const beforePlate=String(v?.value||v?.dataset?.vpRememberedPlate||lastPlate||'').trim();
        const beforeClient=String(c?.value||lastClient||'').trim();

        if(beforePlate){
          lastPlate=beforePlate;
          lastClient=beforeClient;
        }

        const result=original.apply(this,arguments);

        const afterClient=document.getElementById('agendaCliente');
        const afterVehicle=document.getElementById('agendaVeiculo');
        if(afterVehicle && afterClient && beforePlate && norm(afterClient.value||'')===norm(beforeClient)){
          const wanted=norm(beforePlate);
          const option=[...afterVehicle.options].find(o=>
            norm(o.value||'')===wanted ||
            norm(o.textContent||'').includes(wanted)
          );
          if(option){
            afterVehicle.value=option.value;
            afterVehicle.dataset.vpRememberedPlate=option.value;
            lastPlate=option.value;
            lastClient=afterClient.value||beforeClient;
          }
        }
        return result;
      }
      wrapped.__vpKeepVehicleWrapped=true;
      window.updateAgendaVehicles=wrapped;
    }

    remember();
    restore();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(install,50);
    setTimeout(install,400);
    setTimeout(install,1200);
  });
  window.addEventListener('load',()=>setTimeout(install,250));
})();
