#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const clawSourceRunner = path.join(rootDir, "scripts/claw-source-runner.mjs");
const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd ?? rootDir,
      env: { ...process.env, ...(options.env ?? {}) },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout ?? 30_000,
    });
  } catch (error) {
    fail(`${command} ${args.join(" ")} failed: ${error.stderr || error.message}`);
    return "";
  }
}

function claw(args, options = {}) {
  return run(process.execPath, ["--import", "tsx", clawSourceRunner, ...args], options);
}

function clawRaw(args, options = {}) {
  return spawnSync(process.execPath, ["--import", "tsx", clawSourceRunner, ...args], {
    cwd: options.cwd ?? rootDir,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout ?? 30_000,
  });
}

function parseCliPayload(output, label) {
  try {
    const json = JSON.parse(output);
    return json?.data ?? json;
  } catch (error) {
    fail(`${label}: invalid JSON output: ${error.message}`);
    return {};
  }
}

function assertIncludes(array, value, label) {
  assert(Array.isArray(array) && array.includes(value), `${label}: missing ${value}`);
}

function assertNoForbiddenPublicNames() {
  const forbidden = [
    [105, 115, 116, 97, 116],
    [98, 106, 97, 110, 103, 111],
  ].map((chars) => String.fromCharCode(...chars).toLowerCase());
  const scanned = [
    "docs/api.md",
    "docs/cli.md",
    "docs/system-telemetry-external-pending-validation.md",
    "docs/surface.md",
    "docs/persistent-surface.md",
    "docs/evolution/public-surface-baseline.json",
    "packages/clawjs-core/src/system-telemetry.ts",
    "packages/clawjs-core/src/system-telemetry.test.ts",
    "packages/clawjs-core/src/surface-registry.ts",
    "packages/clawjs/src/cli-system-command.ts",
    "packages/clawjs/src/index.test.ts",
    "packages/clawjs/src/inspect-cli.test.ts",
    "packages/clawjs-mcp/src/system-telemetry.ts",
    "packages/clawjs-mcp/src/expose.ts",
    "packages/clawjs-mcp/src/app.ts",
    "packages/clawjs-mcp/src/control-plane.test.ts",
    "apps/host/Sources/CommanderCore/SystemTelemetry.swift",
    "apps/host/Sources/CommanderCore/CommandService.swift",
    "apps/host/Sources/ClawHostCLI/main.swift",
    "apps/host/Sources/ClawHostKit/SystemTelemetryControlHostBridge.swift",
    "apps/host/Tests/CommanderE2ETests/CommanderE2ETests.swift",
  ].filter((file) => fs.existsSync(path.join(rootDir, file)));
  for (const file of scanned) {
    const text = read(file).toLowerCase();
    for (const term of forbidden) {
      if (text.includes(term)) fail(`${file}: contains a forbidden external product name`);
    }
  }
}

function assertExternalPendingLedger() {
  const text = read("docs/system-telemetry-external-pending-validation.md");
  for (const snippet of [
    "Source conversation: `019e359b-c0ab-7dc1-ba94-11a49d11dc76`",
    "Plan item: `019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan`",
    "Status: `active_goal_not_complete`",
    "`EXTERNAL PENDING` are not passes and must not be used to close the goal.",
    "| SYS-TEL-EXT-001 | Live weather/context provider connection |",
    "| SYS-TEL-EXT-002 | Physical hardware sensor and fan telemetry |",
    "| SYS-TEL-EXT-003 | Dangerous hardware or system controls |",
    "| SYS-TEL-EXT-004 | Signed-host live recording loop |",
    "| SYS-TEL-EXT-005 | Strict native menu-bar visual and interaction validation |",
    "| SYS-TEL-EXT-006 | Native time-series graph UI over retained telemetry |",
    "must not be downgraded to `EXTERNAL PENDING`",
  ]) {
    assert(text.includes(snippet), `docs/system-telemetry-external-pending-validation.md: missing ${JSON.stringify(snippet)}`);
  }

  const requiredRows = [
    "SYS-TEL-EXT-001",
    "SYS-TEL-EXT-002",
    "SYS-TEL-EXT-003",
    "SYS-TEL-EXT-004",
    "SYS-TEL-EXT-005",
    "SYS-TEL-EXT-006",
  ];
  for (const rowId of requiredRows) {
    const rowPattern = new RegExp(`\\|\\s*${rowId}\\s*\\|[^\\n]*\\|\\s*EXTERNAL PENDING\\s*\\|`);
    assert(rowPattern.test(text), `docs/system-telemetry-external-pending-validation.md: ${rowId} must remain EXTERNAL PENDING`);
  }
}

