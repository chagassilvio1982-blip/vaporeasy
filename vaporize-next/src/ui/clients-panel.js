import { listClients } from '../data/clients.js';

export function attachClientsPanel(supabase, controller, document) {
  const button = document.getElementById('load-clients');
  const list = document.getElementById('clients-list');
  const status = document.getElementById('clients-status');
  const workspace = document.getElementById('workspace');
  button.addEventListener('click', async () => {
    if (workspace.hidden || !controller.state().internalAccess) return;
    button.disabled = true;
    list.replaceChildren();
    status.textContent = 'Consultando clientes...';
    try {
      const clients = await listClients(supabase, controller);
      if (workspace.hidden || !controller.state().internalAccess) return;
      const items = clients.map(client => {
        const item = document.createElement('li');
        item.textContent = client.name;
        return item;
      });
      list.replaceChildren(...items);
      status.textContent = clients.length ? `${clients.length} cliente(s) encontrado(s).` : 'Nenhum cliente cadastrado nesta empresa.';
    } catch {
      list.replaceChildren();
      status.textContent = 'Consulta indisponível. Verifique o acesso e a conexão.';
    } finally { button.disabled = false; }
  });
}
