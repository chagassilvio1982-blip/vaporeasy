/** Read-only tenant-scoped clients service. Never accepts an organization from the browser form. */
export async function listClients(supabase, controller, limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Invalid page size');
  // Revalidate server-backed membership on each request.
  if (!await controller.requireInternalAccess()) throw new Error('Membership required');
  const state = controller.state();
  if (state.recovering || !state.internalAccess || state.organizations.length !== 1) {
    throw new Error('A single active organization is required');
  }
  const organizationId = state.organizations[0].organization_id;
  const { data, error } = await supabase.schema('vaporize_next')
    .from('clients').select('id,name,phone,created_at')
    .eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  // Fail closed if the session changed while the request was in flight.
  const after = controller.state();
  if (after.recovering || !after.internalAccess ||
      after.organizations.length !== 1 ||
      after.organizations[0].organization_id !== organizationId) {
    throw new Error('Access changed during request');
  }
  if (!Array.isArray(data) || data.some(row => !row || typeof row.id !== 'string' || typeof row.name !== 'string')) {
    throw new Error('Unexpected clients response');
  }
  return data;
}
