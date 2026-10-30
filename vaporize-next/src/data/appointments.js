/** Read-only appointments for one verified tenant, ordered by start time. */
export async function listAppointments(supabase, controller, limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Invalid page size');
  if (!await controller.requireInternalAccess()) throw new Error('Membership required');
  const before = controller.state();
  if (before.recovering || !before.internalAccess || before.organizations.length !== 1) {
    throw new Error('A single active organization is required');
  }
  const organizationId = before.organizations[0].organization_id;
  const { data, error } = await supabase.schema('vaporize_next')
    .from('appointments')
    .select('id,organization_id,vehicle_id,starts_at,ends_at,status')
    .eq('organization_id', organizationId)
    .order('starts_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  const after = controller.state();
  if (after.recovering || !after.internalAccess || after.organizations.length !== 1 ||
      after.organizations[0].organization_id !== organizationId) {
    throw new Error('Access changed during request');
  }
  if (!Array.isArray(data) || data.some(row => !row || typeof row.id !== 'string' ||
      row.organization_id !== organizationId || typeof row.vehicle_id !== 'string' || typeof row.starts_at !== 'string' ||
      typeof row.ends_at !== 'string' || typeof row.status !== 'string')) {
    throw new Error('Unexpected appointments response');
  }
  return data;
}
