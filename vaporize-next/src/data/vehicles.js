/** Read-only vehicles service scoped to the verified active organization. */
export async function listVehicles(supabase, controller, limit = 50, clientId = null) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Invalid page size');
  if (clientId !== null && (typeof clientId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(clientId))) throw new TypeError('Invalid client ID');
  if (!await controller.requireInternalAccess()) throw new Error('Membership required');
  const before = controller.state();
  if (before.recovering || !before.internalAccess || before.organizations.length !== 1) {
    throw new Error('A single active organization is required');
  }
  const organizationId = before.organizations[0].organization_id;
  let query = supabase.schema('vaporize_next')
    .from('vehicles')
    .select('id,client_id,brand,model,plate,created_at')
    .eq('organization_id', organizationId);
  if (clientId !== null) query = query.eq('client_id', clientId);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  const after = controller.state();
  if (after.recovering || !after.internalAccess || after.organizations.length !== 1 ||
      after.organizations[0].organization_id !== organizationId) {
    throw new Error('Access changed during request');
  }
  if (!Array.isArray(data) || data.some(row => !row || typeof row.id !== 'string' ||
      typeof row.client_id !== 'string' || typeof row.brand !== 'string' ||
      typeof row.model !== 'string' || (clientId !== null && row.client_id !== clientId))) {
    throw new Error('Unexpected vehicles response');
  }
  return data;
}
