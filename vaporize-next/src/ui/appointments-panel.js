import { listAppointments } from '../data/appointments.js';

export function attachAppointmentsPanel(supabase, controller, document) {
  const button = document.getElementById('load-appointments');
  const list = document.getElementById('appointments-list');
  const status = document.getElementById('appointments-status');
  const workspace = document.getElementById('workspace');
  button.addEventListener('click', async () => {
    if (workspace.hidden || !controller.state().internalAccess) return;
    button.disabled = true;
    list.replaceChildren();
    status.textContent = 'Consultando agendamentos...';
    try {
      const appointments = await listAppointments(supabase, controller);
      if (workspace.hidden || !controller.state().internalAccess) return;
      const items = appointments.map(appointment => {
        const item = document.createElement('li');
        const start = new Date(appointment.starts_at);
        const end = new Date(appointment.ends_at);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
          throw new Error('Invalid appointment dates');
        }
        item.textContent = `${start.toLocaleString('pt-BR')} — ${end.toLocaleString('pt-BR')} | ${appointment.status}`;
        return item;
      });
      list.replaceChildren(...items);
      status.textContent = appointments.length ? `${appointments.length} agendamento(s) encontrado(s).` : 'Nenhum agendamento cadastrado nesta empresa.';
    } catch {
      list.replaceChildren();
      status.textContent = 'Consulta indisponível. Verifique o acesso e a conexão.';
    } finally { button.disabled = false; }
  });
}
