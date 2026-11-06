import { describe, expect, it } from "vitest";
import { planRecurringEdit, type Appointment } from "./edit-plan";
const items: Appointment[] = [
  { id: "oct", seriesId: "s1", startsAt: "2026-10-08T11:00:00Z", status: "completed" },
  { id: "nov", seriesId: "s1", startsAt: "2026-11-12T11:00:00Z", status: "scheduled" },
  { id: "dec", seriesId: "s1", startsAt: "2026-12-10T11:00:00Z", status: "scheduled" }
];
describe("recurrence editing plan", () => {
  it("edits one occurrence without moving others", () => {
    expect(planRecurringEdit(items, "nov", "occurrence")).toEqual({
      targetIds: ["nov"], detachedIds: ["nov"], requiresNewSeries: false
    });
  });
  it("edits future occurrences without rewriting completed history", () => {
    expect(planRecurringEdit(items, "nov", "following")).toEqual({
      targetIds: ["nov", "dec"], detachedIds: [], requiresNewSeries: true
    });
  });
  it("blocks rewriting a completed occurrence in entire series", () => {
    expect(() => planRecurringEdit(items, "nov", "series")).toThrow();
  });
  it("rejects editing completed appointments", () => {
    expect(() => planRecurringEdit(items, "oct", "occurrence")).toThrow();
  });
  it("rejects unknown appointments", () => {
    expect(() => planRecurringEdit(items, "missing", "occurrence")).toThrow();
  });
});