function assertDocsAndRegistry() {
  for (const [file, snippets] of [
    ["docs/cli.md", [
      "claw system snapshot --json",
      "claw system providers plan context.weather.live",
      "claw system controls execute system.audio.set_output_volume",
      "claw inspect route system.telemetryAgentContext --json",
      "system.sensor.fan_speed",
      "chart-ready",
      "ASCII `render` sparkline",
    ]],
    ["docs/api.md", [
      "/v1/system/providers/plan",
      "/v1/system/controls/plan",
      "metric_samples",
      "chart-ready `chart` object",
      "ASCII",
      "`render` sparkline",
      "signed-host operation",
    ]],
    ["packages/clawjs-core/src/surface-registry.ts", [
      "claw.systemTelemetry",
      "claw.systemTelemetry.contextProviders",
      "clawix.menuBar.systemIndicators",
      "system.telemetryAgentContext",
      "system.telemetrySignedHostControl",
      "clawix.menuBarSystemIndicators",
      "metric_rollups",
      "metric_incidents",
    ]],
  ]) {
    const text = read(file);
    for (const snippet of snippets) {
      assert(text.includes(snippet), `${file}: missing ${JSON.stringify(snippet)}`);
    }
  }
}

function assertMetricCatalog() {
  const payload = parseCliPayload(claw(["system", "metrics", "list", "--json"]), "metrics list");
  const metrics = payload.metrics ?? [];
  const families = new Set(metrics.map((metric) => metric.family));
  for (const family of [
    "audio",
    "calendar_time",
    "cpu",
    "disk",
    "display",
    "focus",
    "gpu",
    "local_context",
    "memory",
    "network",
    "notification",
    "peripheral",
    "power",
    "process",
    "sensor",
    "weather_context",
  ]) {
    assert(families.has(family), `metrics list: missing family ${family}`);
  }
  for (const key of [
    "system.sensor.temperature",
    "system.sensor.fan_speed",
    "system.notifications.availability_state",
    "context.weather.temperature",
    "context.agent_runs.active",
  ]) {
    assert(metrics.some((metric) => metric.key === key), `metrics list: missing metric ${key}`);
  }
}

function assertSnapshotAndWatch() {
  const snapshot = parseCliPayload(claw(["system", "snapshot", "--json"]), "snapshot");
  assert(snapshot.policy?.defaultAgentAccess === "safe_read", "snapshot: default agent access must be safe_read");
  assert(snapshot.policy?.controlsRequireSignedHostBroker === true, "snapshot: controls must require signed-host broker");
  assert(snapshot.samples?.some((sample) => sample.key === "system.memory.used"), "snapshot: missing memory sample");
  assert(snapshot.unavailableMetrics?.includes("system.sensor.temperature"), "snapshot: missing sensor unavailable marker");

  const watchOutput = claw(["system", "watch", "--interval", "1", "--count", "2", "--json"], { timeout: 30_000 }).trim();
  const lines = watchOutput.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert(lines.length === 2, `watch: expected 2 jsonl lines, found ${lines.length}`);
  assert(lines.every((line) => line.ok === true && line.meta?.intervalMs === 1), "watch: every line must be ok with requested interval");
  assert(lines.every((line) => line.data?.samples?.some((sample) => sample.key === "system.memory.used")), "watch: every line must include memory sample");
}

