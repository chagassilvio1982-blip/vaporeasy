import { recurrenceDates, type Recurrence } from "./recurrence";

export type ScheduledOccurrence = {
  civilDate: string;
  startsAt: string;
  endsAt: string;
};
export type RecurrenceSchedule = {
  anchorDate: string;
  untilDate: string;
  localStart: string; // HH:mm, Sao Paulo wall clock
  durationMinutes: number;
  rule: Recurrence;
  exceptions?: ReadonlySet<string>;
};

/**
 * Convert a São Paulo civil date and wall-clock time to an absolute instant.
 * Since 2019 Brazil does not observe DST; using Intl detects future changes
 * rather than assuming an eternal fixed UTC offset.
 */
export function saoPauloInstant(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Invalid date/time");
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const candidate = new Date(Date.UTC(y, m - 1, d, h, min));
  if (candidate.getUTCFullYear() !== y || candidate.getUTCMonth() !== m - 1 || candidate.getUTCDate() !== d)
    throw new Error("Invalid civil date");
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });
  // Search all possible offsets (UTC-12 through UTC+14) in 15 minute steps.
  // Reject nonexistent/ambiguous local times rather than silently moving them.
  const matches: string[] = [];
  for (let offset = -12 * 60; offset <= 14 * 60; offset += 15) {
    const instant = new Date(candidate.getTime() - offset * 60000);
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
    if (Number(parts.year) === y && Number(parts.month) === m &&
        Number(parts.day) === d && Number(parts.hour) === h && Number(parts.minute) === min)
      matches.push(instant.toISOString());
  }
  if (matches.length !== 1) throw new Error("Ambiguous or nonexistent local time");
  return matches[0];
}
export function scheduleOccurrences(input: RecurrenceSchedule): ScheduledOccurrence[] {
  if (!Number.isSafeInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 1440)
    throw new Error("Invalid duration");
  return recurrenceDates(input.anchorDate, input.untilDate, input.rule, input.exceptions)
    .map(civilDate => {
      const startsAt = saoPauloInstant(civilDate, input.localStart);
      const endsAt = new Date(Date.parse(startsAt) + input.durationMinutes * 60000).toISOString();
      return { civilDate, startsAt, endsAt };
    });
}
