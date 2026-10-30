const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function context(controller) {
  if (!await controller.requireInternalAccess()) throw new Error('Membership required');
  const state = controller.state();
  if (state.recovering || !state.internalAccess || state.organizations?.length !== 1) throw new Error('A single active organization is required');
  const org = state.organizations[0];
  if (!['owner','manager'].includes(org.membership_role) || !uuid.test(org.organization_id)) throw new Error('Owner or manager role required');
  return org.organization_id;
}
function check(controller, organizationId) {
  const state = controller.state();
  const org = state.organizations?.[0];
  if (state.recovering || !state.internalAccess || state.organizations?.length !== 1 ||
      org.organization_id !== organizationId || !['owner','manager'].includes(org.membership_role)) throw new Error('Access changed during write');
}
function value(input, key, max, required = true) {
  const raw = input?.[key];
  if (!required && (raw === null || raw === undefined || raw === '')) return null;
  if (typeof raw !== 'string') throw new TypeError('Invalid ' + key);
  const result = raw.trim();
  if ((required && !result) || result.length > max) throw new RangeError('Invalid ' + key);
  return result;
}
export async function createVehicle(supabase, controller, input) {
  const clientId = input?.client_id;
  if (typeof clientId !== 'string' || !uuid.test(clientId)) throw new TypeError('Invalid client ID');
  const brand = value(input, 'brand', 100);
  const model = value(input, 'model', 100);
  const plate = value(input, 'plate', 16, false);
  const organizationId = await context(controller);
  check(controller, organizationId);
  const {data,error} = await supabase.schema('vaporize_next').from('vehicles')
    .insert({organization_id:organizationId,client_id:clientId,brand,model,plate})
    .select('id,organization_id,client_id,brand,model,plate,created_at').single();
  if (error) throw error;
  check(controller, organizationId);
  if (!data || data.organization_id !== organizationId || data.client_id !== clientId || typeof data.id !== 'string') throw new Error('Unexpected vehicle response');
  return data;
}
export async function updateVehicle(supabase, controller, vehicleId, input) {
  if (typeof vehicleId !== 'string' || !uuid.test(vehicleId)) throw new TypeError('Invalid vehicle ID');
  const patch = {};
  for (const key of ['brand','model','plate']) if (Object.hasOwn(input ?? {}, key)) patch[key] = value(input, key, key === 'plate' ? 16 : 100, key !== 'plate');
  if (!Object.keys(patch).length) throw new Error('No editable fields');
  const organizationId = await context(controller);
  check(controller, organizationId);
  const {data,error} = await supabase.schema('vaporize_next').from('vehicles')
    .update(patch).eq('organization_id',organizationId).eq('id',vehicleId)
    .select('id,organization_id,client_id,brand,model,plate,created_at').single();
  if (error) throw error;
  check(controller, organizationId);
  if (!data || data.organization_id !== organizationId || data.id !== vehicleId) throw new Error('Unexpected vehicle response');
  return data;
}
export async function updateClient(supabase, controller, clientId, input) {
  if (typeof clientId !== 'string' || !uuid.test(clientId)) throw new TypeError('Invalid client ID');
  const patch = {};
  if (Object.hasOwn(input ?? {}, 'name')) {
    patch.name = value(input,'name',160);
    if (patch.name.length < 2) throw new RangeError('Invalid name');
  }
  if (Object.hasOwn(input ?? {}, 'phone')) patch.phone = value(input,'phone',40,false);
  if (!Object.keys(patch).length) throw new Error('No editable fields');
  const organizationId = await context(controller);
  check(controller, organizationId);
  const {data,error} = await supabase.schema('vaporize_next').from('clients')
    .update(patch).eq('organization_id',organizationId).eq('id',clientId)
    .select('id,organization_id,name,phone,created_at').single();
  if (error) throw error;
  check(controller, organizationId);
  if (!data || data.organization_id !== organizationId || data.id !== clientId) throw new Error('Unexpected client response');
  return data;
}
