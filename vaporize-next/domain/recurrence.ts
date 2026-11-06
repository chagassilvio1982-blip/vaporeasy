/**
 * Pure recurrence calculator for Vaporize Next.
 * Civil dates are processed in America/Sao_Paulo calendar terms, not by adding
 * 24-hour milliseconds to UTC timestamps. No database writes.
 *
 * A monthly weekday recurrence keeps the ordinal weekday of the anchor date:
 * e.g. second Thursday stays second Thursday, never "same day-of-month".
 */
export type Recurrence =
  | { kind: "weekly"; intervalWeeks: number }
  | { kind: "monthly_nth_weekday"; intervalMonths: number }
  | { kind: "monthly_day"; intervalMonths: number; overflow: "skip" | "last_day" };

function dateParts(iso: string): [number, number, number] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Invalid civil date");
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
    throw new Error("Invalid civil date");
  return [y, m, d];
}
function isoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function weekday(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function monthOffset(y: number, m: number, offset: number): [number, number] {
  const z = y * 12 + (m - 1) + offset;
  return [Math.floor(z / 12), ((z % 12) + 12) % 12 + 1];
}
/** Inclusive bounds, max 500 occurrences to avoid runaway generation. */
export function recurrenceDates(
  anchor: string,
  until: string,
  rule: Recurrence,
  exceptions: ReadonlySet<string> = new Set()
): string[] {
  const [y, m, d] = dateParts(anchor);
  dateParts(until);
  if (until < anchor) return [];
  const interval = rule.kind === "weekly" ? rule.intervalWeeks : rule.intervalMonths;
  if (!Number.isSafeInteger(interval) || interval < 1 || interval > 120)
    throw new Error("Invalid recurrence interval");
  const out: string[] = [];
  const add = (value: string) => {
    if (value <= until && !exceptions.has(value)) out.push(value);
  };
  if (rule.kind === "weekly") {
    const base = Date.UTC(y, m - 1, d);
    for (let i = 0; i < 500; i++) {
      const dt = new Date(base + i * interval * 7 * 86400000);
      const value = isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      if (value > until) break;
      add(value);
    }
  } else {
    const ordinal = Math.floor((d - 1) / 7);
    const wd = weekday(y, m, d);
    for (let i = 0; i < 500; i++) {
      const [yy, mm] = monthOffset(y, m, i * interval);
      let day: number;
      if (rule.kind === "monthly_nth_weekday") {
        day = 1 + ((wd - weekday(yy, mm, 1) + 7) % 7) + ordinal * 7;
        if (day > daysInMonth(yy, mm)) continue; // e.g. fifth Thursday absent
      } else {
        if (d > daysInMonth(yy, mm) && rule.overflow === "skip") continue;
        day = Math.min(d, daysInMonth(yy, mm));
      }
      const value = isoDate(yy, mm, day);
      if (value > until) break;
      add(value);
    }
  }
  return out;
}
