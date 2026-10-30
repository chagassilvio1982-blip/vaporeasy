import { listAppointments } from '../data/appointments.js';
import { listVehicles } from '../data/vehicles.js';
import { createAppointment } from '../data/appointments-write.js';
import { validateAppointmentInput, saoPauloLocalToDate, saoPauloRecurrence } from '../scheduling/rules.js';

export function attachAppointmentsPanel(supabase, controller, document) {
  const button = document.getElementById('load-appointments');
  const list = document.getElementById('appointments-list');
  const status = document.getElementById('appointments-status');
  const workspace = document.getElementById('workspace');
  const planForm = document.getElementById('appointment-plan-form');
  const planList = document.getElementById('appointment-plan-list');
  const planStatus = document.getElementById('appointment-plan-status');
  const formatBusinessTime = value => new Date(value).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'});
  const createForm = document.getElementById('appointment-create-form');
  const vehicleSelect = document.getElementById('appointment-vehicle');
  const writeStatus = document.getElementById('appointment-write-status');
  const canWrite = () => {
    const state = controller.state();
    return !state.recovering && state.internalAccess && state.organizations?.length === 1 &&
      ['owner','manager'].includes(state.organizations[0].membership_role);
  };
  let generation = 0;
  planForm.addEventListener('change', () => {
    createForm.hidden = true;
    writeStatus.textContent = '';
  });
  planForm.addEventListener('submit', async () => {
    createForm.hidden = true;
    if (!canWrite() || workspace.hidden ||
        document.getElementById('appointment-plan-recurrence').value !== 'none' ||
        document.getElementById('appointment-plan-count').value !== '1') return;
    const requestGeneration = generation;
    try {
      const vehicles = await listVehicles(supabase,controller,100);
      if (requestGeneration !== generation || !canWrite() || workspace.hidden) return;
      const options = vehicles.map(vehicle => {
        const option = document.createElement('option');
        option.value = vehicle.id;
        option.textContent = [vehicle.brand,vehicle.model,vehicle.plate].filter(Boolean).join(' — ');
        return option;
      });
      vehicleSelect.replaceChildren(...options);
      createForm.hidden = options.length === 0;
      if (!options.length) writeStatus.textContent = 'Cadastre um veículo antes de salvar um agendamento.';
    } catch { if (!workspace.hidden && canWrite()) writeStatus.textContent = 'Não foi possível carregar veículos.'; }
  });
  createForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (workspace.hidden || !canWrite() || !vehicleSelect.value) return;
    const submit = createForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    writeStatus.textContent = 'Salvando agendamento...';
    try {
      const startsAt = saoPauloLocalToDate(document.getElementById('appointment-plan-start').value);
      const durationMinutes = Number(document.getElementById('appointment-plan-duration').value);
      await createAppointment(supabase,controller,{vehicle_id:vehicleSelect.value,startsAt,durationMinutes});
      if (workspace.hidden || !canWrite()) return;
      writeStatus.textContent = 'Agendamento cadastrado.';
      createForm.hidden = true;
      button.click();
    } catch (error) {
      if (!workspace.hidden && canWrite()) writeStatus.textContent =
        error?.message === 'Vehicle schedule conflict' || error?.code === '23P01'
          ? 'Conflito: veículo já possui atendimento neste horário.'
          : 'Não foi possível salvar. Verifique permissões e conexão.';
    } finally { submit.disabled = false; }
  });
  planForm.addEventListener('submit', event => {
    event.preventDefault();
    planList.replaceChildren();
    if (workspace.hidden || !controller.state().internalAccess || controller.state().recovering) return;
    try {
      const localStart = document.getElementById('appointment-plan-start').value;
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localStart)) throw new RangeError('Invalid date');
      const start = saoPauloLocalToDate(localStart);
      const durationMinutes = Number(document.getElementById('appointment-plan-duration').value);
      const interval = document.getElementById('appointment-plan-recurrence').value;
      const count = Number(document.getElementById('appointment-plan-count').value);
      const occurrences = interval === 'none' ? (count === 1 ? [validateAppointmentInput({startsAt:start, durationMinutes})] : (() => {throw new RangeError('Single appointment must have count 1');})()) : saoPauloRecurrence(localStart,{count,intervalDays:Number(interval),durationMinutes});
      const items = occurrences.map((slot) => {
        const item = document.createElement('li');
        item.textContent = `${formatBusinessTime(slot.starts_at)} — ${formatBusinessTime(slot.ends_at)}`;
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
      createForm.hidden = true;
      vehicleSelect.replaceChildren();
      writeStatus.textContent = '';
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
        item.textContent = `${formatBusinessTime(start)} — ${formatBusinessTime(end)} | ${appointment.status}`;
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
