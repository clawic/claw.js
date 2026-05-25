import test from "node:test";
import assert from "node:assert/strict";

import {
  buildScheduleFromNatural,
  computeNextRunAt,
  normalizeTemporalItem,
  zonedDateTimeToUtc,
} from "./logic.ts";

test("builds temporal items across all supported kinds", () => {
  const kinds = ["event", "routine", "reminder", "deadline", "follow_up"] as const;
  for (const kind of kinds) {
    const item = normalizeTemporalItem({
      kind,
      title: `${kind} title`,
      natural: kind === "routine"
        ? { command: "every", expression: "3h" }
        : { command: "at", expression: "monday 9am", timezone: "Europe/Madrid" },
    }, "UTC", new Date("2026-04-09T08:00:00.000Z"));
    assert.equal(item.kind, kind);
    assert.ok(item.nextRunAt);
  }
});

test("resolves cron, rrule, and relative schedules", () => {
  const cronItem = normalizeTemporalItem({
    kind: "routine",
    title: "cron",
    schedule: { mode: "cron", timezone: "UTC", cron: "0 */3 * * *" },
  }, "UTC", new Date("2026-04-09T08:10:00.000Z"));
  assert.equal(computeNextRunAt(cronItem, new Date("2026-04-09T08:10:00.000Z")), "2026-04-09T09:00:00.000Z");

  const rruleItem = normalizeTemporalItem({
    kind: "routine",
    title: "rrule",
    schedule: { mode: "rrule", timezone: "UTC", rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0" },
  }, "UTC", new Date("2026-04-09T08:10:00.000Z"));
  assert.equal(computeNextRunAt(rruleItem, new Date("2026-04-09T08:10:00.000Z")), "2026-04-13T09:00:00.000Z");

  const relativeItem = normalizeTemporalItem({
    kind: "follow_up",
    title: "relative",
    natural: {
      command: "after",
      expression: "24h if no reply",
      anchorType: "thread",
      anchorId: "thread-1",
      anchorAt: "2026-04-09T08:00:00.000Z",
    },
  }, "UTC");
  assert.equal(relativeItem.nextRunAt, "2026-04-10T08:00:00.000Z");
});

test("rejects invalid recurrence and throttle numeric ranges", () => {
  const now = new Date("2026-04-09T08:10:00.000Z");

  assert.throws(() => normalizeTemporalItem({
    kind: "routine",
    title: "negative interval",
    schedule: { mode: "rrule", timezone: "UTC", rrule: "FREQ=HOURLY;INTERVAL=-2;BYMINUTE=0" },
  }, "UTC", now), /RRULE INTERVAL must be at least 1/);

  assert.throws(() => normalizeTemporalItem({
    kind: "routine",
    title: "impossible hour",
    schedule: { mode: "rrule", timezone: "UTC", rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=25;BYMINUTE=0" },
  }, "UTC", now), /RRULE BYHOUR must be between 0 and 23/);

  assert.throws(() => normalizeTemporalItem({
    kind: "routine",
    title: "nan minute",
    schedule: { mode: "rrule", timezone: "UTC", rrule: "FREQ=HOURLY;BYMINUTE=NaN" },
  }, "UTC", now), /RRULE BYMINUTE must be an integer/);

  assert.throws(() => normalizeTemporalItem({
    kind: "routine",
    title: "negative stagger",
    schedule: { mode: "cron", timezone: "UTC", cron: "*/5 * * * *", staggerMs: -1 },
  }, "UTC", now), /schedule\.staggerMs must be at least 0/);

  assert.throws(() => normalizeTemporalItem({
    kind: "routine",
    title: "fractional stagger",
    schedule: { mode: "cron", timezone: "UTC", cron: "*/5 * * * *", staggerMs: 1.5 },
  }, "UTC", now), /schedule\.staggerMs must be an integer/);

  assert.throws(() => normalizeTemporalItem({
    kind: "routine",
    title: "negative cooldown",
    natural: { command: "every", expression: "5m" },
    heartbeat: {
      when: ["workspace.tasks:new"],
      cooldownMs: -1,
    },
  }, "UTC", now), /heartbeat\.cooldownMs must be at least 0/);

  assert.throws(() => normalizeTemporalItem({
    kind: "routine",
    title: "zero limit",
    natural: { command: "every", expression: "5m" },
    heartbeat: {
      when: ["workspace.tasks:new"],
      limit: 0,
    },
  }, "UTC", now), /heartbeat\.limit must be at least 1/);

  assert.throws(() => normalizeTemporalItem({
    kind: "routine",
    title: "fractional limit",
    natural: { command: "every", expression: "5m" },
    heartbeat: {
      when: ["workspace.tasks:new"],
      limit: 1.5,
    },
  }, "UTC", now), /heartbeat\.limit must be an integer/);
});

test("does not keep expired one-off schedules runnable", () => {
  const now = new Date("2026-04-09T09:00:00.000Z");
  const expired = normalizeTemporalItem({
    kind: "reminder",
    title: "expired",
    schedule: {
      mode: "one_off",
      timezone: "UTC",
      startsAt: "2026-04-09T08:00:00.000Z",
    },
  }, "UTC", now);
  assert.equal(expired.nextRunAt, undefined);

  const upcoming = normalizeTemporalItem({
    kind: "reminder",
    title: "upcoming",
    schedule: {
      mode: "one_off",
      timezone: "UTC",
      startsAt: "2026-04-09T10:00:00.000Z",
    },
  }, "UTC", now);
  assert.equal(upcoming.nextRunAt, "2026-04-09T10:00:00.000Z");
});

test("handles timezone conversion and dst transitions", () => {
  const ny = zonedDateTimeToUtc({
    year: 2026,
    month: 3,
    day: 9,
    hour: 9,
    minute: 0,
  }, "America/New_York");
  assert.equal(ny.toISOString(), "2026-03-09T13:00:00.000Z");

  const schedule = buildScheduleFromNatural({
    command: "at",
    expression: "monday 9am",
    timezone: "Europe/Madrid",
  }, "Europe/Madrid", new Date("2026-10-24T08:00:00.000Z"));
  assert.equal(schedule.startsAt, "2026-10-26T08:00:00.000Z");
});
