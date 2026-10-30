/** Vaporize Next — pure appointment planning rules, without database writes. */
export const SLOT_MINUTES = 20;
export const DEFAULT_DURATION_MINUTES = 90;
export const OPENING_TIME = '07:30';
export const TIME_ZONE = 'America/Sao_Paulo';

export function validateAppointmentInput({ startsAt, durationMinutes = DEFAULT_DURATION_MINUTES }) {
  const start = new Date(startsAt);
  if (!Number.isFinite(start.getTime())) throw new RangeError('Invalid appointment start');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 20 || durationMinutes > 480) {
    throw new RangeError('Invalid appointment duration');
  }
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { starts_at: start.toISOString(), ends_at: end.toISOString() };
}

export function overlaps(a, b) {
  const aStart = Date.parse(a.starts_at), aEnd = Date.parse(a.ends_at);
  const bStart = Date.parse(b.starts_at), bEnd = Date.parse(b.ends_at);
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite) ||
      aEnd <= aStart || bEnd <= bStart) throw new RangeError('Invalid interval');
  return aStart < bEnd && bStart < aEnd;
}

export function findVehicleConflicts(candidate, appointments) {
  return appointments.filter(item =>
    item.vehicle_id === candidate.vehicle_id &&
    item.status !== 'cancelled' &&
    overlaps(candidate, item));
}

export function buildRecurringOccurrences(firstStart, { count, intervalDays, durationMinutes = DEFAULT_DURATION_MINUTES }) {
  if (!Number.isInteger(count) || count < 1 || count > 52) throw new RangeError('Invalid occurrence count');
  if (![7, 14].includes(intervalDays)) throw new RangeError('Only weekly and biweekly recurrence is supported');
  const first = validateAppointmentInput({ startsAt: firstStart, durationMinutes });
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(first.starts_at);
    start.setUTCDate(start.getUTCDate() + i * intervalDays);
    return validateAppointmentInput({ startsAt: start, durationMinutes });
  });
}
