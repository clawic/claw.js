#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const clawSourceRunner = path.join(rootDir, "scripts/claw-source-runner.mjs");
const require = createRequire(import.meta.url);
const BetterSqlite3 = require("better-sqlite3");
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

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function collectTextFiles(relativePaths) {
  const allowedExtensions = new Set([".swift", ".md", ".mjs", ".js", ".ts", ".tsx", ".json", ".sh", ".yml", ".yaml"]);
  const ignoredDirectories = new Set([".git", ".build", "build", "DerivedData", "node_modules", "dist", ".tmp", ".swiftpm", "xcuserdata", "coverage"]);
  const files = [];
  function walk(absolutePath) {
    if (!fs.existsSync(absolutePath)) return;
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      if (ignoredDirectories.has(path.basename(absolutePath))) return;
      for (const entry of fs.readdirSync(absolutePath)) {
        walk(path.join(absolutePath, entry));
      }
      return;
    }
    if (stat.isFile() && allowedExtensions.has(path.extname(absolutePath))) {
      files.push(path.relative(rootDir, absolutePath));
    }
  }
  for (const relativePath of relativePaths) {
    walk(path.join(rootDir, relativePath));
  }
  return [...new Set(files)].sort();
}

function containsForbiddenExternalProductName(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
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

function seedOperationalHealthEvent(dbPath) {
  const sqlite = new BetterSqlite3(dbPath);
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS operational_events (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'info',
        message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
    `);
    sqlite.prepare(`
      INSERT INTO operational_events (id, kind, level, message, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("goal-health-heartbeat", "health_check", "info", "Worker alive", new Date().toISOString(), "{}");
  } finally {
    sqlite.close();
  }
}

function assertOperationalHealthEventRetained(dbPath) {
  const sqlite = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const event = sqlite.prepare("SELECT id, kind, message FROM operational_events WHERE id = ?").get("goal-health-heartbeat");
    assert(event?.kind === "health_check", "monitor retention: operational health event kind must survive metric purge");
    assert(event?.message === "Worker alive", "monitor retention: operational health event message must survive metric purge");
    const rollup = sqlite.prepare("SELECT COUNT(*) AS count FROM metric_rollups WHERE metric_key = ?").get("system.memory.used");
    assert(rollup?.count >= 1, "monitor retention: metric rollups must coexist with operational health events");
  } finally {
    sqlite.close();
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
  const scanned = collectTextFiles([
    "docs",
    "packages/clawjs-core/src",
    "packages/clawjs/src",
    "packages/clawjs-mcp/src",
    "apps/host",
    "scripts/verify-system-telemetry-goal.mjs",
  ]);
  for (const file of scanned) {
    const text = read(file).toLowerCase();
    for (const term of forbidden) {
      if (containsForbiddenExternalProductName(text, term)) fail(`${file}: contains a forbidden external product name`);
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
    "`docs/system-telemetry-external-validation.manifest.json` and",
    "`docs/system-telemetry-source-qa-review.json`",
    "The source Q/A review binds the private decision audit to public-safe rows",
    "| SYS-TEL-EXT-001 | Live weather/context provider connection |",
    "| SYS-TEL-EXT-002 | Physical hardware sensor and fan telemetry |",
    "| SYS-TEL-EXT-003 | Dangerous hardware or system controls |",
    "| SYS-TEL-EXT-004 | Signed-host live recording loop |",
    "| SYS-TEL-EXT-005 | Strict native menu-bar visual and interaction validation |",
    "| SYS-TEL-EXT-006 | Native time-series graph UI over retained telemetry |",
    "read-only experimental AppleSMC path",
    "missing AppleSMC service or missing compatible keys remains a valid external blocker",
    ".claw/data/system-telemetry-audit.jsonl",
    "local redacted JSONL plan audit",
    "provided_redacted",
    "redacted JSONL audit evidence for blocked provider plans",
    "not a provider execution receipt",
    "redacted JSONL audit evidence for unsupported/high-risk blocked controls",
    "not an execution receipt",
    "## External Validation Lanes",
    "| SYS-TEL-EXT-001 | Live context provider lane:",
    "| SYS-TEL-EXT-002 | Signed sensor provider lane:",
    "| SYS-TEL-EXT-003 | Dangerous-control lane:",
    "Rows must stay `EXTERNAL PENDING` if any approval, hardware/provider path,",
    "must not be downgraded to `EXTERNAL PENDING`",
  ]) {
    assert(text.includes(snippet), `docs/system-telemetry-external-pending-validation.md: missing ${JSON.stringify(snippet)}`);
  }

  const requiredRows = [
    "SYS-TEL-EXT-001",
    "SYS-TEL-EXT-002",
    "SYS-TEL-EXT-003",
  ];
  for (const rowId of requiredRows) {
    const rowPattern = new RegExp(`\\|\\s*${rowId}\\s*\\|[^\\n]*\\|\\s*EXTERNAL PENDING\\s*\\|`);
    assert(rowPattern.test(text), `docs/system-telemetry-external-pending-validation.md: ${rowId} must remain EXTERNAL PENDING`);
  }

  const validatedRows = [
    "SYS-TEL-EXT-004",
    "SYS-TEL-EXT-005",
    "SYS-TEL-EXT-006",
  ];
  for (const rowId of validatedRows) {
    const rowPattern = new RegExp(`\\|\\s*${rowId}\\s*\\|[^\\n]*\\|\\s*VALIDATED LOCAL\\s*\\|`);
    assert(rowPattern.test(text), `docs/system-telemetry-external-pending-validation.md: ${rowId} must remain VALIDATED LOCAL`);
  }
}

function assertExternalValidationManifest() {
  const manifest = readJson("docs/system-telemetry-external-validation.manifest.json");
  assert(manifest.schemaVersion === 1, "external validation manifest: schemaVersion must be 1");
  assert(manifest.id === "system-telemetry-external-validation-manifest", "external validation manifest: wrong id");
  assert(manifest.conversationId === "019e359b-c0ab-7dc1-ba94-11a49d11dc76", "external validation manifest: wrong conversationId");
  assert(manifest.planId === "019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan", "external validation manifest: wrong planId");
  assert(manifest.status === "active_goal_not_complete", "external validation manifest: goal must remain active");
  assert(manifest.completionPolicy?.externalPendingBlocksCompletion === true, "external validation manifest: external pending must block completion");
  assert(manifest.completionPolicy?.requiresFinalSourceAudit === true, "external validation manifest: final source audit must be required");
  assert(manifest.completionPolicy?.requiresSourceQaReview === true, "external validation manifest: source Q/A review must be required");
  assert(manifest.completionPolicy?.requiresForbiddenNameScan === true, "external validation manifest: forbidden-name scan must be required");
  assert(manifest.completionPolicy?.requiresExactRunApprovalForExternalLanes === true, "external validation manifest: exact-run approval must be required");
  assert(manifest.sourceQaReview?.required === true, "external validation manifest: source Q/A review link must be required");
  assert(manifest.sourceQaReview?.artifactId === "system-telemetry-source-qa-review", "external validation manifest: wrong source Q/A artifact");
  assert(manifest.sourceQaReview?.path === "docs/system-telemetry-source-qa-review.json", "external validation manifest: wrong source Q/A path");
  assert(manifest.sourceQaReview?.privateAuditAlias === "private-goal-audit:claw-system-telemetry-context-menubar-source-audit-2026-05-20", "external validation manifest: wrong private audit alias");
  assert(manifest.sourceQaReview?.closureRole?.includes("public-safe validation rows"), "external validation manifest: source Q/A closure role must be explicit");
  assert(Array.isArray(manifest.rows), "external validation manifest: rows must be an array");

  const rows = new Map(manifest.rows.map((row) => [row.id, row]));
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    const row = rows.get(rowId);
    assert(row?.status === "EXTERNAL PENDING", `external validation manifest: ${rowId} must remain EXTERNAL PENDING`);
    assert(Array.isArray(row.blockingPrerequisites) && row.blockingPrerequisites.length >= 4, `external validation manifest: ${rowId} must keep blocking prerequisites`);
    assert(Array.isArray(row.acceptedEvidence) && row.acceptedEvidence.length >= 4, `external validation manifest: ${rowId} must define accepted evidence`);
    assert(typeof row.reentryCommand === "string" && row.reentryCommand.includes("claw system"), `external validation manifest: ${rowId} must define a system reentry command`);
  }

  assert(rows.get("SYS-TEL-EXT-001")?.acceptedEvidence?.includes("provider_execution_receipt"), "external validation manifest: live provider lane must require execution receipt");
  assert(rows.get("SYS-TEL-EXT-001")?.blockingPrerequisites?.includes("network_access_for_exact_run"), "external validation manifest: live provider lane must require exact network approval");
  assert(rows.get("SYS-TEL-EXT-002")?.acceptedEvidence?.includes("same_machine_evidence"), "external validation manifest: sensor lane must require same-machine evidence");
  assert(rows.get("SYS-TEL-EXT-003")?.blockingPrerequisites?.includes("physical_validation"), "external validation manifest: control lane must require physical validation");
  assert(rows.get("SYS-TEL-EXT-003")?.acceptedEvidence?.includes("rollback_or_continuity_evidence"), "external validation manifest: control lane must require rollback or continuity evidence");

  for (const rowId of ["SYS-TEL-EXT-004", "SYS-TEL-EXT-005", "SYS-TEL-EXT-006"]) {
    const row = rows.get(rowId);
    assert(row?.status === "VALIDATED LOCAL", `external validation manifest: ${rowId} must remain VALIDATED LOCAL`);
    assert(Array.isArray(row.blockingPrerequisites) && row.blockingPrerequisites.length === 0, `external validation manifest: ${rowId} must not keep external prerequisites`);
  }
}

function assertSourceQaReview() {
  const review = readJson("docs/system-telemetry-source-qa-review.json");
  assert(review.schemaVersion === 1, "source Q/A review: schemaVersion must be 1");
  assert(review.artifactId === "system-telemetry-source-qa-review", "source Q/A review: wrong artifactId");
  assert(review.discoveryTerms?.includes("system telemetry source Q/A review"), "source Q/A review: missing discovery term");
  assert(review.sourceConversationId === "019e359b-c0ab-7dc1-ba94-11a49d11dc76", "source Q/A review: wrong sourceConversationId");
  assert(review.sourcePlanId === "019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan", "source Q/A review: wrong sourcePlanId");
  assert(review.sourceSessionRef === "private-session-not-published", "source Q/A review: must not publish private source session path");
  assert(!JSON.stringify(review).includes("/Users/"), "source Q/A review: must not publish private filesystem paths");
  assert(review.status === "complete_with_external_pending", "source Q/A review: status must keep external blockers visible");
  assert(review.reviewedUserRoleMessages === 102, "source Q/A review: reviewed user-role message count drifted");
  assert(review.decisionBearingRowsReviewed === 10, "source Q/A review: decision-bearing row count drifted");
  for (const decisionId of ["D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11"]) {
    assert(review.decisionIdsReviewed?.includes(decisionId), `source Q/A review: missing ${decisionId}`);
  }
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    assert(review.externalPendingRows?.includes(rowId), `source Q/A review: missing external-pending ${rowId}`);
  }
  for (const rowId of ["SYS-TEL-EXT-004", "SYS-TEL-EXT-005", "SYS-TEL-EXT-006"]) {
    assert(review.validatedLocalRows?.includes(rowId), `source Q/A review: missing validated-local ${rowId}`);
  }
  assert(Array.isArray(review.rows) && review.rows.length === 10, "source Q/A review: must contain exactly 10 reviewed source rows");
  const rows = new Map(review.rows.map((row) => [row.qaId, row]));
  for (const [qaId, sourceRow, sourceLine] of [
    ["STQA-001", "USER_002", 6],
    ["STQA-002", "USER_004", 55],
    ["STQA-003", "USER_005", 325],
    ["STQA-004", "USER_006", 450],
    ["STQA-005", "USER_007", 462],
    ["STQA-006", "USER_008", 514],
    ["STQA-007", "USER_009", 657],
    ["STQA-008", "USER_017", 3584],
    ["STQA-009", "USER_049", 11030],
    ["STQA-010", "USER_102", 21355],
  ]) {
    const row = rows.get(qaId);
    assert(row?.sourceRow === sourceRow, `source Q/A review: ${qaId} must map to ${sourceRow}`);
    assert(row?.sourceLine === sourceLine, `source Q/A review: ${qaId} source line drifted`);
    assert(Array.isArray(row?.evidenceRefs) && row.evidenceRefs.length > 0, `source Q/A review: ${qaId} must cite evidence`);
  }
  assert(rows.get("STQA-003")?.disposition === "implemented_with_external_pending", "source Q/A review: main plan row must preserve external-pending disposition");
  assert(rows.get("STQA-006")?.disposition === "active_closure_gate", "source Q/A review: goal creation row must stay an active closure gate");
  assert(review.completionPolicy?.requiresFinalSourceSessionReread === true, "source Q/A review: final source reread must be required");
  assert(review.completionPolicy?.requiresOneByOneDecisionReview === true, "source Q/A review: one-by-one decision review must be required");
  assert(review.completionPolicy?.requiresForbiddenNameScan === true, "source Q/A review: forbidden-name scan must be required");
  assert(review.completionPolicy?.externalPendingBlocksCompletion === true, "source Q/A review: external pending must block completion");
}

