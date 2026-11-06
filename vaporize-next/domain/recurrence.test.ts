import { describe, expect, it } from "vitest";
import { recurrenceDates } from "./recurrence";

describe("Vaporize Next recurring calendar", () => {
  it("preserves second Thursday across October and November 2026", () => {
    expect(recurrenceDates("2026-10-08", "2026-12-31", {
      kind: "monthly_nth_weekday", intervalMonths: 1
    })).toEqual(["2026-10-08", "2026-11-12", "2026-12-10"]);
  });
  it("does not change weekdays in weekly series", () => {
    expect(recurrenceDates("2026-10-01", "2026-10-22", {
      kind: "weekly", intervalWeeks: 1
    })).toEqual(["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"]);
  });
  it("handles fortnightly scheduling", () => {
    expect(recurrenceDates("2026-10-01", "2026-10-31", {
      kind: "weekly", intervalWeeks: 2
    })).toEqual(["2026-10-01", "2026-10-15", "2026-10-29"]);
  });
  it("skips fifth weekday when absent", () => {
    expect(recurrenceDates("2026-10-29", "2026-12-31", {
      kind: "monthly_nth_weekday", intervalMonths: 1
    })).toEqual(["2026-10-29", "2026-12-31"]);
  });
  it("supports fixed day with end-of-month clamping", () => {
    expect(recurrenceDates("2026-01-31", "2026-03-31", {
      kind: "monthly_day", intervalMonths: 1, overflow: "last_day"
    })).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  it("supports skipping nonexistent day-of-month", () => {
    expect(recurrenceDates("2026-01-31", "2026-03-31", {
      kind: "monthly_day", intervalMonths: 1, overflow: "skip"
    })).toEqual(["2026-01-31", "2026-03-31"]);
  });
  it("supports exception dates", () => {
    expect(recurrenceDates("2026-10-08", "2026-11-30", {
      kind: "monthly_nth_weekday", intervalMonths: 1
    }, new Set(["2026-11-12"]))).toEqual(["2026-10-08"]);
  });
  it("rejects invalid dates and intervals", () => {
    expect(() => recurrenceDates("2026-02-30", "2026-03-01", {
      kind: "weekly", intervalWeeks: 1
    })).toThrow();
    expect(() => recurrenceDates("2026-10-01", "2026-12-01", {
      kind: "weekly", intervalWeeks: 0
    })).toThrow();
  });
});
