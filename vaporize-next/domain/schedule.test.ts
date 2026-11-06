import { describe, expect, it } from "vitest";
import { saoPauloInstant, scheduleOccurrences } from "./schedule";
describe("São Paulo appointment time conversion", () => {
  it("converts 07:30 local to 10:30 UTC", () => {
    expect(saoPauloInstant("2026-11-12", "07:30")).toBe("2026-11-12T10:30:00.000Z");
  });
  it("preserves local hour and weekday on monthly Thursday recurrence", () => {
    expect(scheduleOccurrences({
      anchorDate: "2026-10-08", untilDate: "2026-12-31",
      localStart: "07:30", durationMinutes: 90,
      rule: { kind: "monthly_nth_weekday", intervalMonths: 1 }
    })).toEqual([
      { civilDate: "2026-10-08", startsAt: "2026-10-08T10:30:00.000Z", endsAt: "2026-10-08T12:00:00.000Z" },
      { civilDate: "2026-11-12", startsAt: "2026-11-12T10:30:00.000Z", endsAt: "2026-11-12T12:00:00.000Z" },
      { civilDate: "2026-12-10", startsAt: "2026-12-10T10:30:00.000Z", endsAt: "2026-12-10T12:00:00.000Z" }
    ]);
  });
  it("rejects invalid duration and local date", () => {
    expect(() => saoPauloInstant("2026-02-30", "07:30")).toThrow();
    expect(() => scheduleOccurrences({
      anchorDate: "2026-10-08", untilDate: "2026-11-30",
      localStart: "07:30", durationMinutes: 0,
      rule: { kind: "monthly_nth_weekday", intervalMonths: 1 }
    })).toThrow();
  });
});