function assertDecisionMatrix() {
  const text = read("docs/system-telemetry-decision-matrix.md");
  for (const snippet of [
    "Source conversation: `019e359b-c0ab-7dc1-ba94-11a49d11dc76`",
    "Plan item: `019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan`",
    "Status: `active_goal_not_complete`",
    "source session path is intentionally not published here.",
    "| D01 | Provide a first-class framework plane",
    "SDK/custom-app read contracts `system.telemetry.snapshot` and `system.telemetry.history`",
    "| D02 | Cover computer hardware with a Mac-first portable contract",
    "Bluetooth-peripheral",
    "| D03 | Keep weather/time as useful context",
    "| D04 | Support multiple independent menu-bar indicators",
    "| D05 | Support a combined menu-bar widget/panel",
    "| D06 | Allow broad indicator variability",
    "| D07 | Prepare host and app surfaces for real-time display",
    "| D08 | Reuse and centralize retention, charts, rules, and events in Monitor",
    "operational `health_check` event coexistence",
    "metric purge fallback to rollups",
    "| D09 | Do not mention third-party monitoring product names",
    "| D10 | Pin the goal to the conversation id, plan id, source review",
    "| D11 | Do not close the goal until everything is implemented",
    "docs/system-telemetry-external-validation.manifest.json",
    "external validation manifest",
    "docs/system-telemetry-source-qa-review.json",
    "source Q/A review",
    "`SYS-TEL-EXT-001`, `SYS-TEL-EXT-002`, or `SYS-TEL-EXT-003` remain",
    "structured external-validation manifest",
    "reflected in `docs/system-telemetry-source-qa-review.json`",
    "The forbidden-name scan has not been repeated",
  ]) {
    assert(text.includes(snippet), `docs/system-telemetry-decision-matrix.md: missing ${JSON.stringify(snippet)}`);
  }
  const decisionRows = text.match(/^\| D\d{2} \|/gm) ?? [];
  assert(decisionRows.length === 11, "docs/system-telemetry-decision-matrix.md: must contain exactly D01-D11 decision rows");
  assert(!text.includes("/Users/"), "docs/system-telemetry-decision-matrix.md: must not publish private filesystem paths");
}

