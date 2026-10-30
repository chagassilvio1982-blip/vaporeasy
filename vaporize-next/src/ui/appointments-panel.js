import { listAppointments } from '../data/appointments.js';
import { validateAppointmentInput, saoPauloLocalToDate, saoPauloRecurrence } from '../scheduling/rules.js';

export function attachAppointmentsPanel(supabase, controller, document) {
  const button = document.getElementById('load-appointments');
  const list = document.getElementById('appointments-list');
  const status = document.getElementById('appointments-status');
  const workspace = document.getElementById('workspace');
  const planForm = document.getElementById('appointment-plan-form');
  const planList = document.getElementById('appointment-plan-list');
  const planStatus = document.getElementById('appointment-plan-status');
  let generation = 0;
  planForm.addEventListener('submit', event => {
    event.preventDefault();
    planList.replaceChildren();
    if (workspace.hidden || !controller.state().internalAccess || controller.state().recovering) return;
    try {
      const localStart = document.getElementById('appointment-plan-start').value;
      if (!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(localStart)) throw new RangeError('Invalid date');
      const start = saoPauloLocalToDate(localStart);
      const durationMinutes = Number(document.getElementById('appointment-plan-duration').value);
      const interval = document.getElementById('appointment-plan-recurrence').value;
      const count = Number(document.getElementById('appointment-plan-count').value);
      const occurrences = interval === 'none' ? (count === 1 ? [validateAppointmentInput({startsAt:start, durationMinutes})] : (() => {throw new RangeError('Single appointment must have count 1');})()) : saoPauloRecurrence(localStart,{count,intervalDays:Number(interval),durationMinutes});
      const items = occurrences.map((slot) => {
        const item = document.createElement('li');
        item.textContent = `${new Date(slot.starts_at).toLocaleString('pt-BR')} — ${new Date(slot.ends_at).toLocaleString('pt-BR')}`;
        return item;
      });
      planList.replaceChildren(...items);
      planStatus.textContent = `${occurrences.length} horário(s) simulados. Nenhum agendamento foi salvo.`;
    } catch { planStatus.textContent = 'Não foi possível simular. Confira data, duração e recorrência.'; }
  });
  controller.subscribe(({ recovering, internalAccess }) => {
    if (recovering || !internalAccess) {
      generation++;
      list.replaceChildren();
      status.textContent = '';
      planList.replaceChildren();
      planStatus.textContent = '';
      planForm.reset();
    }
  });
  button.addEventListener('click', async () => {
    const requestGeneration = ++generation;
    if (workspace.hidden || !controller.state().internalAccess) return;
    button.disabled = true;
    list.replaceChildren();
    status.textContent = 'Consultando agendamentos...';
    try {
      const appointments = await listAppointments(supabase, controller);
      if (requestGeneration !== generation || workspace.hidden || !controller.state().internalAccess) return;
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
      if (requestGeneration !== generation || workspace.hidden || !controller.state().internalAccess) return;
      list.replaceChildren();
      status.textContent = 'Consulta indisponível. Verifique o acesso e a conexão.';
    } finally { button.disabled = false; }
  });
}