function assertSystemCapabilitiesAlias() {
  const clawHome = fs.mkdtempSync(path.join(os.tmpdir(), "claw-system-capabilities-alias-"));
  const result = clawRaw(["system", "capabilities", "list", "--claw-home", clawHome, "--json"]);
  assert(result.status === 2, `system capabilities list: expected degraded exit without active host, got ${result.status}`);
  let payload = {};
  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    fail(`system capabilities list: invalid JSON output: ${error.message}`);
  }
  assert(payload.ok === false, "system capabilities list: no-host smoke must return JSON error envelope");
  assert(payload.error?.code === "host_unavailable", "system capabilities list: must fail through signed-host broker when no host is active");
  assert(payload.meta?.canonicalCommand === "system", "system capabilities list: must preserve system as invoked command");
  assert(payload.meta?.subcommand === "capabilities", "system capabilities list: must preserve capabilities subcommand");
  assert(payload.meta?.operation === "list", "system capabilities list: must preserve list operation");
}

function assertProvidersAndControls() {
  const providers = parseCliPayload(claw(["system", "providers", "list", "--json"]), "providers list").providers ?? [];
  assert(providers.some((provider) => provider.id === "context.weather.live" && provider.status === "external_pending"), "providers: missing live weather external-pending provider");
  assert(providers.some((provider) => provider.id === "system.sensors.signed" && provider.metrics?.includes("system.sensor.fan_speed")), "providers: missing signed sensor provider visible metrics");

  const weatherPlan = parseCliPayload(claw(["system", "providers", "plan", "context.weather.live", "--reason", "goal-verify", "--json"]), "weather provider plan");
  assert(weatherPlan.willConnect === false, "weather provider plan: must not connect");
  assert(weatherPlan.externalPending === true, "weather provider plan: must be external pending");
  assert(weatherPlan.provider?.metrics?.includes("context.weather.temperature"), "weather provider plan: missing visible metrics");
  assert(!Array.isArray(weatherPlan.provider?.metricKeys), "weather provider plan: metricKeys must not be exposed as an array in public CLI output");
  assertIncludes(weatherPlan.policy?.requiredGrants, "weather.location.read", "weather provider plan grants");
  assert(weatherPlan.steps?.some((step) => step.id === "connect_provider" && step.status === "blocked"), "weather provider plan: connect step must be blocked");

  const sensorPlan = parseCliPayload(claw(["system", "providers", "plan", "system.sensors.signed", "--reason", "goal-verify", "--json"]), "sensor provider plan");
  assert(sensorPlan.willConnect === false, "sensor provider plan: must not connect");
  assert(sensorPlan.externalPending === true, "sensor provider plan: must be external pending");
  assert(sensorPlan.provider?.metrics?.includes("system.sensor.temperature"), "sensor provider plan: missing temperature metric");
  assert(sensorPlan.provider?.metrics?.includes("system.sensor.fan_speed"), "sensor provider plan: missing fan speed metric");
  assertIncludes(sensorPlan.policy?.requiredGrants, "system.sensor.read", "sensor provider plan grants");

  const controls = parseCliPayload(claw(["system", "controls", "list", "--json"]), "controls list");
  assert(controls.mutatesHardware === false, "controls list: must not mutate hardware");
  const controlFamilies = new Set((controls.controls ?? []).map((control) => control.family));
  for (const family of ["fan", "power", "process", "network", "display", "audio"]) {
    assert(controlFamilies.has(family), `controls list: missing family ${family}`);
  }

  const fanPlan = parseCliPayload(claw(["system", "controls", "plan", "system.fan.set_speed", "--target", "fan0", "--value", "45", "--reason", "goal-verify", "--json"]), "fan control plan");
  assert(fanPlan.willExecute === false, "fan control plan: must not execute");
  assert(fanPlan.externalPending === true, "fan control plan: must be external pending");
  assert(fanPlan.broker?.failClosed === true, "fan control plan: broker must fail closed");
  assertIncludes(fanPlan.policy?.requiredGrants, "system.hardware.control", "fan control plan grants");
  assertIncludes(fanPlan.policy?.requiredGrants, "system.sensor.read", "fan control plan grants");
  assert(fanPlan.steps?.some((step) => step.id === "execute_native_action" && step.status === "blocked"), "fan control plan: execute step must be blocked");
}

