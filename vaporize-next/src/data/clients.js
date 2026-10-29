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


/**
 * Isolated client creation service. Database RLS must independently enforce
 * organization membership; this client-side check is not a substitute for RLS.
 * Not connected to any production UI.
 */
export async function createClient(supabase, controller, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid client');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const phone = input.phone == null ? null : (typeof input.phone === 'string' ? input.phone.trim() : null);
  if (name.length < 2 || name.length > 160) throw new RangeError('Invalid client name');
  if (input.phone != null && (typeof input.phone !== 'string' || phone.length > 40)) throw new RangeError('Invalid client phone');
  if (!await controller.requireInternalAccess()) throw new Error('Membership required');
  const before = controller.state();
  if (before.recovering || !before.internalAccess || before.organizations.length !== 1 ||
      typeof before.organizations[0]?.organization_id !== 'string') {
    throw new Error('A single active organization is required');
  }
  const organizationId = before.organizations[0].organization_id;
  if (!['owner', 'manager'].includes(before.organizations[0].membership_role)) {
    throw new Error('Client creation requires owner or manager role');
  }
  // Recheck immediately before writing; membership can be revoked asynchronously.
  const current = controller.state();
  if (current.recovering || !current.internalAccess || current.organizations.length !== 1 ||
      current.organizations[0].organization_id !== organizationId ||
      !['owner', 'manager'].includes(current.organizations[0].membership_role)) throw new Error('Access changed before write');
  const { data, error } = await supabase.schema('vaporize_next').from('clients')
    .insert({ organization_id: organizationId, name, phone })
    .select('id,name,phone,created_at').single();
  if (error) throw error;
  const after = controller.state();
  if (after.recovering || !after.internalAccess || after.organizations.length !== 1 ||
      after.organizations[0].organization_id !== organizationId ||
      !['owner', 'manager'].includes(after.organizations[0].membership_role)) throw new Error('Access changed during request');
  if (!data || typeof data.id !== 'string' || typeof data.name !== 'string') {
    throw new Error('Unexpected client creation response');
  }
  return data;
}
