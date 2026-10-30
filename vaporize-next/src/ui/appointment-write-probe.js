import { createAppointment, updateAppointment, cancelAppointment } from '../data/appointments-write.js';
import { saoPauloLocalToDate } from '../scheduling/rules.js';

export function attachAppointmentWriteProbe(supabase, controller, document) {
  const button = document.getElementById('verify-appointment-writes');
  const output = document.getElementById('appointment-write-probe-status');
  const vehicleId = 'aa21e0de-05e3-49f0-b0d5-8f3cb0010101';
  let running = false;
  button.addEventListener('click', async () => {
    if (running) return;
    const state = controller.state();
    if (!state.internalAccess || state.recovering || state.organizations?.length !== 1 ||
        !['owner','manager'].includes(state.organizations[0].membership_role) ||
        document.getElementById('workspace').hidden) {
      output.textContent = 'Perfil sem permissão para escrita; nenhuma operação executada.';
      return;
    }
    running = true;
    button.disabled = true;
    let created = null;
    const results = [];
    try {
      output.textContent = 'Executando teste de escrita na homologação...';
      created = await createAppointment(supabase,controller,{
        vehicle_id:vehicleId,startsAt:saoPauloLocalToDate('2027-03-02T07:30'),durationMinutes:90
      });
      results.push('Criar: OK');
      await updateAppointment(supabase,controller,created.id,{
        startsAt:saoPauloLocalToDate('2027-03-02T07:50')
      });
      results.push('Editar: OK');
      await cancelAppointment(supabase,controller,created.id);
      results.push('Cancelar: OK');
    } catch (error) {
      results.push('Falha na etapa: ' + (results.length === 0 ? 'criar' : results.length === 1 ? 'editar' : 'cancelar') +
        ' (' + (typeof error?.code === 'string' ? error.code : 'sem código') + ')');
      if (created) {
        try {
          await cancelAppointment(supabase,controller,created.id);
          results.push('Limpeza: cancelamento confirmado');
        } catch { results.push('ATENÇÃO: agendamento de teste pode permanecer ativo'); }
      }
    } finally {
      if (controller.state().internalAccess && !controller.state().recovering &&
          !document.getElementById('workspace').hidden) output.textContent = results.join(' | ');
      running = false;
      button.disabled = false;
    }
  });
  controller.subscribe(({recovering,internalAccess}) => {
    if (recovering || !internalAccess) output.textContent = '';
  });
}
