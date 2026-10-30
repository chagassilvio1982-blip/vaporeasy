import { listVehicles } from '../data/vehicles.js';
import { listClients } from '../data/clients.js';

export function attachVehiclesPanel(supabase, controller, document) {
  const button = document.getElementById('load-vehicles');
  const list = document.getElementById('vehicles-list');
  const status = document.getElementById('vehicles-status');
  const workspace = document.getElementById('workspace');
  const filter = document.getElementById('vehicle-client-filter');
  let generation = 0;
  controller.subscribe(({ recovering, internalAccess }) => {
    if (recovering || !internalAccess) {
      generation++;
      list.replaceChildren();
      status.textContent = '';
      filter.replaceChildren(new Option('Todos os clientes', ''));
    }
  });
  button.addEventListener('click', async () => {
    const requestGeneration = ++generation;
    if (workspace.hidden || !controller.state().internalAccess) return;
    button.disabled = true;
    list.replaceChildren();
    status.textContent = 'Consultando veículos...';
    try {
      const selectedClient = filter.value || null;
      const clients = await listClients(supabase, controller, 100);
      if (requestGeneration !== generation || workspace.hidden || !controller.state().internalAccess) return;
      const validSelection = selectedClient && clients.some(c => c.id === selectedClient) ? selectedClient : null;
      filter.replaceChildren(new Option('Todos os clientes', ''), ...clients.map(c => new Option(c.name, c.id)));
      filter.value = validSelection || '';
      const vehicles = await listVehicles(supabase, controller, 100, validSelection);
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
