/**
 * Pure edit planner. The persistence layer must execute the returned commands
 * atomically and check revision/version, permissions, conflicts and audit log.
 * Never updates paid services or invoices as a side effect of moving an event.
 */
export type Appointment = {
  id: string;
  seriesId: string | null;
  startsAt: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
};
export type EditScope = "occurrence" | "following" | "series";
export type EditPlan = {
  targetIds: string[];
  detachedIds: string[];
  requiresNewSeries: boolean;
};
export function planRecurringEdit(
  appointments: readonly Appointment[],
  selectedId: string,
  scope: EditScope
): EditPlan {
  const selected = appointments.find(a => a.id === selectedId);
  if (!selected) throw new Error("Appointment not found");
  if (selected.status !== "scheduled") throw new Error("Only scheduled appointments can be rescheduled");
  if (!selected.seriesId && scope !== "occurrence") throw new Error("Appointment has no recurrence series");
  const series = appointments.filter(a => a.seriesId === selected.seriesId && selected.seriesId !== null);
  const target = scope === "occurrence" ? [selected] :
    series.filter(a => scope === "series" || a.startsAt >= selected.startsAt);
  if (target.some(a => a.status !== "scheduled"))
    throw new Error("Series includes non-editable appointments; use an explicit exception workflow");
  const ids = target.map(a => a.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate appointment IDs");
  return {
    targetIds: ids,
    detachedIds: scope === "occurrence" && selected.seriesId ? [selected.id] : [],
    requiresNewSeries: scope === "following"
  };
}
