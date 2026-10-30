/** Vaporize Next — pure appointment planning rules, without database writes. */
export const SLOT_MINUTES = 20;
export const DEFAULT_DURATION_MINUTES = 90;
export const OPENING_TIME = '07:30';
export const TIME_ZONE = 'America/Sao_Paulo';

export function validateAppointmentInput({ startsAt, durationMinutes = DEFAULT_DURATION_MINUTES }) {
  const start = new Date(startsAt);
  if (!Number.isFinite(start.getTime())) throw new RangeError('Invalid appointment start');
  const clock = new Intl.DateTimeFormat('en-GB', {timeZone:TIME_ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(start);
  const [hour,minute] = clock.split(':').map(Number);
  const opening = 7*60+30;
  const minutes = hour*60+minute;
  if (start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0 ||
      minutes < opening || (minutes-opening)%SLOT_MINUTES !== 0) {
    throw new RangeError('Appointment start must follow 20-minute slots from 07:30 Sao Paulo time');
  }
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

/** Interpret an HTML datetime-local value in the business time zone, not the device zone. */
export function saoPauloLocalToDate(localValue) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue ?? '');
  if (!match) throw new RangeError('Invalid local date and time');
  const [, year, month, day, hour, minute] = match.map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(naive);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute) {
    throw new RangeError('Invalid calendar date');
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  });
  const parts = (timestamp) => Object.fromEntries(formatter.formatToParts(timestamp)
    .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  let timestamp = naive;
  for (let attempt = 0; attempt < 4; attempt++) {
    const local = parts(timestamp);
    const seen = Date.UTC(local.year,local.month-1,local.day,local.hour,local.minute);
    const delta = naive - seen;
    if (delta === 0) break;
    timestamp += delta;
  }
  const resolved = parts(timestamp);
  if ([resolved.year,resolved.month,resolved.day,resolved.hour,resolved.minute].join(',') !==
      [year,month,day,hour,minute].join(',')) throw new RangeError('Nonexistent local time');
  return new Date(timestamp);
}

export function saoPauloRecurrence(localValue, {count, intervalDays, durationMinutes = DEFAULT_DURATION_MINUTES}) {
  if (!Number.isInteger(count) || count < 1 || count > 52) throw new RangeError('Invalid occurrence count');
  if (![7,14].includes(intervalDays)) throw new RangeError('Invalid recurrence interval');
  const first = saoPauloLocalToDate(localValue);
  const local = new Intl.DateTimeFormat('sv-SE', {
    timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).format(first).replace(' ','T');
  const [datePart,timePart] = local.split('T');
  const [y,m,d] = datePart.split('-').map(Number);
  return Array.from({length:count}, (_,i) => {
    const day = new Date(Date.UTC(y,m-1,d + i*intervalDays));
    const date = day.toISOString().slice(0,10);
    return validateAppointmentInput({
      startsAt:saoPauloLocalToDate(date+'T'+timePart),durationMinutes
    });
  });
}
