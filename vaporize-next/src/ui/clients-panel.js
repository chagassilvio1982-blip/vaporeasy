import { listClients, createClient } from '../data/clients.js';
import { updateClient } from '../data/records-write.js';

export function attachClientsPanel(supabase, controller, document) {
  const button = document.getElementById('load-clients');
  const list = document.getElementById('clients-list');
  const status = document.getElementById('clients-status');
  const workspace = document.getElementById('workspace');
  const createForm = document.getElementById('client-create-form');
  const editForm = document.getElementById('client-edit-form');
  const writeStatus = document.getElementById('client-write-status');
  const canWrite = () => { const st=controller.state(); return !st.recovering && st.internalAccess && st.organizations?.length===1 && ['owner','manager'].includes(st.organizations[0].membership_role); };
  let selected = null;
  let generation = 0;
  createForm.hidden = true;
  editForm.hidden = true;
  document.getElementById('client-edit-cancel').addEventListener('click',()=>{ selected=null; editForm.hidden=true; });
  createForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(workspace.hidden || !canWrite()) return;
    try {
      await createClient(supabase,controller,{name:document.getElementById('client-name').value,phone:document.getElementById('client-phone').value});
      if(workspace.hidden || !canWrite()) return;
      writeStatus.textContent='Cliente cadastrado.';
      createForm.reset();
      button.click();
    } catch { if(!workspace.hidden && canWrite()) writeStatus.textContent='Falha ao cadastrar cliente.'; }
  });
  editForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(workspace.hidden || !canWrite() || !selected) return;
    try {
      await updateClient(supabase,controller,selected,{name:document.getElementById('client-edit-name').value,phone:document.getElementById('client-edit-phone').value});
      if(workspace.hidden || !canWrite()) return;
      selected=null; editForm.hidden=true;
      writeStatus.textContent='Cliente atualizado.';
      button.click();
    } catch { if(!workspace.hidden && canWrite()) writeStatus.textContent='Falha ao atualizar cliente.'; }
  });
  controller.subscribe(({ recovering, internalAccess }) => {
    if (recovering || !internalAccess) {
      generation++;
      list.replaceChildren();
      status.textContent = '';
      selected=null; createForm.hidden=true; editForm.hidden=true; createForm.reset(); editForm.reset(); writeStatus.textContent='';
    }
  });
  button.addEventListener('click', async () => {
    const requestGeneration = ++generation;
    if (workspace.hidden || !controller.state().internalAccess) return;
    button.disabled = true;
    list.replaceChildren();
    status.textContent = 'Consultando clientes...';
    try {
      const clients = await listClients(supabase, controller);
      if (requestGeneration !== generation || workspace.hidden || !controller.state().internalAccess) return;
      createForm.hidden = !canWrite();
      const items = clients.map(client => {
        const item = document.createElement('li');
        item.textContent = client.name;
        if(canWrite()) { const edit=document.createElement('button'); edit.type='button'; edit.textContent='Editar'; edit.addEventListener('click',()=>{ if(!canWrite() || workspace.hidden) return; selected=client.id; document.getElementById('client-edit-name').value=client.name; document.getElementById('client-edit-phone').value=client.phone||''; editForm.hidden=false; }); item.append(edit); }
        return item;
      });
      list.replaceChildren(...items);
      status.textContent = clients.length ? `${clients.length} cliente(s) encontrado(s).` : 'Nenhum cliente cadastrado nesta empresa.';
    } catch {
      if (requestGeneration !== generation || workspace.hidden || !controller.state().internalAccess) return;
      list.replaceChildren();
      status.textContent = 'Consulta indisponível. Verifique o acesso e a conexão.';
    } finally { button.disabled = false; }
  });
}