function assertSignedHostBrokerCoverage() {
  const bridge = read("apps/host/Sources/ClawHostKit/SystemTelemetryControlHostBridge.swift");
  for (const snippet of [
    "public enum SystemTelemetryControlHostBridge",
    "action == \"execute\"",
    "MacControlWire.evaluateJSON",
    "MacControlPolicy.auditFilename",
    "MacControlPolicyGrantStore.fileURL",
    "\"signed_host_plan_first\"",
    "\"fail_closed\": .bool(true)",
    "\"mac.audio.volume\"",
    "\"mac.display.brightness\"",
    "failClosedResponse(",
    "System control is not executable by the signed host broker yet.",
  ]) {
    assert(bridge.includes(snippet), `SystemTelemetryControlHostBridge.swift: missing ${JSON.stringify(snippet)}`);
  }

  const cli = read("apps/host/Sources/ClawHostCLI/main.swift");
  assert(cli.includes("parsed.domain == .system && parsed.resource == \"controls\" && parsed.action == \"execute\""), "ClawHostCLI: missing system controls execute route");
  assert(cli.includes("SystemTelemetryControlHostBridge.response("), "ClawHostCLI: missing system telemetry control bridge call");

  const tests = read("apps/host/Tests/CommanderE2ETests/CommanderE2ETests.swift");
  for (const snippet of [
    "testSystemTelemetryControlExecuteUsesMacBrokerAuditAndReceipt",
    "testSystemTelemetryDangerousControlsFailClosedWithPolicyAndAuditPlan",
    "mac.audio.volume",
    "system.fan.set_speed",
    "system.hardware.control",
    "system.sensor.read",
    "execute_native_action",
    "runner.nativeCalls.isEmpty",
  ]) {
    assert(tests.includes(snippet), `CommanderE2ETests.swift: missing ${JSON.stringify(snippet)}`);
  }
}

function assertMonitorRetention() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-system-telemetry-goal-"));
  const monitorDb = path.join(workspaceRoot, "monitor.sqlite");
  const upsert = parseCliPayload(claw([
    "system", "rules", "upsert", "memory-any",
    "--metric-key", "system.memory.used",
    "--operator", "gt",
    "--threshold", "0",
    "--severity", "warning",
    "--workspace", workspaceRoot,
    "--json",
  ]), "rules upsert");
  assert(upsert.rule?.id === "memory-any", "rules upsert: missing created rule");
  assert(upsert.mutatesHardware === false, "rules upsert: must not mutate hardware");

  const snapshot = parseCliPayload(claw([
    "system", "snapshot",
    "--record", "true",
    "--workspace", workspaceRoot,
    "--monitor-db", monitorDb,
    "--json",
  ]), "recorded snapshot");
  assert(snapshot.recorded?.store === "monitor.sqlite", "recorded snapshot: must use monitor store");
  assert(snapshot.recorded?.sampleCount >= 3, "recorded snapshot: must record samples");
  assert(snapshot.recorded?.rollupCount >= 3, "recorded snapshot: must record rollups");
  assert(snapshot.recorded?.incidentCount >= 1, "recorded snapshot: must reuse incidents for rules");

  const history = parseCliPayload(claw(["system", "history", "system.memory.used", "--range", "1h", "--monitor-db", monitorDb, "--json"]), "history");
  assert(history.retention?.status === "recorded", "history: retention status must be recorded");
  assert(history.samples?.some((sample) => sample.metricKey === "system.memory.used" && sample.sourceId === "system.telemetry.local"), "history: missing recorded memory sample");
  assert(history.rollups?.some((rollup) => rollup.metricKey === "system.memory.used" && rollup.bucketMs === 60_000), "history: missing memory rollup");
  assert(history.incidents?.some((incident) => incident.ruleId === "memory-any" && incident.status === "open"), "history: missing rule incident");
  assert(history.chart?.kind === "line", "history: missing chart-ready line payload");
  assert(history.chart?.source === "metric_samples", "history: chart must prefer raw metric samples when available");
  assert(history.chart?.points?.some((point) => point.sourceId === "system.telemetry.local" && typeof point.value === "number"), "history: chart must expose numeric points");
  assert(history.render?.kind === "ascii_sparkline", "history: missing ASCII sparkline render");
  assert(history.render?.source === "metric_samples", "history: render must use the same source as chart when raw samples are available");
  assert(typeof history.render?.line === "string" && history.render.line.length > 0, "history: render must expose a non-empty line");
}