function assertDocsAndRegistry() {
  for (const [file, snippets] of [
    ["docs/cli.md", [
      "claw system snapshot --json",
      "claw system providers plan context.weather.live",
      "claw system controls execute system.audio.set_output_volume",
      "claw inspect route system.telemetryAgentContext --json",
      "portable `auditPlan`",
      "system.sensor.fan_speed",
      "chart-ready",
      "ASCII `render` sparkline",
      "read-only experimental AppleSMC sensor path",
      "local CLI snapshot path",
      "redacted weather location tags",
      "provided_redacted",
      "`adapterContract`",
      "system_telemetry_metric_sample",
      "adapterContract.output.metrics",
      "stable contract real provider plugins",
      ".claw/data/system-telemetry-audit.jsonl",
      "Local CLI provider and control",
    ]],
    ["docs/api.md", [
      "/v1/system/providers/plan",
      "/v1/system/controls/plan",
      "metric_samples",
      "chart-ready `chart` object",
      "ASCII",
      "`render` sparkline",
      "signed-host operation",
      "portable `auditPlan`",
      "provided_redacted",
      "`adapterContract`",
      "portable plugin contract",
      "adapterContract.output.metrics",
      "external-pending-until-receipt",
      "system.telemetry.snapshot",
      "claw.system.telemetry.snapshot.v1",
      "system.telemetry.history",
      "claw.system.telemetry.history.v1",
    ]],
    ["docs/decision-map.md", [
      "System telemetry, context widgets, Monitor-backed history, and menu-bar indicators",
      "./system-telemetry-decision-matrix.md",
      "./system-telemetry-external-pending-validation.md",
      "docs/system-telemetry-external-validation.manifest.json",
      "docs/system-telemetry-source-qa-review.json",
      "npm run test:system-telemetry-goal",
    ]],
    ["docs/discoverability.registry.json", [
      "\"id\": \"system-telemetry-decision-matrix\"",
      "\"canonicalSource\": \"docs/system-telemetry-decision-matrix.md\"",
      "\"query\": \"system telemetry decision matrix\"",
      "\"id\": \"system-telemetry-external-pending-ledger\"",
      "\"canonicalSource\": \"docs/system-telemetry-external-pending-validation.md\"",
      "\"query\": \"system telemetry external pending validation\"",
      "\"id\": \"system-telemetry-external-validation-manifest\"",
      "\"canonicalSource\": \"docs/system-telemetry-external-validation.manifest.json\"",
      "\"query\": \"system telemetry external validation manifest\"",
      "\"id\": \"system-telemetry-source-qa-review\"",
      "\"canonicalSource\": \"docs/system-telemetry-source-qa-review.json\"",
      "\"query\": \"system telemetry source Q/A review\"",
    ]],
    ["docs/discoverability.md", [
      "`system-telemetry-decision-matrix`",
      "[docs/system-telemetry-decision-matrix.md](/system-telemetry-decision-matrix)",
      "`system-telemetry-external-pending-ledger`",
      "[docs/system-telemetry-external-pending-validation.md](/system-telemetry-external-pending-validation)",
      "`system-telemetry-external-validation-manifest`",
      "[docs/system-telemetry-external-validation.manifest.json](/system-telemetry-external-validation.manifest.json)",
      "`system-telemetry-source-qa-review`",
      "[docs/system-telemetry-source-qa-review.json](/system-telemetry-source-qa-review.json)",
    ]],
    ["packages/clawjs-core/src/surface-registry.ts", [
      "claw.systemTelemetry",
      "claw.systemTelemetry.contextProviders",
      "clawix.menuBar.systemIndicators",
      "system.telemetryAgentContext",
      "system.telemetrySignedHostControl",
      "clawix.menuBarSystemIndicators",
      "claw.systemTelemetry.audit.v1",
      "portable auditPlan metadata plus local CLI and signed-host redacted audit events",
      "provider catalog, fail-closed provider plans with provided_redacted credential projection",
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

function assertMcpAndApiTestCoverage() {
  const text = read("packages/clawjs-mcp/src/control-plane.test.ts");
  for (const snippet of [
    "exposes system telemetry MCP tools as read-only agent context",
    "serves system telemetry HTTP routes from catalog and Monitor history without creating stores",
    "system.snapshot",
    "system.metrics",
    "system.widgets",
    "system.providers",
    "system.provider_plan",
    "system.controls",
    "system.control_plan",
    "system.history",
    "auditPlan.redaction",
    "/v1/system/metrics",
    "/v1/system/snapshot",
    "/v1/system/widgets",
    "/v1/system/providers",
    "/v1/system/providers/plan",
    "/v1/system/controls",
    "/v1/system/controls/plan",
    "/v1/system/history/system.memory.used",
    "context.weather.temperature",
    "willConnect, false",
    "willExecute, false",
    "receiptStatus",
    "execute_native_action",
    "retention.status",
    "chart",
  ]) {
    assert(text.includes(snippet), `packages/clawjs-mcp/src/control-plane.test.ts: missing ${JSON.stringify(snippet)}`);
  }
}

function assertSdkSystemTelemetryCoverage() {
  const catalog = read("packages/clawjs-core/src/capability-catalog.ts");
  for (const snippet of [
    "id: \"system.telemetry.snapshot\"",
    "claw system snapshot --json",
    "inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetrySnapshotRequest",
    "outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetrySnapshot",
    "id: \"system.telemetry.history\"",
    "claw system history <metric-key> --range 1h|24h --json",
    "inputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryHistoryRequest",
    "outputSchemaRef: CUSTOM_APP_SDK_SCHEMA_REFS.systemTelemetryHistory",
    "customAppAccess: \"localWide\"",
  ]) {
    assert(catalog.includes(snippet), `capability-catalog.ts: missing system telemetry SDK coverage ${JSON.stringify(snippet)}`);
  }

  const contracts = read("packages/clawjs-core/src/custom-app-sdk-contracts.ts");
  for (const snippet of [
    "systemTelemetrySnapshotRequest",
    "claw.system.telemetry.snapshot.request.v1",
    "systemTelemetrySnapshot",
    "claw.system.telemetry.snapshot.v1",
    "systemTelemetryHistoryRequest",
    "claw.system.telemetry.history.request.v1",
    "systemTelemetryHistory",
    "claw.system.telemetry.history.v1",
    "source: z.literal(\"local\")",
    "includeUnavailable",
    "system.telemetry.history",
  ]) {
    assert(contracts.includes(snippet), `custom-app-sdk-contracts.ts: missing system telemetry SDK contract ${JSON.stringify(snippet)}`);
  }

  const tests = read("packages/clawjs-core/src/capability-catalog.test.ts");
  for (const snippet of [
    "custom-app SDK schemas validate read-only system telemetry contracts",
    "system.telemetry.snapshot",
    "system.telemetry.history",
    "source: \"host\"",
    "range: \"24h\"",
  ]) {
    assert(tests.includes(snippet), `capability-catalog.test.ts: missing system telemetry SDK test ${JSON.stringify(snippet)}`);
  }

  const inspectTests = read("packages/clawjs/src/inspect-cli.test.ts");
  for (const snippet of [
    "system.telemetry.snapshot",
    "claw.system.telemetry.snapshot.request.v1",
    "claw.system.telemetry.snapshot.v1",
    "system.telemetry.history",
    "claw.system.telemetry.history.request.v1",
    "claw.system.telemetry.history.v1",
    "payload.riskMap.approvalRequired.includes(\"system.telemetry.snapshot\"), false",
    "claw system history <metric-key> --range 1h|24h --json",
  ]) {
    assert(inspectTests.includes(snippet), `inspect-cli.test.ts: missing system telemetry SDK inspect coverage ${JSON.stringify(snippet)}`);
  }

  const inspection = parseCliPayload(claw(["inspect", "custom-app-sdk", "--json"]), "inspect custom-app-sdk");
  assert(inspection.missingSchemaRefs?.length === 0, "inspect custom-app-sdk: missing schema refs must be empty");
  assert(inspection.schemaRefs?.includes("claw.system.telemetry.snapshot.v1"), "inspect custom-app-sdk: missing snapshot schema");
  assert(inspection.schemaRefs?.includes("claw.system.telemetry.history.v1"), "inspect custom-app-sdk: missing history schema");
  assert(inspection.riskMap?.ordinaryAccess?.includes("system.telemetry.snapshot"), "inspect custom-app-sdk: snapshot must be ordinary read access");
  assert(inspection.riskMap?.ordinaryAccess?.includes("system.telemetry.history"), "inspect custom-app-sdk: history must be ordinary read access");
  assert(!inspection.riskMap?.approvalRequired?.includes("system.telemetry.snapshot"), "inspect custom-app-sdk: snapshot must not be approval-required");
  assert(!inspection.riskMap?.approvalRequired?.includes("system.telemetry.history"), "inspect custom-app-sdk: history must not be approval-required");
  const snapshot = inspection.capabilities?.find((capability) => capability.id === "system.telemetry.snapshot");
  const history = inspection.capabilities?.find((capability) => capability.id === "system.telemetry.history");
  assert(snapshot?.inputSchemaRef === "claw.system.telemetry.snapshot.request.v1", "inspect custom-app-sdk: snapshot input schema mismatch");
  assert(snapshot?.outputSchemaRef === "claw.system.telemetry.snapshot.v1", "inspect custom-app-sdk: snapshot output schema mismatch");
  assert(snapshot?.redactionPolicyRef === "claw.customApps.redaction.v1", "inspect custom-app-sdk: snapshot redaction policy missing");
  assert(history?.inputSchemaRef === "claw.system.telemetry.history.request.v1", "inspect custom-app-sdk: history input schema mismatch");
  assert(history?.outputSchemaRef === "claw.system.telemetry.history.v1", "inspect custom-app-sdk: history output schema mismatch");
  assert(history?.redactionPolicyRef === "claw.customApps.redaction.v1", "inspect custom-app-sdk: history redaction policy missing");
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
    "system.peripheral.bluetooth_count",
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

  const watchOutput = claw(["system", "watch", "--interval", "1", "--count", "2", "--jsonl"], { timeout: 30_000 }).trim();
  const lines = watchOutput.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert(lines.length === 2, `watch: expected 2 jsonl lines, found ${lines.length}`);
  assert(lines.every((line) => line.ok === true && line.meta?.intervalMs === 1 && line.meta?.format === "jsonl"), "watch: every line must be ok with requested interval and jsonl format");
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
  const liveWeatherProvider = providers.find((provider) => provider.id === "context.weather.live");
  assert(liveWeatherProvider?.adapterContract?.input?.credentialRef === "required_redacted", "providers: live weather adapter contract must require redacted credential refs");
  assert(liveWeatherProvider?.adapterContract?.input?.networkAccess === "blocked_until_granted", "providers: live weather adapter contract must block network until granted");
  assert(liveWeatherProvider?.adapterContract?.output?.sampleShape === "system_telemetry_metric_sample", "providers: adapter contract must declare sample shape");
  assert(liveWeatherProvider?.adapterContract?.output?.metrics?.includes("context.weather.temperature"), "providers: adapter contract must expose visible metrics");
  assert(liveWeatherProvider?.adapterContract?.output?.monitorWriteRequired === true, "providers: adapter contract must require Monitor writes");
  assert(liveWeatherProvider?.adapterContract?.audit?.durableReceiptSource === "provider_broker_or_signed_host", "providers: adapter contract must require broker or signed-host receipt source");
  assert(liveWeatherProvider?.adapterContract?.executionPolicy?.failClosed === true, "providers: adapter contract must fail closed");

  const weatherPlan = parseCliPayload(claw(["system", "providers", "plan", "context.weather.live", "--reason", "goal-verify", "--json"]), "weather provider plan");
  assert(weatherPlan.willConnect === false, "weather provider plan: must not connect");
  assert(weatherPlan.externalPending === true, "weather provider plan: must be external pending");
  assert(weatherPlan.provider?.metrics?.includes("context.weather.temperature"), "weather provider plan: missing visible metrics");
  assert(!Array.isArray(weatherPlan.provider?.metricKeys), "weather provider plan: metricKeys must not be exposed as an array in public CLI output");
  assert(weatherPlan.provider?.adapterContract?.providerId === "context.weather.live", "weather provider plan: missing adapter contract");
  assert(weatherPlan.provider?.adapterContract?.output?.metrics?.includes("context.weather.temperature"), "weather provider plan: adapter contract must expose visible metrics");
  assert(weatherPlan.provider?.adapterContract?.output?.monitorWriteRequired === true, "weather provider plan: adapter contract must require Monitor writes");
  assertIncludes(weatherPlan.policy?.requiredGrants, "weather.location.read", "weather provider plan grants");
  assert(weatherPlan.steps?.some((step) => step.id === "connect_provider" && step.status === "blocked"), "weather provider plan: connect step must be blocked");
  assert(weatherPlan.auditPlan?.redaction?.credentialRefRedacted === true, "weather provider plan: must expose portable credential redaction audit plan");
  assert(weatherPlan.auditPlan?.receiptStatus === "not_issued", "weather provider plan: audit plan must not claim receipt");

  const weatherCredentialPlan = parseCliPayload(claw(["system", "providers", "plan", "context.weather.live", "--credential-ref", "secret://weather/local", "--reason", "goal-credential-verify", "--json"]), "weather provider credential plan");
  assert(weatherCredentialPlan.request?.credentialRef === "provided_redacted", "weather provider credential plan: credential ref must be projected as redacted");
  assert(weatherCredentialPlan.steps?.some((step) => step.id === "resolve_credential_ref" && step.status === "pending"), "weather provider credential plan: credential step must stay pending, not connect");
  assert(!JSON.stringify(weatherCredentialPlan).includes("secret://weather/local"), "weather provider credential plan: must not expose credential ref");

  const sensorPlan = parseCliPayload(claw(["system", "providers", "plan", "system.sensors.signed", "--reason", "goal-verify", "--json"]), "sensor provider plan");
  assert(sensorPlan.willConnect === false, "sensor provider plan: must not connect");
  assert(sensorPlan.externalPending === true, "sensor provider plan: must be external pending");
  assert(sensorPlan.provider?.metrics?.includes("system.sensor.temperature"), "sensor provider plan: missing temperature metric");
  assert(sensorPlan.provider?.metrics?.includes("system.sensor.fan_speed"), "sensor provider plan: missing fan speed metric");
  assertIncludes(sensorPlan.policy?.requiredGrants, "system.sensor.read", "sensor provider plan grants");
  assert(sensorPlan.auditPlan?.event === "system.telemetry.provider.hardware_sensor.live", "sensor provider plan: must expose portable audit plan event");

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
  assert(fanPlan.auditPlan?.redaction?.valueRedacted === true, "fan control plan: must expose portable value redaction audit plan");
}

function assertNativeSensorReadPathCoverage() {
  const host = read("apps/host/Sources/CommanderCore/SystemTelemetry.swift");
  for (const snippet of [
    "hardwareSensorStats()",
    "SMCReadOnlySensorReader.open()",
    "IOServiceMatching(\"AppleSMC\")",
    "readTemperatureCelsius(key:",
    "readFanSpeedRPM(key:",
    "bluetoothPeripheralCount()",
    "IOBluetoothDevice",
    "IOBluetoothHIDDriver",
    "\"TC0P\"",
    "\"FNum\"",
    "\"F\\(index)Ac\"",
    "confidence: \"experimental\"",
    "system.sensor.temperature",
    "system.sensor.fan_speed",
    "Requires compatible read-only AppleSMC sensor service",
  ]) {
    assert(host.includes(snippet), `SystemTelemetry.swift: missing native sensor read path snippet ${JSON.stringify(snippet)}`);
  }
}

function assertSignedHostBrokerCoverage() {
  const cliSystem = read("packages/clawjs/src/cli-system-command.ts");
  for (const snippet of [
    "systemTelemetryAuditPath(",
    "system-telemetry-audit.jsonl",
    "appendSystemTelemetryPlanAudit(",
    "credentialRefRedacted",
    "valueRedacted",
    "auditStatus: \"recorded\"",
  ]) {
    assert(cliSystem.includes(snippet), `cli-system-command.ts: missing local plan audit snippet ${JSON.stringify(snippet)}`);
  }

  const coreTelemetry = read("packages/clawjs-core/src/system-telemetry.ts");
  for (const snippet of [
    "auditPlan",
    "SystemTelemetryPlanAuditProjection",
    "Portable plan audit projection only",
    "receiptStatus: \"not_issued\"",
  ]) {
    assert(coreTelemetry.includes(snippet), `system-telemetry.ts: missing portable audit plan snippet ${JSON.stringify(snippet)}`);
  }

  const commandService = read("apps/host/Sources/CommanderCore/CommandService.swift");
  for (const snippet of [
    "appendSystemTelemetryProviderPlanAudit(",
    "writeSystemTelemetryProviderPlanAudit(",
    "system-telemetry-provider-audit.jsonl",
    "\"credential_ref_redacted\"",
    "\"provider_id\"",
    "\"outcome\": \"blocked\"",
  ]) {
    assert(commandService.includes(snippet), `CommandService.swift: missing provider plan audit snippet ${JSON.stringify(snippet)}`);
  }

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
    "appendFailClosedAudit(",
    "\"value_redacted\"",
    "\"outcome\": \"blocked\"",
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
    "system-telemetry-provider-audit",
    "credential_ref_redacted",
    "context.weather.live",
    "execute_native_action",
    "audit_status",
    "value_redacted",
    "runner.nativeCalls.isEmpty",
  ]) {
    assert(tests.includes(snippet), `CommanderE2ETests.swift: missing ${JSON.stringify(snippet)}`);
  }

  const cliTests = read("packages/clawjs/src/index.test.ts");
  for (const snippet of [
    "system-telemetry-audit.jsonl",
    "credentialRefRedacted",
    "valueRedacted",
    "auditStatus",
  ]) {
    assert(cliTests.includes(snippet), `index.test.ts: missing local plan audit coverage ${JSON.stringify(snippet)}`);
  }
}

function assertLocalContextProviderCoverage() {
  const cli = read("packages/clawjs/src/cli-system-command.ts");
  for (const snippet of [
    "collectLocalContextProviderSamples()",
    "CLAW_CONTEXT_WEATHER_FILE",
    "CLAW_CONTEXT_BUILD_STATUS",
    "CLAW_CONTEXT_SERVICE_HEALTH",
    "CLAW_CONTEXT_AGENT_RUNS_ACTIVE",
    "CLAW_CONTEXT_CUSTOM_METRIC",
    "detail: \"local_fixture\"",
    "tags: { provider: \"context.weather.mock\", location: \"redacted\" }",
  ]) {
    assert(cli.includes(snippet), `cli-system-command.ts: missing local context provider snippet ${JSON.stringify(snippet)}`);
  }

  const tests = read("packages/clawjs/src/index.test.ts");
  for (const snippet of [
    "runCli records local context provider samples into monitor metric history",
    "context.weather.temperature",
    "CLAW_CONTEXT_WEATHER_FILE",
    "CLAW_CONTEXT_BUILD_STATUS",
    "redacted",
    "metric_samples",
  ]) {
    assert(tests.includes(snippet), `index.test.ts: missing local context provider coverage ${JSON.stringify(snippet)}`);
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

  const dayHistory = parseCliPayload(claw(["system", "history", "system.memory.used", "--range", "24h", "--monitor-db", monitorDb, "--json"]), "24h history");
  assert(dayHistory.rangeMs === 86_400_000, "24h history: must preserve 24h rangeMs");
  assert(dayHistory.retention?.status === "recorded", "24h history: retention status must be recorded");
  assert(dayHistory.chart?.source === "metric_samples", "24h history: chart must use recorded metric samples");
  assert(dayHistory.chart?.points?.some((point) => point.sourceId === "system.telemetry.local" && typeof point.value === "number"), "24h history: chart must expose recorded numeric points");
  assert(dayHistory.render?.kind === "ascii_sparkline", "24h history: missing ASCII sparkline render");

  const purgeMonitorDb = path.join(workspaceRoot, "monitor-purge.sqlite");
  seedOperationalHealthEvent(purgeMonitorDb);
  const purgedSnapshot = parseCliPayload(claw([
    "system", "snapshot",
    "--record", "true",
    "--raw-retention", "0m",
    "--monitor-db", purgeMonitorDb,
    "--json",
  ]), "purged snapshot");
  assert(purgedSnapshot.recorded?.purged?.samples >= 1, "purged snapshot: metric samples must be purged under short retention");
  assertOperationalHealthEventRetained(purgeMonitorDb);
  const purgedHistory = parseCliPayload(claw(["system", "history", "system.memory.used", "--range", "1h", "--monitor-db", purgeMonitorDb, "--json"]), "purged history");
  assert(purgedHistory.samples?.length === 0, "purged history: raw metric samples must be empty after purge");
  assert(purgedHistory.chart?.source === "metric_rollups", "purged history: chart must fall back to metric rollups");

  const deletedRule = parseCliPayload(claw([
    "system", "rules", "delete", "memory-any",
    "--workspace", workspaceRoot,
    "--json",
  ]), "rules delete");
  assert(deletedRule.deleted === "memory-any", "rules delete: missing deleted id");
  assert(deletedRule.mutatesHardware === false, "rules delete: must not mutate hardware");
  assert(!deletedRule.rules?.some((rule) => rule.id === "memory-any"), "rules delete: rule must be absent after delete");

  const upsertWidget = parseCliPayload(claw([
    "system", "widgets", "upsert", "goal-memory-widget",
    "--metric-key", "system.memory.used",
    "--title", "Memory",
    "--presentation", "sparkline",
    "--placement", "menubar",
    "--enabled", "true",
    "--workspace", workspaceRoot,
    "--json",
  ]), "widgets upsert");
  assert(upsertWidget.widget?.id === "goal-memory-widget", "widgets upsert: missing created widget");
  assert(upsertWidget.hostSpecific === true, "widgets upsert: must be host specific");

  const listWidgets = parseCliPayload(claw([
    "system", "widgets", "list",
    "--workspace", workspaceRoot,
    "--json",
  ]), "widgets list");
  assert(listWidgets.widgets?.some((widget) => widget.id === "goal-memory-widget"), "widgets list: missing created widget");

  const deletedWidget = parseCliPayload(claw([
    "system", "widgets", "delete", "goal-memory-widget",
    "--workspace", workspaceRoot,
    "--json",
  ]), "widgets delete");
  assert(deletedWidget.deleted === "goal-memory-widget", "widgets delete: missing deleted id");
  assert(deletedWidget.hostSpecific === true, "widgets delete: must be host specific");
  assert(!deletedWidget.widgets?.some((widget) => widget.id === "goal-memory-widget"), "widgets delete: widget must be absent after delete");
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

  const credentialRedaction = parseCliPayload(claw(["search", "system telemetry provider credential redaction", "--json"]), "search provider credential redaction");
  const credentialRedactionResults = credentialRedaction.results ?? [];
  assert(credentialRedactionResults.some((result) => result.path === "docs/cli.md" && String(result.summary ?? "").includes("provided_redacted")), "search provider credential redaction: missing CLI redaction contract");

  const sdkTelemetry = parseCliPayload(claw(["search", "system telemetry SDK custom app", "--json"]), "search system telemetry SDK custom app");
  const sdkTelemetryResults = sdkTelemetry.results ?? [];
  assert(sdkTelemetryResults.some((result) => result.path === "docs/cli.md" && String(result.summary ?? "").includes("System telemetry SDK custom-app contracts")), "search system telemetry SDK custom app: missing CLI SDK contract docs");

  const decisionMatrix = parseCliPayload(claw(["search", "system telemetry decision matrix", "--json"]), "search system telemetry decision matrix");
  const decisionMatrixResults = decisionMatrix.results ?? [];
  assert(decisionMatrixResults.some((result) => result.path === "docs/system-telemetry-decision-matrix.md"), "search system telemetry decision matrix: missing decision matrix doc");

  const externalLedger = parseCliPayload(claw(["search", "system telemetry external pending validation", "--json"]), "search system telemetry external pending validation");
  const externalLedgerResults = externalLedger.results ?? [];
  assert(externalLedgerResults.some((result) => result.path === "docs/system-telemetry-external-pending-validation.md"), "search system telemetry external pending validation: missing external-pending ledger doc");

  const route = parseCliPayload(claw(["inspect", "route", "system.telemetryAgentContext", "--json"]), "inspect credential redaction route");
  assert(route.edges?.some((edge) => edge.id === "claw.edge.system.telemetry.consumes.contextProviders" && String(edge.transport ?? "").includes("provided_redacted credential projection")), "inspect route: provider edge must expose credential redaction projection");
}

function main() {
  assert(fs.existsSync(clawSourceRunner), "scripts/claw-source-runner.mjs is missing");
  assertNoForbiddenPublicNames();
  assertExternalPendingLedger();
  assertExternalValidationManifest();
  assertSourceQaReview();
  assertDecisionMatrix();
  assertDocsAndRegistry();
  assertMcpAndApiTestCoverage();
  assertSdkSystemTelemetryCoverage();
  assertMetricCatalog();
  assertSnapshotAndWatch();
  assertProvidersAndControls();
  assertSystemCapabilitiesAlias();
  assertNativeSensorReadPathCoverage();
  assertLocalContextProviderCoverage();
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
