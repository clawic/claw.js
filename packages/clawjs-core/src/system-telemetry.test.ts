import { test } from "vitest";
import assert from "node:assert/strict";

import { createSystemTelemetryControlPlan, createSystemTelemetryProviderPlan, listSystemTelemetryControlActions, listSystemTelemetryMetrics, listSystemTelemetryProviders, listSystemTelemetryWidgets } from "./system-telemetry.ts";

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
    "notification",
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
    "system.peripheral.bluetooth_count",
    "system.peripheral.connected_count",
    "system.notifications.availability_state",
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
  assert.equal(widgets.some((widget) => widget.metricKey === "system.notifications.availability_state"), true);
});

test("system telemetry providers declare mock, offline, and live context slots", () => {
  const providers = listSystemTelemetryProviders();
  const metricKeys = new Set(listSystemTelemetryMetrics().map((metric) => metric.key));
  const widgetIds = new Set(listSystemTelemetryWidgets().map((widget) => widget.id));

  assert.equal(providers.some((provider) => provider.kind === "weather" && provider.mode === "mock" && provider.status === "ready"), true);
  assert.equal(providers.some((provider) => provider.kind === "weather" && provider.mode === "live" && provider.status === "external_pending" && provider.credentialRefRequired), true);
  assert.equal(providers.some((provider) => provider.kind === "hardware_sensor" && provider.mode === "live" && provider.status === "external_pending" && provider.requiresGrant === "system.sensor.read"), true);

  for (const kind of ["build_status", "local_service", "agent_run", "reminder", "calendar", "custom_metric"]) {
    assert.equal(providers.some((provider) => provider.kind === kind && provider.mode === "offline"), true, kind);
  }

  assert.equal(providers.every((provider) => provider.metricKeys.every((key) => metricKeys.has(key))), true);
  assert.equal(providers.every((provider) => provider.metrics?.join(",") === provider.metricKeys.join(",")), true);
  assert.equal(providers.every((provider) => provider.widgetIds.every((id) => widgetIds.has(id))), true);
  assert.equal(providers.some((provider) => provider.requiresGrant === "calendar.read"), true);

  const liveWeather = providers.find((provider) => provider.id === "context.weather.live");
  assert.ok(liveWeather);
  const plan = createSystemTelemetryProviderPlan({ provider: liveWeather, reason: "test-plan", now: "2026-05-19T12:00:00.000Z", idSuffix: "test" });
  assert.equal(plan.willConnect, false);
  assert.equal(plan.broker.failClosed, true);
  assert.equal(plan.policy.requiredGrants.includes("weather.location.read"), true);
  assert.equal(plan.policy.credentialRefRequired, true);
  assert.equal(plan.provider.metrics?.includes("context.weather.temperature"), true);
  assert.equal(plan.steps.some((step) => step.id === "resolve_credential_ref" && step.status === "blocked"), true);
  assert.equal(plan.steps.some((step) => step.id === "connect_provider" && step.status === "blocked"), true);
  assert.equal(plan.receipt.auditEvent, "system.telemetry.provider.weather.live");

  const sensorProvider = providers.find((provider) => provider.id === "system.sensors.signed");
  assert.ok(sensorProvider);
  const sensorPlan = createSystemTelemetryProviderPlan({ provider: sensorProvider, reason: "sensor-validation", now: "2026-05-19T12:00:00.000Z", idSuffix: "sensor-test" });
  assert.equal(sensorPlan.willConnect, false);
  assert.equal(sensorPlan.policy.requiredGrants.includes("system.sensor.read"), true);
  assert.equal(sensorPlan.policy.credentialRefRequired, false);
  assert.equal(sensorPlan.provider.metrics?.includes("system.sensor.temperature"), true);
  assert.equal(sensorPlan.provider.metrics?.includes("system.sensor.fan_speed"), true);
  assert.equal(sensorPlan.steps.some((step) => step.id === "resolve_credential_ref" && step.status === "skipped"), true);
  assert.equal(sensorPlan.steps.some((step) => step.id === "connect_provider" && step.status === "blocked"), true);
  assert.equal(sensorPlan.receipt.auditEvent, "system.telemetry.provider.hardware_sensor.live");
});

test("system telemetry control actions are signed-host plan-first contracts", () => {
  const actions = listSystemTelemetryControlActions();
  const metricKeys = new Set(listSystemTelemetryMetrics().map((metric) => metric.key));

  for (const family of ["fan", "power", "process", "network", "display", "audio"]) {
    assert.equal(actions.some((action) => action.family === family), true, family);
  }

  assert.equal(actions.every((action) => action.requiresSignedHostBroker), true);
  assert.equal(actions.every((action) => action.requiredGrants.length > 0), true);
  assert.equal(actions.every((action) => action.targetMetricKeys.every((key) => metricKeys.has(key))), true);
  assert.equal(actions.some((action) => action.id === "system.fan.set_speed" && action.riskTier === "critical"), true);
  assert.equal(actions.some((action) => action.id === "system.fan.set_speed" && action.requiredGrants.includes("system.sensor.read")), true);
  assert.equal(actions.some((action) => action.id === "system.audio.set_output_volume" && action.requiresConfirmation === false), true);

  const display = actions.find((action) => action.id === "system.display.set_brightness");
  assert.ok(display);
  const plan = createSystemTelemetryControlPlan({ action: display, target: "main", value: "70", reason: "test-plan", now: "2026-05-19T12:00:00.000Z", idSuffix: "test" });
  assert.equal(plan.willExecute, false);
  assert.equal(plan.broker.failClosed, true);
  assert.equal(plan.request.reason, "test-plan");
  assert.equal(plan.policy.requiredGrants.includes("system.display.control"), true);
  assert.equal(plan.steps.some((step) => step.id === "execute_native_action" && step.status === "blocked"), true);
  assert.equal(plan.receipt.auditEvent, "system.telemetry.control.display.set_brightness");
});