function assertInspectRoutes() {
  for (const routeId of ["system.telemetryAgentContext", "system.telemetrySignedHostControl", "clawix.menuBarSystemIndicators"]) {
    const route = parseCliPayload(claw(["inspect", "route", routeId, "--json"]), `inspect route ${routeId}`);
    assert(route.id === routeId, `inspect route: missing ${routeId}`);
    assert(Array.isArray(route.edges) && route.edges.length > 0, `inspect route ${routeId}: missing edges`);
  }
  const neighbors = parseCliPayload(claw(["inspect", "neighbors", "claw.systemTelemetry", "--json"]), "inspect neighbors");
  const neighborIds = new Set((neighbors.neighbors ?? []).map((node) => node.id));
  for (const id of ["claw.systemTelemetry.contextProviders", "claw.database.monitor", "claw.host.signed", "clawix.menuBar.systemIndicators"]) {
    assert(neighborIds.has(id), `inspect neighbors: missing ${id}`);
  }
}

function assertSearchDiscoverability() {
  const telemetry = parseCliPayload(claw(["search", "system telemetry", "--json"]), "search system telemetry");
  const telemetryResults = telemetry.results ?? [];
  assert(telemetryResults.some((result) => result.type === "command" && result.name === "system"), "search system telemetry: missing system command result");
  assert(telemetryResults.some((result) => result.type === "doc" && result.path === "docs/cli.md" && String(result.summary ?? "").includes("System Telemetry")), "search system telemetry: missing CLI docs result");

  const menuBar = parseCliPayload(claw(["search", "menu bar indicators", "--json"]), "search menu bar indicators");
  const menuBarResults = menuBar.results ?? [];
  assert(menuBarResults.some((result) => result.path === "docs/cli.md"), "search menu bar indicators: missing CLI docs result");
  assert(menuBarResults.some((result) => String(result.summary ?? "").includes("clawix.menuBarSystemIndicators")), "search menu bar indicators: missing menu bar route evidence");
}

function main() {
  assert(fs.existsSync(clawSourceRunner), "scripts/claw-source-runner.mjs is missing");
  assertNoForbiddenPublicNames();
  assertExternalPendingLedger();
  assertDocsAndRegistry();
  assertMetricCatalog();
  assertSnapshotAndWatch();
  assertProvidersAndControls();
  assertSystemCapabilitiesAlias();
  assertSignedHostBrokerCoverage();
  assertMonitorRetention();
  assertInspectRoutes();
  assertSearchDiscoverability();

  if (errors.length) {
    console.error(`System telemetry goal verifier failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("System telemetry goal verifier passed.");
}

main();
