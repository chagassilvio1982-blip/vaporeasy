import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOT_MINUTES, DEFAULT_DURATION_MINUTES, OPENING_TIME, validateAppointmentInput, overlaps, findVehicleConflicts, buildRecurringOccurrences, saoPauloLocalToDate, saoPauloRecurrence } from '../src/scheduling/rules.js';

test('schedule defaults are stable', () => {
  assert.equal(SLOT_MINUTES, 20);
  assert.equal(DEFAULT_DURATION_MINUTES, 90);
  assert.equal(OPENING_TIME, '07:30');
});
test('appointment interval defaults to 90 minutes', () => {
  assert.deepEqual(validateAppointmentInput({startsAt:'2026-11-02T10:30:00Z'}), {
    starts_at:'2026-11-02T10:30:00.000Z', ends_at:'2026-11-02T12:00:00.000Z'
  });
});
test('rejects invalid dates and durations', () => {
  assert.throws(() => validateAppointmentInput({startsAt:'invalid'}), RangeError);
  assert.throws(() => validateAppointmentInput({startsAt:'2026-11-02T10:30:00Z', durationMinutes:0}), RangeError);
});
test('adjacent appointments do not overlap', () => {
  assert.equal(overlaps({starts_at:'2026-11-02T10:00Z',ends_at:'2026-11-02T11:00Z'}, {starts_at:'2026-11-02T11:00Z',ends_at:'2026-11-02T12:00Z'}), false);
});
test('detects vehicle conflict and ignores cancelled appointments', () => {
  const candidate={vehicle_id:'v1',starts_at:'2026-11-02T10:30Z',ends_at:'2026-11-02T12:00Z'};
  const appointments=[
    {vehicle_id:'v1',status:'scheduled',starts_at:'2026-11-02T10:00Z',ends_at:'2026-11-02T11:00Z'},
    {vehicle_id:'v2',status:'scheduled',starts_at:'2026-11-02T10:00Z',ends_at:'2026-11-02T11:00Z'},
    {vehicle_id:'v1',status:'cancelled',starts_at:'2026-11-02T10:00Z',ends_at:'2026-11-02T11:00Z'}
  ];
  assert.equal(findVehicleConflicts(candidate,appointments).length,1);
});
test('weekly and biweekly recurrence', () => {
  assert.equal(buildRecurringOccurrences('2026-11-02T10:30Z',{count:3,intervalDays:7})[2].starts_at,'2026-11-16T10:30:00.000Z');
  assert.equal(buildRecurringOccurrences('2026-11-02T10:30Z',{count:2,intervalDays:14})[1].starts_at,'2026-11-16T10:30:00.000Z');
  assert.throws(() => buildRecurringOccurrences('2026-11-02T10:30Z',{count:53,intervalDays:7}),RangeError);
});

test('Sao Paulo wall clock is independent of machine timezone', () => {
  assert.equal(saoPauloLocalToDate('2026-11-02T07:30').toISOString(),'2026-11-02T10:30:00.000Z');
  assert.throws(() => saoPauloLocalToDate('2026-02-30T07:30'),RangeError);
  assert.throws(() => saoPauloLocalToDate('invalid'),RangeError);
});
test('Sao Paulo recurrence preserves local time', () => {
  const slots = saoPauloRecurrence('2026-11-02T07:30',{count:2,intervalDays:7});
  assert.equal(slots[0].starts_at,'2026-11-02T10:30:00.000Z');
  assert.equal(slots[1].starts_at,'2026-11-09T10:30:00.000Z');
});
