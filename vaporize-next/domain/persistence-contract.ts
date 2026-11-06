/**
 * Database-agnostic, tenant-scoped write contract for agenda persistence.
 * The server must run the command in a transaction, under an authenticated
 * owner/manager identity, and recheck constraints in Postgres.
 */
export type AgendaWrite = {
  organizationId: string;
  appointmentId: string;
  vehicleId: string;
  expectedStartsAt: string;
  startsAt: string;
  endsAt: string;
};
export type AgendaPatch = {
  id: string;
  organization_id: string;
  vehicle_id: string;
  starts_at: string;
  ends_at: string;
};
export function buildAgendaPatch(write: AgendaWrite): AgendaPatch {
  for (const field of ["organizationId", "appointmentId", "vehicleId"] as const) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(write[field]))
      throw new Error(`Invalid ${field}`);
  }
  for (const key of ["expectedStartsAt", "startsAt", "endsAt"] as const) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(write[key]) ||
        !Number.isFinite(Date.parse(write[key])))
      throw new Error(`Invalid ${key}`);
  }
  if (Date.parse(write.endsAt) <= Date.parse(write.startsAt))
    throw new Error("Appointment must have positive duration");
  return {
    id: write.appointmentId,
    organization_id: write.organizationId,
    vehicle_id: write.vehicleId,
    starts_at: write.startsAt,
    ends_at: write.endsAt
  };
}
/** Compare-and-swap guard; a changed original start time requires user reload. */
export function assertUnchangedStart(currentStart: string, expectedStart: string): void {
  if (Date.parse(currentStart) !== Date.parse(expectedStart))
    throw new Error("Concurrent appointment change detected");
}
