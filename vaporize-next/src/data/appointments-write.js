import { validateAppointmentInput, findVehicleConflicts } from '../scheduling/rules.js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function organization(controller) {
  if (!await controller.requireInternalAccess()) throw new Error('Membership required');
  const state = controller.state();
  if (state.recovering || !state.internalAccess || state.organizations?.length !== 1) throw new Error('Organization required');
  const org = state.organizations[0];
  if (!['owner', 'manager'].includes(org.membership_role) || !uuid.test(org.organization_id)) throw new Error('Insufficient role');
  return org.organization_id;
}
function verify(controller, id) {
  const state = controller.state();
  if (state.recovering || !state.internalAccess || state.organizations?.length !== 1 ||
      state.organizations[0].organization_id !== id ||
      !['owner','manager'].includes(state.organizations[0].membership_role)) throw new Error('Access changed');
}
/** Guarded appointment creation; database must enforce RLS and overlap constraints independently. */
export async function createAppointment(supabase, controller, input) {
  if (!uuid.test(input?.vehicle_id ?? '')) throw new TypeError('Invalid vehicle');
  const interval = validateAppointmentInput({ startsAt: input.startsAt, durationMinutes: input.durationMinutes });
  const id = await organization(controller);
  verify(controller, id);
  const { data: existing, error: readError } = await supabase.schema('vaporize_next').from('appointments')
    .select('vehicle_id,starts_at,ends_at,status').eq('organization_id', id)
    .eq('vehicle_id', input.vehicle_id).lt('starts_at', interval.ends_at)
    .gt('ends_at', interval.starts_at).neq('status', 'cancelled');
  if (readError) throw readError;
  if (findVehicleConflicts({ ...interval, vehicle_id: input.vehicle_id }, existing ?? []).length) {
    throw new Error('Vehicle schedule conflict');
  }
  verify(controller, id);
  const { data, error } = await supabase.schema('vaporize_next').from('appointments')
    .insert({ organization_id:id, vehicle_id:input.vehicle_id, ...interval, status:'scheduled' })
    .select('id,organization_id,vehicle_id,starts_at,ends_at,status').single();
  if (error) throw error;
  verify(controller, id);
  if (data?.organization_id !== id || data.vehicle_id !== input.vehicle_id) throw new Error('Unexpected appointment response');
  return data;
}
