import { listVehicles } from '../data/vehicles.js';
import { listClients } from '../data/clients.js';

export function attachVehiclesPanel(supabase, controller, document) {
  const button = document.getElementById('load-vehicles');
  const list = document.getElementById('vehicles-list');
  const status = document.getElementById('vehicles-status');
  const workspace = document.getElementById('workspace');
  const filter = document.getElementById('vehicle-client-filter');
  const option = (label, value) => { const el = document.createElement('option'); el.textContent = label; el.value = value; return el; };
  let generation = 0;
  let loading = false;
  let filterReady = false;
  controller.subscribe(({ recovering, internalAccess }) => {
    if (recovering || !internalAccess) {
      generation++;
      list.replaceChildren();
      status.textContent = '';
      filter.replaceChildren(option('Todos os clientes', ''));
      filterReady = false;
    }
  });
  async function refreshClients() {
    const clients = await listClients(supabase, controller, 100);
    if (workspace.hidden || !controller.state().internalAccess) return;
    const selected = filter.value;
    filter.replaceChildren(option('Todos os clientes', ''), ...clients.map(c => option(c.name, c.id)));
    filter.value = selected && clients.some(c => c.id === selected) ? selected : '';
    filterReady = true;
  }
  filter.addEventListener('focus', async () => {
    if (filterReady || loading || workspace.hidden || !controller.state().internalAccess) return;
    const requestGeneration = generation;
    try {
      await refreshClients();
      if (requestGeneration !== generation || workspace.hidden || !controller.state().internalAccess) {
        filter.replaceChildren(option('Todos os clientes', ''));
        filterReady = false;
      }
    } catch { if (!workspace.hidden && controller.state().internalAccess) status.textContent = 'Não foi possível carregar os clientes para o filtro.'; }
  });
  filter.addEventListener('change', () => {
    if (!workspace.hidden && controller.state().internalAccess && !loading) button.click();
  });
  button.addEventListener('click', async () => {
    const requestGeneration = ++generation;
    if (workspace.hidden || !controller.state().internalAccess) return;
    if (loading) return;
    loading = true;
    button.disabled = true;
    list.replaceChildren();
    status.textContent = 'Consultando veículos...';
    try {
      if (!filterReady) await refreshClients();
      if (requestGeneration !== generation || workspace.hidden || !controller.state().internalAccess) return;
      const selectedClient = filter.value || null;
      const vehicles = await listVehicles(supabase, controller, 100, selectedClient);
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
    } finally { loading = false; button.disabled = false; }
  });
}
