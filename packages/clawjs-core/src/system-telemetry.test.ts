import { test } from "vitest";
import assert from "node:assert/strict";

import { listSystemTelemetryMetrics, listSystemTelemetryProviders, listSystemTelemetryWidgets } from "./system-telemetry.ts";

test("system telemetry catalog covers required metric families", () => {
  const metrics = listSystemTelemetryMetrics();
  const families = new Set(metrics.map((metric) => metric.family));

  for (const family of [
    "cpu",
    "gpu",
    "memory",
    "disk",
    "network",
    "sensor",
    "power",
    "process",
    "display",
    "audio",
    "peripheral",
    "focus",
    "calendar_time",
    "weather_context",
    "local_context",
  ]) {
    assert.equal(families.has(family), true, family);
  }

  assert.equal(metrics.every((metric) => metric.key && metric.unit && metric.privacyTier && metric.support.length > 0), true);
  assert.equal(metrics.some((metric) => metric.sourceConfidence === "experimental" && metric.availability === "host_required"), true);
  assert.equal(metrics.some((metric) => metric.family === "weather_context" && metric.sourceConfidence === "provider"), true);

  for (const key of [
    "system.cpu.load5",
    "system.cpu.load15",
    "system.cpu.frequency_hz",
    "system.gpu.memory_used_bytes",
    "system.memory.free",
    "system.memory.pressure",
    "system.disk.used",
    "system.disk.free",
    "system.disk.io_read",
    "system.disk.io_write",
    "system.network.bytes_in",
    "system.network.bytes_out",
    "system.network.public_ip",
    "system.power.battery",
    "system.display.brightness",
    "system.audio.output_volume",
    "system.peripheral.connected_count",
    "context.build.status",
    "context.service.health",
    "context.agent_runs.active",
    "context.reminders.due_count",
    "context.custom.metric",
  ]) {
    assert.equal(metrics.some((metric) => metric.key === key), true, key);
  }
});

test("system telemetry default widgets include independent and combined placements", () => {
  const widgets = listSystemTelemetryWidgets();
  const metricKeys = new Set(listSystemTelemetryMetrics().map((metric) => metric.key));

  assert.equal(widgets.some((widget) => widget.placement === "menubar"), true);
  assert.equal(widgets.some((widget) => widget.placement === "combined_panel"), true);
  assert.equal(widgets.some((widget) => widget.placement === "both"), true);
  assert.equal(widgets.every((widget) => widget.id && widget.metricKey && widget.presentation), true);
  assert.equal(widgets.every((widget) => metricKeys.has(widget.metricKey)), true);
  assert.equal(widgets.some((widget) => widget.metricKey === "system.disk.free"), true);
  assert.equal(widgets.some((widget) => widget.metricKey === "system.network.bytes_in"), true);
  assert.equal(widgets.some((widget) => widget.metricKey === "context.agent_runs.active"), true);
  assert.equal(widgets.some((widget) => widget.metricKey === "context.reminders.due_count"), true);
});

test("system telemetry providers declare mock, offline, and live context slots", () => {
  const providers = listSystemTelemetryProviders();
  const metricKeys = new Set(listSystemTelemetryMetrics().map((metric) => metric.key));
  const widgetIds = new Set(listSystemTelemetryWidgets().map((widget) => widget.id));

  assert.equal(providers.some((provider) => provider.kind === "weather" && provider.mode === "mock" && provider.status === "ready"), true);
  assert.equal(providers.some((provider) => provider.kind === "weather" && provider.mode === "live" && provider.status === "external_pending" && provider.credentialRefRequired), true);

  for (const kind of ["build_status", "local_service", "agent_run", "reminder", "calendar", "custom_metric"]) {
    assert.equal(providers.some((provider) => provider.kind === kind && provider.mode === "offline"), true, kind);
  }

  assert.equal(providers.every((provider) => provider.metricKeys.every((key) => metricKeys.has(key))), true);
  assert.equal(providers.every((provider) => provider.widgetIds.every((id) => widgetIds.has(id))), true);
  assert.equal(providers.some((provider) => provider.requiresGrant === "calendar.read"), true);
});
