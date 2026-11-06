import { describe, expect, it } from "vitest";
import { buildAgendaPatch, assertUnchangedStart } from "./persistence-contract";
const id = "11111111-1111-4111-8111-111111111111";
const base = {
  organizationId: id, appointmentId: id, vehicleId: id,
  expectedStartsAt: "2026-11-12T10:30:00.000Z",
  startsAt: "2026-11-12T11:00:00.000Z",
  endsAt: "2026-11-12T12:30:00.000Z"
};
describe("agenda persistence contract", () => {
  it("produces a tenant-scoped update payload", () => {
    expect(buildAgendaPatch(base)).toMatchObject({
      organization_id: id, id, vehicle_id: id,
      starts_at: "2026-11-12T11:00:00.000Z"
    });
  });
  it("rejects invalid intervals", () => {
    expect(() => buildAgendaPatch({ ...base, endsAt: base.startsAt })).toThrow();
  });
  it("rejects invalid tenant identity", () => {
    expect(() => buildAgendaPatch({ ...base, organizationId: "wrong" })).toThrow();
  });
  it("detects stale edit attempts", () => {
    expect(() => assertUnchangedStart("2026-11-12T11:00:00.000Z", base.expectedStartsAt)).toThrow();
    expect(() => assertUnchangedStart(base.expectedStartsAt, base.expectedStartsAt)).not.toThrow();
  });
});
