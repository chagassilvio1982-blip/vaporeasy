/* Shared, side-effect-free validation for Cadastro and Agenda. */
(function(root){
  'use strict';
  const nameKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
  const plate=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  function vehicleError({client,registration,brand,model,vehicles=[],clients=[],originalPlate=''}){
    if(!clients.some(c=>nameKey(c.name)===nameKey(client)))return 'Selecione um cliente já cadastrado.';
    if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate(registration)))return 'Confira a placa: use ABC1234 ou ABC1D23.';
    if(!String(brand||'').trim()||!String(model||'').trim()||nameKey(brand)==='outro'||nameKey(model)==='outro')return 'Informe a marca e o modelo do veículo.';
    const existing=vehicles.find(v=>plate(v.plate)===plate(registration));
    if(existing&&nameKey(existing.client)!==nameKey(client))return 'Esta placa já pertence a outro cliente. Abra o cadastro existente para conferir.';
    if(originalPlate&&plate(originalPlate)!==plate(registration))return 'A placa identifica o histórico deste veículo. Mantenha a placa original nesta edição.';
    return '';
  }
  function clientError(name,original,clients){
    if(!String(name||'').trim())return 'Informe o nome do cliente.';
    const match=clients.find(c=>nameKey(c.name)===nameKey(name));
    if(match&&(!original||nameKey(match.name)!==nameKey(original)))return 'Já existe um cliente com este nome. Selecione o cadastro e toque em Editar.';
    return '';
  }
  function appointmentError(client,registration,clients,vehicles){
    if(!clients.some(c=>nameKey(c.name)===nameKey(client)))return 'Selecione um cliente cadastrado na lista.';
    if(!vehicles.some(v=>plate(v.plate)===plate(registration)&&nameKey(v.client)===nameKey(client)))return 'Selecione um veículo deste cliente.';
    return '';
  }
  const encodeArg=value=>encodeURIComponent(value).replace(/'/g,'%27');
  const api={nameKey,plate,vehicleError,clientError,appointmentError,encodeArg};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VaporeasyCadastroAgenda=api;
})(typeof window!=='undefined'?window:globalThis);
