/**
 * Tenant-scoped, pure input validation. Authorization and concurrency checks
 * must also run in a single server-side database transaction.
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
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
function parseInstant(value: string): number {
  if (!instant.test(value)) throw new Error("Invalid ISO timestamp");
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !==
      (value.includes(".") ? value : value.replace("Z", ".000Z")))
    throw new Error("Invalid ISO timestamp");
  return timestamp;
}
function assertLocalSlot(startsAt: string): void {
  const date = new Date(parseInstant(startsAt));
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
    second: "2-digit", hourCycle: "h23"
  }).formatToParts(date).map(p => [p.type, p.value]));
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  if (Number(parts.second) !== 0 || date.getUTCMilliseconds() !== 0 ||
      minuteOfDay < 450 || (minuteOfDay - 450) % 20 !== 0)
    throw new Error("Start must follow 07:30 + 20-minute São Paulo slots");
}
export function buildAgendaPatch(write: AgendaWrite): AgendaPatch {
  for (const key of ["organizationId", "appointmentId", "vehicleId"] as const) {
    if (!uuid.test(write[key])) throw new Error(`Invalid ${key}`);
  }
  parseInstant(write.expectedStartsAt);
  const start = parseInstant(write.startsAt);
  const end = parseInstant(write.endsAt);
  if (end <= start) throw new Error("Appointment must have positive duration");
  assertLocalSlot(write.startsAt);
  return {
    id: write.appointmentId,
    organization_id: write.organizationId,
    vehicle_id: write.vehicleId,
    starts_at: write.startsAt,
    ends_at: write.endsAt
  };
}
export function assertUnchangedStart(currentStart: string, expectedStart: string): void {
  if (parseInstant(currentStart) !== parseInstant(expectedStart))
    throw new Error("Concurrent appointment change detected");
}
