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

/** Update a scheduled appointment, preserving organization and vehicle isolation. */
export async function updateAppointment(supabase,controller,appointmentId,input) {
  if (!uuid.test(appointmentId)) throw new TypeError('Invalid appointment');
  const id = await organization(controller);
  const {data:current,error:readError} = await supabase.schema('vaporize_next').from('appointments')
    .select('id,organization_id,vehicle_id,starts_at,ends_at,status')
    .eq('organization_id',id).eq('id',appointmentId).single();
  if (readError) throw readError;
  if (current?.organization_id !== id || current.status !== 'scheduled') throw new Error('Appointment not editable');
  const vehicleId = input?.vehicle_id ?? current.vehicle_id;
  if (!uuid.test(vehicleId)) throw new TypeError('Invalid vehicle');
  const duration = input?.durationMinutes ??
    Math.round((Date.parse(current.ends_at)-Date.parse(current.starts_at))/60000);
  const interval = validateAppointmentInput({startsAt:input?.startsAt ?? current.starts_at,durationMinutes:duration});
  const {data:existing,error:conflictError} = await supabase.schema('vaporize_next').from('appointments')
    .select('id,vehicle_id,starts_at,ends_at,status').eq('organization_id',id).eq('vehicle_id',vehicleId)
    .neq('id',appointmentId).lt('starts_at',interval.ends_at).gt('ends_at',interval.starts_at)
    .neq('status','cancelled');
  if (conflictError) throw conflictError;
  if (findVehicleConflicts({...interval,vehicle_id:vehicleId},existing ?? []).length) throw new Error('Vehicle schedule conflict');
  verify(controller,id);
  const {data,error} = await supabase.schema('vaporize_next').from('appointments')
    .update({...interval,vehicle_id:vehicleId}).eq('organization_id',id).eq('id',appointmentId)
    .eq('status','scheduled').select('id,organization_id,vehicle_id,starts_at,ends_at,status').single();
  if (error) throw error;
  verify(controller,id);
  if (data?.id !== appointmentId || data.organization_id !== id) throw new Error('Unexpected update response');
  return data;
}

/** Cancel an appointment without deleting its record. */
export async function cancelAppointment(supabase,controller,appointmentId) {
  if (!uuid.test(appointmentId)) throw new TypeError('Invalid appointment');
  const id = await organization(controller);
  verify(controller,id);
  const {data,error} = await supabase.schema('vaporize_next').from('appointments')
    .update({status:'cancelled'}).eq('organization_id',id).eq('id',appointmentId)
    .eq('status','scheduled').select('id,organization_id,status').single();
  if (error) throw error;
  verify(controller,id);
  if (data?.id !== appointmentId || data.organization_id !== id || data.status !== 'cancelled')
    throw new Error('Unexpected cancellation response');
  return data;
}
