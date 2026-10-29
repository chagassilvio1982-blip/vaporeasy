import { listVehicles } from '../data/vehicles.js';

export function attachVehiclesPanel(supabase, controller, document) {
  const button = document.getElementById('load-vehicles');
  const list = document.getElementById('vehicles-list');
  const status = document.getElementById('vehicles-status');
  const workspace = document.getElementById('workspace');
  let generation = 0;
  controller.subscribe(({ recovering, internalAccess }) => {
    if (recovering || !internalAccess) {
      generation++;
      list.replaceChildren();
      status.textContent = '';
    }
  });
  button.addEventListener('click', async () => {
    const requestGeneration = ++generation;
    if (workspace.hidden || !controller.state().internalAccess) return;
    button.disabled = true;
    list.replaceChildren();
    status.textContent = 'Consultando veículos...';
    try {
      const vehicles = await listVehicles(supabase, controller);
      if (requestGeneration !== generation || workspace.hidden || !controller.state().internalAccess) return;
      const items = vehicles.map(vehicle => {
        const item = document.createElement('li');
        item.textContent = [vehicle.brand, vehicle.model, vehicle.plate].filter(Boolean).join(' — ');
        return item;
      });
      list.replaceChildren(...items);
      status.textContent = vehicles.length ? `${vehicles.length} veículo(s) encontrado(s).` : 'Nenhum veículo cadastrado nesta empresa.';
    } catch {
      if (requestGeneration !== generation || workspace.hidden || !controller.state().internalAccess) return;
      list.replaceChildren();
      status.textContent = 'Consulta indisponível. Verifique o acesso e a conexão.';
    } finally { button.disabled = false; }
  });
}
