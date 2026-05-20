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
const Ajv2020Module = require("ajv/dist/2020");
const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;
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

function publicSafetyErrors(value) {
  const serialized = JSON.stringify(value);
  const checks = [
    ["/Users/", "private filesystem path"],
    ["file://", "file URL"],
    ["secret://", "raw secret reference"],
    ["-----BEGIN", "key material marker"],
    ["sk-", "API key-like token"],
    ["AKIA", "cloud access key-like token"],
  ];
  return checks
    .filter(([needle]) => serialized.includes(needle))
    .map(([, label]) => `contains ${label}`);
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

function sqliteHasTable(sqlite, tableName) {
  const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return row?.name === tableName;
}

function assertOperationalHealthEventRetained(dbPath) {
  const sqlite = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const event = sqlite.prepare("SELECT id, kind, message FROM operational_events WHERE id = ?").get("goal-health-heartbeat");
    assert(event?.kind === "health_check", "monitor retention: operational health event kind must survive metric purge");
    assert(event?.message === "Worker alive", "monitor retention: operational health event message must survive metric purge");
    assert(sqliteHasTable(sqlite, "metric_rollups"), "monitor retention: metric_rollups table must exist after recording into an existing Monitor database");
    if (!sqliteHasTable(sqlite, "metric_rollups")) return;
    const rollup = sqlite.prepare("SELECT COUNT(*) AS count FROM metric_rollups WHERE metric_key = ?").get("system.memory.used");
    assert(rollup?.count >= 1, "monitor retention: metric rollups must coexist with operational health events");
  } finally {
    sqlite.close();
  }
}

function assertIncludes(array, value, label) {
  assert(Array.isArray(array) && array.includes(value), `${label}: missing ${value}`);
}

function assertSameStringSet(actual, expected, label) {
  assert(Array.isArray(actual), `${label}: must be an array`);
  if (!Array.isArray(actual)) return;
  const normalizedActual = [...actual].sort();
  const normalizedExpected = [...expected].sort();
  assert(normalizedActual.length === normalizedExpected.length, `${label}: must contain exactly ${normalizedExpected.length} entries`);
  for (let index = 0; index < normalizedExpected.length; index += 1) {
    assert(normalizedActual[index] === normalizedExpected[index], `${label}: expected exact set ${normalizedExpected.join(", ")}`);
  }
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
  const text = read("docs/governance/system-telemetry/external-pending.md");
  for (const snippet of [
    "Source conversation: `019e359b-c0ab-7dc1-ba94-11a49d11dc76`",
    "Plan item: `019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan`",
    "Status: `active_goal_not_complete`",
    "`EXTERNAL PENDING` are not passes and must not be used to close the goal.",
    "`docs/governance/system-telemetry/external-validation.manifest.json` and",
    "`docs/governance/system-telemetry/source-review.json`",
    "status in `docs/governance/system-telemetry/completion.md`",
    "external run steps in",
    "`docs/governance/system-telemetry/external-validation-runbook.md`",
    "`docs/governance/system-telemetry/external-approval.schema.json`",
    "Accepted external",
    "`docs/governance/system-telemetry/external-evidence.schema.json`",
    "`docs/governance/system-telemetry/external-validation.manifest.schema.json`",
    "`docs/governance/system-telemetry/external-validation.manifest.fixtures.json`",
    "accidental completion or lane-clear mutations fail validation",
    "`node scripts/validate-system-telemetry-external-evidence.mjs <packet.json>`",
    "before any row is updated",
    "`docs/governance/system-telemetry/external-approval.fixtures.json`",
    "not real approval",
    "`node scripts/validate-system-telemetry-external-approval.mjs <packet.json>`",
    "before any external execution starts",
    "`docs/governance/system-telemetry/external-closure.fixtures.json`",
    "`node scripts/validate-system-telemetry-external-closure.mjs <bundle.json>`",
    "same-lane approval and evidence bundle",
    "public-safe rows, the completion audit binds each goal requirement",
    "runbook binds each remaining external lane to preflight, approval, evidence,",
    "update target, fail-rule, and evidence-packet checks",
    "| SYS-TEL-EXT-001 | Live weather/context provider connection |",
    "| SYS-TEL-EXT-002 | Physical hardware sensor and fan telemetry |",
    "| SYS-TEL-EXT-003 | Dangerous hardware or system controls |",
    "| SYS-TEL-EXT-004 | Signed-host live recording loop |",
    "| SYS-TEL-EXT-005 | Strict native menu-bar visual and interaction validation |",
    "| SYS-TEL-EXT-006 | Native time-series graph UI over retained telemetry |",
    "read-only experimental AppleSMC path",
    "missing AppleSMC service or missing compatible keys remains a valid external blocker",
    ".claw/data/system-telemetry-audit.jsonl",
    "claw.workspace.data/system-telemetry-audit.jsonl",
    "not a local filesystem path",
    "local redacted JSONL plan audit",
    "provided_redacted",
    "redacted JSONL audit evidence for blocked provider plans",
    "not a provider execution receipt",
    "redacted JSONL audit evidence for unsupported/high-risk blocked controls",
    "not an execution receipt",
    "## External Validation Lanes",
    "[System Telemetry External Validation Runbook](./external-validation-runbook.md)",
    "[`docs/governance/system-telemetry/external-evidence.schema.json`](./external-evidence.schema.json)",
    "[`docs/governance/system-telemetry/external-approval.schema.json`](./external-approval.schema.json)",
    "[`docs/governance/system-telemetry/external-approval.fixtures.json`](./external-approval.fixtures.json)",
    "Approval packets are checked with",
    "| SYS-TEL-EXT-001 | Live context provider lane:",
    "| SYS-TEL-EXT-002 | Signed sensor provider lane:",
    "| SYS-TEL-EXT-003 | Dangerous-control lane:",
    "Rows must stay `EXTERNAL PENDING` if any approval, hardware/provider path,",
    "must not be downgraded to `EXTERNAL PENDING`",
  ]) {
    assert(text.includes(snippet), `docs/governance/system-telemetry/external-pending.md: missing ${JSON.stringify(snippet)}`);
  }

  const requiredRows = [
    "SYS-TEL-EXT-001",
    "SYS-TEL-EXT-002",
    "SYS-TEL-EXT-003",
  ];
  for (const rowId of requiredRows) {
    const rowPattern = new RegExp(`\\|\\s*${rowId}\\s*\\|[^\\n]*\\|\\s*EXTERNAL PENDING\\s*\\|`);
    assert(rowPattern.test(text), `docs/governance/system-telemetry/external-pending.md: ${rowId} must remain EXTERNAL PENDING`);
  }

  const validatedRows = [
    "SYS-TEL-EXT-004",
    "SYS-TEL-EXT-005",
    "SYS-TEL-EXT-006",
  ];
  for (const rowId of validatedRows) {
    const rowPattern = new RegExp(`\\|\\s*${rowId}\\s*\\|[^\\n]*\\|\\s*VALIDATED LOCAL\\s*\\|`);
    assert(rowPattern.test(text), `docs/governance/system-telemetry/external-pending.md: ${rowId} must remain VALIDATED LOCAL`);
  }
}

function assertExternalValidationManifest() {
  const manifest = readJson("docs/governance/system-telemetry/external-validation.manifest.json");
  assert(manifest.$schema === "docs/governance/system-telemetry/external-validation.manifest.schema.json", "external validation manifest: wrong schema ref");
  assert(manifest.schemaVersion === 1, "external validation manifest: schemaVersion must be 1");
  assert(manifest.id === "system-telemetry-external-validation-manifest", "external validation manifest: wrong id");
  assert(manifest.conversationId === "019e359b-c0ab-7dc1-ba94-11a49d11dc76", "external validation manifest: wrong conversationId");
  assert(manifest.planId === "019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan", "external validation manifest: wrong planId");
  assert(manifest.status === "active_goal_not_complete", "external validation manifest: goal must remain active");
  assert(manifest.completionPolicy?.externalPendingBlocksCompletion === true, "external validation manifest: external pending must block completion");
  assert(manifest.completionPolicy?.requiresFinalSourceAudit === true, "external validation manifest: final source audit must be required");
  assert(manifest.completionPolicy?.requiresSourceQaReview === true, "external validation manifest: source Q/A review must be required");
  assert(manifest.completionPolicy?.requiresCompletionAudit === true, "external validation manifest: completion audit must be required");
  assert(manifest.completionPolicy?.requiresExternalValidationRunbook === true, "external validation manifest: external validation runbook must be required");
  assert(manifest.completionPolicy?.requiresExternalEvidenceSchema === true, "external validation manifest: external evidence schema must be required");
  assert(manifest.completionPolicy?.requiresForbiddenNameScan === true, "external validation manifest: forbidden-name scan must be required");
  assert(manifest.completionPolicy?.requiresExactRunApprovalForExternalLanes === true, "external validation manifest: exact-run approval must be required");
  assert(manifest.sourceQaReview?.required === true, "external validation manifest: source Q/A review link must be required");
  assert(manifest.sourceQaReview?.artifactId === "system-telemetry-source-qa-review", "external validation manifest: wrong source Q/A artifact");
  assert(manifest.sourceQaReview?.path === "docs/governance/system-telemetry/source-review.json", "external validation manifest: wrong source Q/A path");
  assert(manifest.sourceQaReview?.privateAuditAlias === "private-goal-audit:claw-system-telemetry-context-menubar-source-audit-2026-05-20", "external validation manifest: wrong private audit alias");
  assert(manifest.sourceQaReview?.closureRole?.includes("public-safe validation rows"), "external validation manifest: source Q/A closure role must be explicit");
  assert(manifest.completionAudit?.required === true, "external validation manifest: completion audit link must be required");
  assert(manifest.completionAudit?.artifactId === "system-telemetry-completion-audit", "external validation manifest: wrong completion audit artifact");
  assert(manifest.completionAudit?.path === "docs/governance/system-telemetry/completion.md", "external validation manifest: wrong completion audit path");
  assert(manifest.completionAudit?.requiredRowPrefix === "STA", "external validation manifest: wrong completion audit row prefix");
  assert(manifest.completionAudit?.requiredRowCount === 18, "external validation manifest: wrong completion audit row count");
  assert(manifest.completionAudit?.statusSummary?.validatedLocalRows === 14, "external validation manifest: wrong completion audit validated-local count");
  assert(manifest.completionAudit?.statusSummary?.activeClosureGateRows === 1, "external validation manifest: wrong completion audit active-closure-gate count");
  assert(manifest.completionAudit?.statusSummary?.externalPendingRows === 3, "external validation manifest: wrong completion audit external-pending count");
  for (const rowId of ["STA-016", "STA-017", "STA-018"]) {
    assert(manifest.completionAudit?.statusSummary?.externalPendingRowIds?.includes(rowId), `external validation manifest: completion audit status summary missing ${rowId}`);
  }
  assert(manifest.completionAudit?.closureRole?.includes("requirement by requirement"), "external validation manifest: completion audit closure role must be explicit");
  assert(manifest.externalValidationRunbook?.required === true, "external validation manifest: external validation runbook link must be required");
  assert(manifest.externalValidationRunbook?.artifactId === "system-telemetry-external-validation-runbook", "external validation manifest: wrong external validation runbook artifact");
  assert(manifest.externalValidationRunbook?.path === "docs/governance/system-telemetry/external-validation-runbook.md", "external validation manifest: wrong external validation runbook path");
  assert(manifest.externalValidationRunbook?.laneCount === 3, "external validation manifest: wrong external validation runbook lane count");
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    assert(manifest.externalValidationRunbook?.externalPendingRowIds?.includes(rowId), `external validation manifest: external validation runbook missing ${rowId}`);
  }
  assert(manifest.externalValidationRunbook?.closureRole?.includes("safe preflight"), "external validation manifest: external validation runbook closure role must be explicit");
  assert(manifest.externalApprovalPacketSchema?.required === true, "external validation manifest: external approval packet schema link must be required");
  assert(manifest.externalApprovalPacketSchema?.artifactId === "system-telemetry-external-approval-schema", "external validation manifest: wrong external approval schema artifact");
  assert(manifest.externalApprovalPacketSchema?.path === "docs/governance/system-telemetry/external-approval.schema.json", "external validation manifest: wrong external approval schema path");
  assert(manifest.externalApprovalPacketSchema?.laneCount === 3, "external validation manifest: wrong external approval schema lane count");
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    assert(manifest.externalApprovalPacketSchema?.externalPendingRowIds?.includes(rowId), `external validation manifest: external approval schema missing ${rowId}`);
  }
  assert(manifest.externalApprovalPacketSchema?.closureRole?.includes("exact-run approval packet"), "external validation manifest: external approval schema closure role must be explicit");
  assert(manifest.externalApprovalFixtures?.required === true, "external validation manifest: external approval fixtures link must be required");
  assert(manifest.externalApprovalFixtures?.artifactId === "system-telemetry-external-approval-fixtures", "external validation manifest: wrong external approval fixtures artifact");
  assert(manifest.externalApprovalFixtures?.path === "docs/governance/system-telemetry/external-approval.fixtures.json", "external validation manifest: wrong external approval fixtures path");
  assert(manifest.externalApprovalFixtures?.status === "synthetic_templates_not_approval", "external validation manifest: external approval fixtures must be marked synthetic");
  assert(manifest.externalApprovalFixtures?.validTemplateCount === 3, "external validation manifest: wrong external approval valid fixture count");
  assert(manifest.externalApprovalFixtures?.invalidTemplateCount === 9, "external validation manifest: wrong external approval invalid fixture count");
  assert(manifest.externalApprovalFixtures?.closureRole?.includes("without representing real approval"), "external validation manifest: external approval fixtures closure role must be explicit");
  assert(manifest.externalApprovalPacketValidator?.required === true, "external validation manifest: external approval validator link must be required");
  assert(manifest.externalApprovalPacketValidator?.artifactId === "system-telemetry-external-approval-validator", "external validation manifest: wrong external approval validator artifact");
  assert(manifest.externalApprovalPacketValidator?.path === "scripts/validate-system-telemetry-external-approval.mjs", "external validation manifest: wrong external approval validator path");
  assert(manifest.externalApprovalPacketValidator?.fixtureCommand === "node scripts/validate-system-telemetry-external-approval.mjs --fixtures", "external validation manifest: wrong external approval validator fixture command");
  assert(manifest.externalApprovalPacketValidator?.packetCommand === "node scripts/validate-system-telemetry-external-approval.mjs <packet.json>", "external validation manifest: wrong external approval validator packet command");
  assert(manifest.externalApprovalPacketValidator?.closureRole?.includes("validates any future exact-run approval packet"), "external validation manifest: external approval validator closure role must be explicit");
  assert(manifest.externalEvidencePacketSchema?.required === true, "external validation manifest: external evidence packet schema link must be required");
  assert(manifest.externalEvidencePacketSchema?.artifactId === "system-telemetry-external-evidence-schema", "external validation manifest: wrong external evidence schema artifact");
  assert(manifest.externalEvidencePacketSchema?.path === "docs/governance/system-telemetry/external-evidence.schema.json", "external validation manifest: wrong external evidence schema path");
  assert(manifest.externalEvidencePacketSchema?.laneCount === 3, "external validation manifest: wrong external evidence schema lane count");
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    assert(manifest.externalEvidencePacketSchema?.externalPendingRowIds?.includes(rowId), `external validation manifest: external evidence schema missing ${rowId}`);
  }
  assert(manifest.externalEvidencePacketSchema?.closureRole?.includes("redacted receipt"), "external validation manifest: external evidence schema closure role must be explicit");
  assert(manifest.externalEvidenceFixtures?.required === true, "external validation manifest: external evidence fixtures link must be required");
  assert(manifest.externalEvidenceFixtures?.artifactId === "system-telemetry-external-evidence-fixtures", "external validation manifest: wrong external evidence fixtures artifact");
  assert(manifest.externalEvidenceFixtures?.path === "docs/governance/system-telemetry/external-evidence.fixtures.json", "external validation manifest: wrong external evidence fixtures path");
  assert(manifest.externalEvidenceFixtures?.status === "synthetic_templates_not_evidence", "external validation manifest: external evidence fixtures must be marked synthetic");
  assert(manifest.externalEvidenceFixtures?.validTemplateCount === 3, "external validation manifest: wrong valid fixture count");
  assert(manifest.externalEvidenceFixtures?.invalidTemplateCount === 10, "external validation manifest: wrong invalid fixture count");
  assert(manifest.externalEvidenceFixtures?.closureRole?.includes("without representing real external evidence"), "external validation manifest: external evidence fixtures closure role must be explicit");
  assert(manifest.externalEvidencePacketValidator?.required === true, "external validation manifest: external evidence validator link must be required");
  assert(manifest.externalEvidencePacketValidator?.artifactId === "system-telemetry-external-evidence-validator", "external validation manifest: wrong external evidence validator artifact");
  assert(manifest.externalEvidencePacketValidator?.path === "scripts/validate-system-telemetry-external-evidence.mjs", "external validation manifest: wrong external evidence validator path");
  assert(manifest.externalEvidencePacketValidator?.fixtureCommand === "node scripts/validate-system-telemetry-external-evidence.mjs --fixtures", "external validation manifest: wrong external evidence validator fixture command");
  assert(manifest.externalEvidencePacketValidator?.packetCommand === "node scripts/validate-system-telemetry-external-evidence.mjs <packet.json>", "external validation manifest: wrong external evidence validator packet command");
  assert(manifest.externalEvidencePacketValidator?.closureRole?.includes("validates any future redacted evidence packet"), "external validation manifest: external evidence validator closure role must be explicit");
  assert(manifest.externalClosureFixtures?.required === true, "external validation manifest: external closure fixtures link must be required");
  assert(manifest.externalClosureFixtures?.artifactId === "system-telemetry-external-closure-fixtures", "external validation manifest: wrong external closure fixtures artifact");
  assert(manifest.externalClosureFixtures?.path === "docs/governance/system-telemetry/external-closure.fixtures.json", "external validation manifest: wrong external closure fixtures path");
  assert(manifest.externalClosureFixtures?.status === "synthetic_templates_not_closure", "external validation manifest: external closure fixtures must be synthetic");
  assert(manifest.externalClosureFixtures?.validTemplateCount === 3, "external validation manifest: wrong external closure valid fixture count");
  assert(manifest.externalClosureFixtures?.invalidMutationCount === 17, "external validation manifest: wrong external closure invalid mutation count");
  assert(manifest.externalClosureFixtures?.closureRole?.includes("approval id, exact run scope, approving actor, approved action grants, credential/native grants, approval window, evidence timeline"), "external validation manifest: external closure fixtures closure role must be explicit");
  assert(manifest.externalClosureBundleValidator?.required === true, "external validation manifest: external closure validator link must be required");
  assert(manifest.externalClosureBundleValidator?.artifactId === "system-telemetry-external-closure-validator", "external validation manifest: wrong external closure validator artifact");
  assert(manifest.externalClosureBundleValidator?.path === "scripts/validate-system-telemetry-external-closure.mjs", "external validation manifest: wrong external closure validator path");
  assert(manifest.externalClosureBundleValidator?.fixtureCommand === "node scripts/validate-system-telemetry-external-closure.mjs --fixtures", "external validation manifest: wrong external closure validator fixture command");
  assert(manifest.externalClosureBundleValidator?.bundleCommand === "node scripts/validate-system-telemetry-external-closure.mjs <bundle.json>", "external validation manifest: wrong external closure validator bundle command");
  assert(manifest.externalClosureBundleValidator?.closureRole?.includes("approval-plus-evidence closure bundle"), "external validation manifest: external closure validator closure role must be explicit");
  assert(manifest.externalValidationManifestFixtures?.required === true, "external validation manifest: manifest fixtures link must be required");
  assert(manifest.externalValidationManifestFixtures?.artifactId === "system-telemetry-external-validation-manifest-fixtures", "external validation manifest: wrong manifest fixtures artifact");
  assert(manifest.externalValidationManifestFixtures?.path === "docs/governance/system-telemetry/external-validation.manifest.fixtures.json", "external validation manifest: wrong manifest fixtures path");
  assert(manifest.externalValidationManifestFixtures?.status === "synthetic_templates_not_evidence", "external validation manifest: manifest fixtures must be synthetic");
  assert(manifest.externalValidationManifestFixtures?.validTemplateCount === 1, "external validation manifest: wrong manifest valid fixture count");
  assert(manifest.externalValidationManifestFixtures?.invalidMutationCount === 8, "external validation manifest: wrong manifest invalid mutation count");
  assert(manifest.externalValidationManifestFixtures?.closureRole?.includes("rejects accidental completion"), "external validation manifest: manifest fixtures closure role must be explicit");
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

function assertExternalValidationManifestSchema() {
  const schema = readJson("docs/governance/system-telemetry/external-validation.manifest.schema.json");
  const manifest = readJson("docs/governance/system-telemetry/external-validation.manifest.json");
  const serialized = JSON.stringify(schema);
  assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "external validation manifest schema: wrong JSON schema version");
  assert(schema.$id === "https://clawjs.dev/schemas/governance/system-telemetry/external-validation.manifest.schema.json", "external validation manifest schema: wrong id");
  assert(schema.title === "System Telemetry External Validation Manifest", "external validation manifest schema: wrong title");
  for (const snippet of [
    "active_goal_not_complete",
    "externalPendingBlocksCompletion",
    "requiresExactRunApprovalForExternalLanes",
    "SYS-TEL-EXT-001",
    "SYS-TEL-EXT-002",
    "SYS-TEL-EXT-003",
    "VALIDATED LOCAL",
    "EXTERNAL PENDING",
    "docs/governance/system-telemetry/external-approval.fixtures.json",
    "scripts/validate-system-telemetry-external-approval.mjs",
    "docs/governance/system-telemetry/external-closure.fixtures.json",
    "scripts/validate-system-telemetry-external-closure.mjs",
    "scripts/validate-system-telemetry-external-evidence.mjs",
    "docs/governance/system-telemetry/external-validation.manifest.fixtures.json",
  ]) {
    assert(serialized.includes(snippet), `external validation manifest schema: missing ${snippet}`);
  }
  const ajv = new Ajv2020({ allErrors: true, validateFormats: false, strict: false });
  const validate = ajv.compile(schema);
  assert(validate(manifest), `external validation manifest schema: manifest must validate: ${ajv.errorsText(validate.errors)}`);
  assert(!serialized.includes("/Users/"), "external validation manifest schema: must not publish private filesystem paths");
}

function assertExternalValidationManifestFixtures() {
  const fixtures = readJson("docs/governance/system-telemetry/external-validation.manifest.fixtures.json");
  const schema = readJson("docs/governance/system-telemetry/external-validation.manifest.schema.json");
  const manifest = readJson("docs/governance/system-telemetry/external-validation.manifest.json");
  assert(fixtures.schemaVersion === 1, "external validation manifest fixtures: schemaVersion must be 1");
  assert(fixtures.artifactId === "system-telemetry-external-validation-manifest-fixtures", "external validation manifest fixtures: wrong artifact id");
  assert(fixtures.status === "synthetic_templates_not_evidence", "external validation manifest fixtures: must be synthetic templates only");
  assert(fixtures.conversationId === "019e359b-c0ab-7dc1-ba94-11a49d11dc76", "external validation manifest fixtures: wrong conversation id");
  assert(fixtures.planId === "019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan", "external validation manifest fixtures: wrong plan id");
  assert(fixtures.schemaPath === "docs/governance/system-telemetry/external-validation.manifest.schema.json", "external validation manifest fixtures: wrong schema path");
  assert(fixtures.manifestPath === "docs/governance/system-telemetry/external-validation.manifest.json", "external validation manifest fixtures: wrong manifest path");
  assert(Array.isArray(fixtures.validSyntheticManifests) && fixtures.validSyntheticManifests.length === 1, "external validation manifest fixtures: must contain 1 valid manifest reference");
  assert(Array.isArray(fixtures.invalidSyntheticMutations) && fixtures.invalidSyntheticMutations.length === 8, "external validation manifest fixtures: must contain 8 invalid mutations");
  const ajv = new Ajv2020({ allErrors: true, validateFormats: false, strict: false });
  const validate = ajv.compile(schema);
  assert(validate(manifest), `external validation manifest fixtures: current manifest must validate: ${ajv.errorsText(validate.errors)}`);
  for (const fixture of fixtures.invalidSyntheticMutations) {
    const mutated = JSON.parse(JSON.stringify(manifest));
    switch (fixture.mutation) {
      case "set_manifest_status_complete":
        mutated.status = "complete";
        break;
      case "set_external_pending_rows_zero":
        mutated.completionAudit.statusSummary.externalPendingRows = 0;
        break;
      case "mark_first_external_lane_validated_local": {
        const row = mutated.rows.find((candidate) => candidate.id === "SYS-TEL-EXT-001");
        row.status = "VALIDATED LOCAL";
        row.blockingPrerequisites = [];
        break;
      }
      case "delete_external_evidence_packet_validator":
        delete mutated.externalEvidencePacketValidator;
        break;
      case "delete_external_approval_packet_validator":
        delete mutated.externalApprovalPacketValidator;
        break;
      case "delete_external_closure_bundle_validator":
        delete mutated.externalClosureBundleValidator;
        break;
      case "set_external_closure_fixture_invalid_count_14":
        mutated.externalClosureFixtures.invalidMutationCount = 14;
        break;
      case "drop_external_pending_lane_id":
        mutated.externalValidationRunbook.externalPendingRowIds = ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002"];
        break;
      default:
        fail(`external validation manifest fixtures: unknown mutation ${fixture.mutation}`);
    }
    assert(!validate(mutated), `external validation manifest fixtures: invalid mutation ${fixture.id} must fail validation`);
    assert(typeof fixture.reason === "string" && fixture.reason.length > 0, `external validation manifest fixtures: mutation ${fixture.id} must document reason`);
  }
  assert(!JSON.stringify(fixtures).includes("/Users/"), "external validation manifest fixtures: must not publish private filesystem paths");
}

function mutateApprovalTemplate(packet, mutation) {
  const mutated = JSON.parse(JSON.stringify(packet));
  switch (mutation) {
    case "approval.exactRunApproved=false":
      mutated.approval.exactRunApproved = false;
      break;
    case "authorization.networkAccessApproved=false":
      mutated.authorization.networkAccessApproved = false;
      break;
    case "authorization.nativeGrantRefs=[]":
      mutated.authorization.nativeGrantRefs = [];
      break;
    case "approval.expiresAt=beforeApprovedAt":
      mutated.approval.expiresAt = "2026-05-19T23:59:59Z";
      break;
    case "approval.approvedAt=notTimestamp":
      mutated.approval.approvedAt = "not-a-timestamp";
      break;
    case "approval.approvedActions=extra":
      mutated.approval.approvedActions = [mutated.approval.approvedActions[0], "extra_unapproved_action_template"];
      break;
    case "authorization.credentialLeaseRefs=extra":
      mutated.authorization.credentialLeaseRefs = [mutated.authorization.credentialLeaseRefs[0], "extra_lease_template"];
      break;
    case "authorization.credentialLeaseRefs=rawSecretRef":
      mutated.authorization.credentialLeaseRefs = ["secret://raw-template"];
      break;
    case "closureImpact.externalPendingRows=extra":
      mutated.closureImpact.externalPendingRows = [mutated.laneId, "SYS-TEL-EXT-999"];
      break;
    default:
      fail(`external approval fixtures: unknown mutation ${mutation}`);
  }
  return mutated;
}

function approvalTemplateErrors(packet, validate, ajv) {
  const errors = [];
  errors.push(...publicSafetyErrors(packet));
  if (!validate(packet)) errors.push(ajv.errorsText(validate.errors));
  const approvedAt = Date.parse(packet.approval?.approvedAt);
  const expiresAt = Date.parse(packet.approval?.expiresAt);
  if (!Number.isFinite(approvedAt)) errors.push("approval.approvedAt must be parseable");
  if (!Number.isFinite(expiresAt)) errors.push("approval.expiresAt must be parseable");
  if (Number.isFinite(approvedAt) && Number.isFinite(expiresAt) && expiresAt <= approvedAt) {
    errors.push("approval.expiresAt must be after approval.approvedAt");
  }
  return errors;
}

function assertExternalApprovalSchema() {
  const schema = readJson("docs/governance/system-telemetry/external-approval.schema.json");
  const serialized = JSON.stringify(schema);
  assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "external approval schema: wrong JSON schema version");
  assert(schema.$id === "https://clawjs.dev/schemas/governance/system-telemetry/external-approval.schema.json", "external approval schema: wrong id");
  assert(schema.title === "System Telemetry External Approval Packet", "external approval schema: wrong title");
  assert(schema["x-validatorPath"] === "scripts/validate-system-telemetry-external-approval.mjs", "external approval schema: wrong validator path");
  assert(schema["x-fixturePath"] === "docs/governance/system-telemetry/external-approval.fixtures.json", "external approval schema: wrong fixture path");
  assert(schema.properties?.schemaVersion?.const === 1, "external approval schema: schemaVersion must be 1");
  assert(schema.properties?.conversationId?.const === "019e359b-c0ab-7dc1-ba94-11a49d11dc76", "external approval schema: wrong conversation id");
  assert(schema.properties?.planId?.const === "019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan", "external approval schema: wrong plan id");
  assert(schema.properties?.repoScope?.const === "framework", "external approval schema: wrong repo scope");
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    assert(schema.properties?.laneId?.enum?.includes(rowId), `external approval schema: missing lane ${rowId}`);
  }
  for (const required of ["approval", "preflight", "authorization", "risk", "privacy", "closureImpact"]) {
    assert(schema.required?.includes(required), `external approval schema: missing required field ${required}`);
  }
  assert(schema.properties?.approval?.properties?.decision?.const === "approved", "external approval schema: decision must be approved");
  assert(schema.properties?.approval?.properties?.approvalId?.minLength === 1, "external approval schema: approval id must be required");
  assert(schema.properties?.approval?.properties?.exactRunApproved?.const === true, "external approval schema: exact-run approval must be true");
  assert(schema.properties?.approval?.properties?.exactRunScope?.minLength === 1, "external approval schema: exact run scope must be required");
  assert(schema.properties?.approval?.properties?.approvedActions?.maxItems === 1, "external approval schema: approved actions must be exact");
  for (const field of ["credentialLeaseRefs", "nativeGrantRefs", "locationGrantRefs", "hardwareProviderRefs"]) {
    assert(schema.properties?.authorization?.properties?.[field]?.maxItems === 1, `external approval schema: ${field} must be exact`);
  }
  assert(schema.properties?.approval?.properties?.approvedAt?.format === "date-time", "external approval schema: approvedAt must be date-time");
  assert(schema.properties?.approval?.properties?.expiresAt?.format === "date-time", "external approval schema: expiresAt must be date-time");
  assert(schema.properties?.preflight?.properties?.command?.pattern === "^claw system ", "external approval schema: preflight command must be claw system");
  assert(schema.properties?.preflight?.properties?.mustFailClosedBeforeApproval?.const === true, "external approval schema: preflight must fail closed before approval");
  assert(schema.properties?.privacy?.properties?.containsSecrets?.const === false, "external approval schema: secrets must be forbidden");
  assert(schema.properties?.privacy?.properties?.preciseLocationApprovedForStorage?.const === false, "external approval schema: precise location storage must be forbidden");
  assert(schema.properties?.privacy?.properties?.privatePathsIncluded?.const === false, "external approval schema: private paths must be forbidden");
  assert(schema.properties?.closureImpact?.properties?.externalPendingRows?.maxItems === 1, "external approval schema: closure external rows must be exact");
  for (const snippet of [
    "provider_connection",
    "physical_sensor_read",
    "dangerous_control_execute",
    "credentialLeaseRefs",
    "nativeGrantRefs",
    "networkAccessApproved",
    "hardwareProviderRefs",
    "rollbackOrContinuityPlanRef",
    "physicalValidationPlanRef",
  ]) {
    assert(serialized.includes(snippet), `external approval schema: missing ${snippet}`);
  }
  const laneRules = new Map((schema.allOf ?? []).map((rule) => [rule.if?.properties?.laneId?.const, rule.then]));
  assert(laneRules.size === 3, "external approval schema: must define exactly 3 lane-specific rules");
  assert(laneRules.get("SYS-TEL-EXT-001")?.properties?.authorization?.properties?.credentialLeaseRefs?.minItems === 1, "external approval schema: live lane must require credential lease refs");
  assert(laneRules.get("SYS-TEL-EXT-001")?.properties?.authorization?.properties?.credentialLeaseRefs?.maxItems === 1, "external approval schema: live lane credential lease refs must be exact");
  assert(laneRules.get("SYS-TEL-EXT-001")?.properties?.authorization?.properties?.networkAccessApproved?.const === true, "external approval schema: live lane must require network approval");
  assert(laneRules.get("SYS-TEL-EXT-001")?.properties?.closureImpact?.properties?.externalPendingRows?.maxItems === 1, "external approval schema: live lane must close only its own external row");
  assert(laneRules.get("SYS-TEL-EXT-002")?.properties?.authorization?.properties?.nativeGrantRefs?.minItems === 1, "external approval schema: sensor lane must require native grant refs");
  assert(laneRules.get("SYS-TEL-EXT-002")?.properties?.authorization?.properties?.nativeGrantRefs?.maxItems === 1, "external approval schema: sensor lane native grant refs must be exact");
  assert(laneRules.get("SYS-TEL-EXT-002")?.properties?.authorization?.properties?.hardwareProviderRefs?.minItems === 1, "external approval schema: sensor lane must require hardware provider refs");
  assert(laneRules.get("SYS-TEL-EXT-002")?.properties?.closureImpact?.properties?.externalPendingRows?.maxItems === 1, "external approval schema: sensor lane must close only its own external row");
  assert(laneRules.get("SYS-TEL-EXT-003")?.properties?.risk?.properties?.rollbackOrContinuityPlanRef?.minLength === 1, "external approval schema: control lane must require rollback plan");
  assert(laneRules.get("SYS-TEL-EXT-003")?.properties?.risk?.properties?.physicalValidationPlanRef?.minLength === 1, "external approval schema: control lane must require physical validation plan");
  assert(laneRules.get("SYS-TEL-EXT-003")?.properties?.closureImpact?.properties?.externalPendingRows?.maxItems === 1, "external approval schema: control lane must close only its own external row");
  const ajv = new Ajv2020({ allErrors: true, validateFormats: false, strict: false });
  const validate = ajv.compile(schema);
  for (const packet of readJson("docs/governance/system-telemetry/external-approval.fixtures.json").validSyntheticPackets) {
    assert(validate(packet), `external approval schema: valid packet ${packet.laneId} must validate: ${ajv.errorsText(validate.errors)}`);
  }
  assert(!serialized.includes("/Users/"), "external approval schema: must not publish private filesystem paths");
}

function assertExternalApprovalFixtures() {
  const fixtures = readJson("docs/governance/system-telemetry/external-approval.fixtures.json");
  const schema = readJson("docs/governance/system-telemetry/external-approval.schema.json");
  assert(fixtures.schemaVersion === 1, "external approval fixtures: schemaVersion must be 1");
  assert(fixtures.artifactId === "system-telemetry-external-approval-fixtures", "external approval fixtures: wrong artifact id");
  assert(fixtures.status === "synthetic_templates_not_approval", "external approval fixtures: must be synthetic templates only");
  assert(fixtures.conversationId === "019e359b-c0ab-7dc1-ba94-11a49d11dc76", "external approval fixtures: wrong conversation id");
  assert(fixtures.planId === "019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan", "external approval fixtures: wrong plan id");
  assert(fixtures.schemaPath === "docs/governance/system-telemetry/external-approval.schema.json", "external approval fixtures: wrong schema path");
  assert(fixtures.validatorPath === "scripts/validate-system-telemetry-external-approval.mjs", "external approval fixtures: wrong validator path");
  assert(Array.isArray(fixtures.validSyntheticPackets) && fixtures.validSyntheticPackets.length === 3, "external approval fixtures: must contain 3 valid synthetic packets");
  assert(Array.isArray(fixtures.invalidSyntheticPackets) && fixtures.invalidSyntheticPackets.length === 9, "external approval fixtures: must contain 9 invalid synthetic packets");
  const ajv = new Ajv2020({ allErrors: true, validateFormats: false, strict: false });
  const validate = ajv.compile(schema);
  const validByLaneId = new Map();
  for (const packet of fixtures.validSyntheticPackets) {
    const errors = approvalTemplateErrors(packet, validate, ajv);
    assert(errors.length === 0, `external approval fixtures: valid packet ${packet.laneId} must validate: ${errors.join("; ")}`);
    validByLaneId.set(packet.laneId, packet);
    assert(typeof packet.approval?.approvalId === "string" && packet.approval.approvalId.length > 0, `external approval fixtures: ${packet.laneId} must include approval id`);
    assert(packet.privacy?.containsSecrets === false, `external approval fixtures: ${packet.laneId} must not contain secrets`);
    assert(packet.privacy?.preciseLocationApprovedForStorage === false, `external approval fixtures: ${packet.laneId} must not store precise location`);
    assert(packet.privacy?.privatePathsIncluded === false, `external approval fixtures: ${packet.laneId} must not include private paths`);
  }
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    assert(validByLaneId.has(rowId), `external approval fixtures: missing valid template for ${rowId}`);
  }
  for (const fixture of fixtures.invalidSyntheticPackets) {
    const base = validByLaneId.get(fixture.packetRef);
    assert(base, `external approval fixtures: invalid packet ${fixture.id} references unknown lane ${fixture.packetRef}`);
    assert(approvalTemplateErrors(mutateApprovalTemplate(base, fixture.mutation), validate, ajv).length > 0, `external approval fixtures: invalid packet ${fixture.id} must fail validation`);
  }
  assert(!JSON.stringify(fixtures).includes("/Users/"), "external approval fixtures: must not publish private filesystem paths");
}

function assertExternalApprovalValidator() {
  const output = run(process.execPath, ["scripts/validate-system-telemetry-external-approval.mjs", "--fixtures"]);
  const result = JSON.parse(output);
  assert(result.ok === true, "external approval validator: fixture validation must pass");
  assert(result.status === "synthetic_templates_not_approval", "external approval validator: fixtures must remain synthetic");
  assert(result.validSyntheticPackets === 3, "external approval validator: must accept 3 valid synthetic packets");
  assert(result.invalidSyntheticPackets === 9, "external approval validator: must reject 9 invalid synthetic packets");
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    assert(result.accepted?.includes(rowId), `external approval validator: missing accepted fixture for ${rowId}`);
  }
}

function assertExternalValidationRunbook() {
  const text = read("docs/governance/system-telemetry/external-validation-runbook.md");
  for (const snippet of [
    "Source conversation: `019e359b-c0ab-7dc1-ba94-11a49d11dc76`",
    "Plan item: `019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan`",
    "Status: `active_goal_not_complete`",
    "This runbook defines the only accepted way to replace the remaining system",
    "It does not authorize provider calls,",
    "Each lane requires",
    "explicit approval for the exact run before execution.",
    "`docs/governance/system-telemetry/external-approval.schema.json`",
    "`docs/governance/system-telemetry/external-approval.fixtures.json`",
    "they only prove schema behavior and are not real approval",
    "`node scripts/validate-system-telemetry-external-approval.mjs <packet.json>`",
    "before any provider, sensor, or control execution starts",
    "Any accepted run must produce a redacted evidence packet conforming to",
    "`docs/governance/system-telemetry/external-evidence.schema.json`",
    "lane-closing record",
    "`docs/governance/system-telemetry/external-validation.manifest.schema.json`",
    "lane status update",
    "`docs/governance/system-telemetry/external-validation.manifest.fixtures.json`",
    "schema validation templates only",
    "`node scripts/validate-system-telemetry-external-evidence.mjs <packet.json>`",
    "before updating any ledger, manifest, completion audit, or source Q/A review",
    "`docs/governance/system-telemetry/external-evidence.fixtures.json`",
    "templates for",
    "must not be cited as real external evidence",
    "same-lane closure bundle",
    "`docs/governance/system-telemetry/external-closure.fixtures.json`",
    "not real closure evidence",
    "All evidence timestamps must remain inside that approval packet's",
    "`node scripts/validate-system-telemetry-external-closure.mjs <bundle.json>`",
    "| Row | Safe preflight | Approval packet | Execution evidence | Update target | Fail rule |",
    "| SYS-TEL-EXT-001 | `claw system providers plan context.weather.live --json`",
    "Provider execution receipt, redacted audit event, Monitor sample IDs for `context.weather.temperature`",
    "Replace `SYS-TEL-EXT-001` in the ledger, manifest, completion audit, and source Q/A review",
    "a failed approved run is a defect, not a pending row",
    "| SYS-TEL-EXT-002 | `claw system providers plan system.sensors.signed --json`",
    "Monitor sample IDs for `system.sensor.temperature` or `system.sensor.fan_speed`",
    "same-machine evidence",
    "fake zero samples are defects",
    "| SYS-TEL-EXT-003 | `claw system controls plan <control-id> --json`",
    "Pre-execution plan with `willExecute=true` only after approval",
    "rollback/continuity evidence",
    "failed approved execution is a defect",
    "## Exact Approval Inputs",
    "These are the minimum public-safe fields that must be resolved before building",
    "They are not approval by themselves.",
    "credential lease reference, location grant reference, network approval",
    "native `system.sensor.read` grant reference",
    "exact control id, target, value, native grant reference",
    "Must stay absent from public artifacts",
    "If any required field is still unknown, keep the lane as `EXTERNAL PENDING`",
    "Do not mark the goal complete until every lane above is either replaced with",
    "source reread, completion audit, approval schema check, evidence schema check,",
    "same-lane closure bundle check",
  ]) {
    assert(text.includes(snippet), `docs/governance/system-telemetry/external-validation-runbook.md: missing ${JSON.stringify(snippet)}`);
  }
  const laneRows = text.match(/^\| SYS-TEL-EXT-\d{3} \|/gm) ?? [];
  assert(laneRows.length === 3, "docs/governance/system-telemetry/external-validation-runbook.md: must contain exactly 3 external lane rows");
  const laneIds = laneRows.map((row) => row.match(/SYS-TEL-EXT-\d{3}/)?.[0]).filter(Boolean);
  assertSameStringSet(laneIds, ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"], "docs/governance/system-telemetry/external-validation-runbook.md: lane rows");
  assert(!text.includes("/Users/"), "docs/governance/system-telemetry/external-validation-runbook.md: must not publish private filesystem paths");
}

function assertExternalEvidenceSchema() {
  const schema = readJson("docs/governance/system-telemetry/external-evidence.schema.json");
  const serialized = JSON.stringify(schema);
  assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "external evidence schema: wrong JSON schema version");
  assert(schema.$id === "https://clawjs.dev/schemas/governance/system-telemetry/external-evidence.schema.json", "external evidence schema: wrong id");
  assert(schema.title === "System Telemetry External Evidence Packet", "external evidence schema: wrong title");
  assert(schema["x-fixturePath"] === "docs/governance/system-telemetry/external-evidence.fixtures.json", "external evidence schema: wrong fixture path");
  assert(schema.properties?.schemaVersion?.const === 1, "external evidence schema: schemaVersion must be 1");
  assert(schema.properties?.conversationId?.const === "019e359b-c0ab-7dc1-ba94-11a49d11dc76", "external evidence schema: wrong conversation id");
  assert(schema.properties?.planId?.const === "019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan", "external evidence schema: wrong plan id");
  assert(schema.properties?.repoScope?.const === "framework", "external evidence schema: wrong repo scope");
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    assert(schema.properties?.laneId?.enum?.includes(rowId), `external evidence schema: missing lane ${rowId}`);
  }
  for (const required of [
    "schemaVersion",
    "conversationId",
    "planId",
    "laneId",
    "repoScope",
    "runAuthorization",
    "preflight",
    "execution",
    "evidence",
    "redaction",
    "closureImpact",
    "reviewer",
  ]) {
    assert(schema.required?.includes(required), `external evidence schema: missing required field ${required}`);
  }
  assert(schema.properties?.preflight?.properties?.command?.pattern === "^claw system ", "external evidence schema: preflight command must be claw system");
  assert(schema.properties?.preflight?.properties?.failClosedBeforeApproval?.const === true, "external evidence schema: preflight must fail closed before approval");
  assert(schema.properties?.execution?.properties?.externalPendingCleared?.const === true, "external evidence schema: accepted execution must clear external pending");
  assert(schema.properties?.execution?.properties?.failedApprovedRun?.const === false, "external evidence schema: failed approved run cannot be accepted");
  assert(schema.properties?.evidence?.properties?.auditEventRefs?.minItems === 1, "external evidence schema: audit refs must be required evidence");
  assert(schema.properties?.redaction?.properties?.containsSecrets?.const === false, "external evidence schema: secrets must be forbidden");
  assert(schema.properties?.redaction?.properties?.preciseLocationIncluded?.const === false, "external evidence schema: precise location must be forbidden");
  assert(schema.properties?.redaction?.properties?.privatePathsIncluded?.const === false, "external evidence schema: private paths must be forbidden");
  assert(schema.properties?.closureImpact?.properties?.requiresFinalSourceReread?.const === true, "external evidence schema: final source reread must be required");
  assert(schema.properties?.closureImpact?.properties?.requiresForbiddenNameScan?.const === true, "external evidence schema: forbidden-name scan must be required");
  for (const field of ["rowsToReplace", "completionAuditRows", "sourceQaRows", "manifestRows"]) {
    assert(schema.properties?.closureImpact?.properties?.[field]?.maxItems === 1, `external evidence schema: ${field} must be exact`);
  }
  assert(schema.properties?.runAuthorization?.properties?.grants?.maxItems === 1, "external evidence schema: run authorization grants must be exact");
  assert(schema.properties?.reviewer?.properties?.decision?.enum?.includes("accepted"), "external evidence schema: reviewer acceptance must be explicit");
  for (const snippet of [
    "receiptRefs",
    "monitorSampleIds",
    "sameMachineEvidenceRefs",
    "downstreamEvidenceRefs",
    "physicalValidationRefs",
    "rollbackOrContinuityRefs",
  ]) {
    assert(serialized.includes(snippet), `external evidence schema: missing ${snippet}`);
  }
  const laneRules = new Map((schema.allOf ?? []).map((rule) => [rule.if?.properties?.laneId?.const, rule.then]));
  assert(laneRules.size === 3, "external evidence schema: must define exactly 3 lane-specific rules");
  const liveRule = laneRules.get("SYS-TEL-EXT-001");
  assert(liveRule?.properties?.runAuthorization?.properties?.grants?.contains?.const === "context.weather.read", "external evidence schema: live lane must require context grant");
  assert(liveRule?.properties?.runAuthorization?.properties?.grants?.maxItems === 1, "external evidence schema: live lane grants must be exact");
  assert(liveRule?.properties?.runAuthorization?.properties?.credentialLeaseRefs?.minItems === 1, "external evidence schema: live lane must require credential lease refs");
  assert(liveRule?.properties?.runAuthorization?.properties?.networkAccessApproved?.const === true, "external evidence schema: live lane must require network approval");
  assert(liveRule?.properties?.evidence?.properties?.monitorSampleIds?.minItems === 1, "external evidence schema: live lane must require monitor samples");
  assert(liveRule?.properties?.evidence?.properties?.downstreamEvidenceRefs?.minItems === 1, "external evidence schema: live lane must require downstream evidence");
  assert(liveRule?.properties?.closureImpact?.properties?.completionAuditRows?.contains?.const === "STA-016", "external evidence schema: live lane must close STA-016");
  assert(liveRule?.properties?.closureImpact?.properties?.sourceQaRows?.contains?.const === "STQA-003", "external evidence schema: live lane must update source Q/A row");
  const sensorRule = laneRules.get("SYS-TEL-EXT-002");
  assert(sensorRule?.properties?.runAuthorization?.properties?.grants?.contains?.const === "system.sensor.read", "external evidence schema: sensor lane must require sensor grant");
  assert(sensorRule?.properties?.runAuthorization?.properties?.grants?.maxItems === 1, "external evidence schema: sensor lane grants must be exact");
  assert(sensorRule?.properties?.runAuthorization?.properties?.nativeGrantRefs?.minItems === 1, "external evidence schema: sensor lane must require native grant refs");
  assert(sensorRule?.properties?.evidence?.properties?.monitorSampleIds?.minItems === 1, "external evidence schema: sensor lane must require monitor samples");
  assert(sensorRule?.properties?.evidence?.properties?.sameMachineEvidenceRefs?.minItems === 1, "external evidence schema: sensor lane must require same-machine evidence");
  assert(sensorRule?.properties?.closureImpact?.properties?.completionAuditRows?.contains?.const === "STA-017", "external evidence schema: sensor lane must close STA-017");
  assert(sensorRule?.properties?.closureImpact?.properties?.sourceQaRows?.contains?.const === "STQA-003", "external evidence schema: sensor lane must update source Q/A row");
  const controlRule = laneRules.get("SYS-TEL-EXT-003");
  assert(controlRule?.properties?.runAuthorization?.properties?.grants?.contains?.const === "system.control.execute", "external evidence schema: control lane must require control grant");
  assert(controlRule?.properties?.runAuthorization?.properties?.grants?.maxItems === 1, "external evidence schema: control lane grants must be exact");
  assert(controlRule?.properties?.runAuthorization?.properties?.nativeGrantRefs?.minItems === 1, "external evidence schema: control lane must require native grant refs");
  assert(controlRule?.properties?.evidence?.properties?.physicalValidationRefs?.minItems === 1, "external evidence schema: control lane must require physical validation");
  assert(controlRule?.properties?.evidence?.properties?.rollbackOrContinuityRefs?.minItems === 1, "external evidence schema: control lane must require rollback or continuity evidence");
  assert(controlRule?.properties?.closureImpact?.properties?.completionAuditRows?.contains?.const === "STA-018", "external evidence schema: control lane must close STA-018");
  assert(controlRule?.properties?.closureImpact?.properties?.sourceQaRows?.contains?.const === "STQA-003", "external evidence schema: control lane must update source Q/A row");
  assert(!serialized.includes("/Users/"), "external evidence schema: must not publish private filesystem paths");
}

function evidenceTemplateErrors(packet, validate, ajv) {
  const errors = [];
  errors.push(...publicSafetyErrors(packet));
  if (!validate(packet)) errors.push(ajv.errorsText(validate.errors));
  const approvedAt = Date.parse(packet.runAuthorization?.approvedAt);
  const preflightCompletedAt = Date.parse(packet.preflight?.completedAt);
  const executionStartedAt = Date.parse(packet.execution?.startedAt);
  const executionCompletedAt = Date.parse(packet.execution?.completedAt);
  const reviewedAt = Date.parse(packet.reviewer?.reviewedAt);
  if (!Number.isFinite(approvedAt)) errors.push("runAuthorization.approvedAt must be parseable");
  if (!Number.isFinite(preflightCompletedAt)) errors.push("preflight.completedAt must be parseable");
  if (!Number.isFinite(executionStartedAt)) errors.push("execution.startedAt must be parseable");
  if (!Number.isFinite(executionCompletedAt)) errors.push("execution.completedAt must be parseable");
  if (!Number.isFinite(reviewedAt)) errors.push("reviewer.reviewedAt must be parseable");
  if (Number.isFinite(approvedAt) && Number.isFinite(preflightCompletedAt) && preflightCompletedAt < approvedAt) {
    errors.push("preflight.completedAt must be at or after runAuthorization.approvedAt");
  }
  if (Number.isFinite(preflightCompletedAt) && Number.isFinite(executionStartedAt) && executionStartedAt < preflightCompletedAt) {
    errors.push("execution.startedAt must be at or after preflight.completedAt");
  }
  if (Number.isFinite(executionStartedAt) && Number.isFinite(executionCompletedAt) && executionCompletedAt < executionStartedAt) {
    errors.push("execution.completedAt must be at or after execution.startedAt");
  }
  if (Number.isFinite(executionCompletedAt) && Number.isFinite(reviewedAt) && reviewedAt < executionCompletedAt) {
    errors.push("reviewer.reviewedAt must be at or after execution.completedAt");
  }
  return errors;
}

function mutateEvidenceTemplate(packet, mutation) {
  if (!packet) return undefined;
  const mutated = JSON.parse(JSON.stringify(packet));
  switch (mutation) {
    case "execution.completedAt before execution.startedAt":
      mutated.execution.completedAt = "2026-05-19T23:59:59Z";
      break;
    case "preflight.completedAt before runAuthorization.approvedAt":
      mutated.preflight.completedAt = "2026-05-19T23:59:59Z";
      break;
    case "runAuthorization.grants is empty":
      mutated.runAuthorization.grants = [];
      break;
    case "runAuthorization.grants has extra":
      mutated.runAuthorization.grants = [mutated.runAuthorization.grants[0], "extra_unapproved_grant_template"];
      break;
    case "reviewer.reviewedAt before execution.completedAt":
      mutated.reviewer.reviewedAt = "2026-05-19T23:59:59Z";
      break;
    case "evidence.downstreamEvidenceRefs=privatePath":
      mutated.evidence.downstreamEvidenceRefs = ["file://private/downstream-evidence-template.png"];
      break;
    case "closureImpact.rowsToReplace=extra":
      mutated.closureImpact.rowsToReplace = [mutated.laneId, "SYS-TEL-EXT-999"];
      break;
    default:
      return undefined;
  }
  return mutated;
}

function assertExternalEvidenceFixtures() {
  const fixtures = readJson("docs/governance/system-telemetry/external-evidence.fixtures.json");
  assert(fixtures.schemaVersion === 1, "external evidence fixtures: schemaVersion must be 1");
  assert(fixtures.artifactId === "system-telemetry-external-evidence-fixtures", "external evidence fixtures: wrong artifact id");
  assert(fixtures.status === "synthetic_templates_not_evidence", "external evidence fixtures: must be synthetic templates only");
  assert(fixtures.conversationId === "019e359b-c0ab-7dc1-ba94-11a49d11dc76", "external evidence fixtures: wrong conversation id");
  assert(fixtures.planId === "019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan", "external evidence fixtures: wrong plan id");
  assert(fixtures.schemaPath === "docs/governance/system-telemetry/external-evidence.schema.json", "external evidence fixtures: wrong schema path");
  assert(Array.isArray(fixtures.validSyntheticPackets) && fixtures.validSyntheticPackets.length === 3, "external evidence fixtures: must contain 3 valid synthetic packets");
  assert(Array.isArray(fixtures.invalidSyntheticPackets) && fixtures.invalidSyntheticPackets.length === 10, "external evidence fixtures: must contain 10 invalid synthetic packets");
  const schema = readJson("docs/governance/system-telemetry/external-evidence.schema.json");
  const ajv = new Ajv2020({ allErrors: true, validateFormats: false, strict: false });
  const validate = ajv.compile(schema);
  const validLaneIds = new Set();
  for (const packet of fixtures.validSyntheticPackets) {
    const errors = evidenceTemplateErrors(packet, validate, ajv);
    assert(errors.length === 0, `external evidence fixtures: valid packet ${packet.laneId} must validate: ${errors.join("; ")}`);
    validLaneIds.add(packet.laneId);
    assert(packet.redaction?.containsSecrets === false, `external evidence fixtures: ${packet.laneId} must not contain secrets`);
    assert(packet.redaction?.preciseLocationIncluded === false, `external evidence fixtures: ${packet.laneId} must not contain precise location`);
    assert(packet.redaction?.privatePathsIncluded === false, `external evidence fixtures: ${packet.laneId} must not contain private paths`);
  }
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    assert(validLaneIds.has(rowId), `external evidence fixtures: missing valid template for ${rowId}`);
  }
  for (const fixture of fixtures.invalidSyntheticPackets) {
    const base = fixtures.validSyntheticPackets.find((packet) => packet.laneId === fixture.baseLaneId);
    const packet = fixture.packet ?? mutateEvidenceTemplate(base, fixture.mutation);
    assert(packet, `external evidence fixtures: invalid packet ${fixture.id} must provide packet or valid mutation`);
    assert(evidenceTemplateErrors(packet, validate, ajv).length > 0, `external evidence fixtures: invalid packet ${fixture.id} must fail validation`);
    assert(typeof fixture.mutation === "string" && fixture.mutation.length > 0, `external evidence fixtures: invalid packet ${fixture.id} must document mutation`);
  }
  const serialized = JSON.stringify(fixtures);
  assert(!serialized.includes("/Users/"), "external evidence fixtures: must not publish private filesystem paths");
}

function assertExternalEvidenceValidator() {
  const output = run(process.execPath, ["scripts/validate-system-telemetry-external-evidence.mjs", "--fixtures"]);
  const result = JSON.parse(output);
  assert(result.ok === true, "external evidence validator: fixture validation must pass");
  assert(result.status === "synthetic_templates_not_evidence", "external evidence validator: fixtures must remain synthetic");
  assert(result.validSyntheticPackets === 3, "external evidence validator: must accept 3 valid synthetic packets");
  assert(result.invalidSyntheticPackets === 10, "external evidence validator: must reject 10 invalid synthetic packets");
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    assert(result.accepted?.includes(rowId), `external evidence validator: missing accepted fixture for ${rowId}`);
  }
}

function assertExternalClosureFixtures() {
  const fixtures = readJson("docs/governance/system-telemetry/external-closure.fixtures.json");
  assert(fixtures.schemaVersion === 1, "external closure fixtures: schemaVersion must be 1");
  assert(fixtures.artifactId === "system-telemetry-external-closure-fixtures", "external closure fixtures: wrong artifact id");
  assert(fixtures.status === "synthetic_templates_not_closure", "external closure fixtures: must be synthetic templates only");
  assert(fixtures.conversationId === "019e359b-c0ab-7dc1-ba94-11a49d11dc76", "external closure fixtures: wrong conversation id");
  assert(fixtures.planId === "019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan", "external closure fixtures: wrong plan id");
  assert(fixtures.approvalFixturesPath === "docs/governance/system-telemetry/external-approval.fixtures.json", "external closure fixtures: wrong approval fixtures path");
  assert(fixtures.evidenceFixturesPath === "docs/governance/system-telemetry/external-evidence.fixtures.json", "external closure fixtures: wrong evidence fixtures path");
  assert(fixtures.validatorPath === "scripts/validate-system-telemetry-external-closure.mjs", "external closure fixtures: wrong validator path");
  assert(Array.isArray(fixtures.validSyntheticBundles) && fixtures.validSyntheticBundles.length === 3, "external closure fixtures: must contain 3 valid synthetic bundles");
  assert(Array.isArray(fixtures.invalidSyntheticMutations) && fixtures.invalidSyntheticMutations.length === 17, "external closure fixtures: must contain 17 invalid mutations");
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    assert(fixtures.validSyntheticBundles.some((bundle) => bundle.laneId === rowId), `external closure fixtures: missing valid bundle for ${rowId}`);
  }
  for (const fixture of fixtures.invalidSyntheticMutations) {
    assert(typeof fixture.baseLaneId === "string" && fixture.baseLaneId.startsWith("SYS-TEL-EXT-"), `external closure fixtures: invalid mutation ${fixture.id} must name base lane`);
    assert(typeof fixture.mutation === "string" && fixture.mutation.length > 0, `external closure fixtures: invalid mutation ${fixture.id} must document mutation`);
    assert(typeof fixture.reason === "string" && fixture.reason.length > 0, `external closure fixtures: invalid mutation ${fixture.id} must document reason`);
  }
  assert(!JSON.stringify(fixtures).includes("/Users/"), "external closure fixtures: must not publish private filesystem paths");
}

function assertExternalClosureValidator() {
  const output = run(process.execPath, ["scripts/validate-system-telemetry-external-closure.mjs", "--fixtures"]);
  const result = JSON.parse(output);
  assert(result.ok === true, "external closure validator: fixture validation must pass");
  assert(result.status === "synthetic_templates_not_closure", "external closure validator: fixtures must remain synthetic");
  assert(result.validSyntheticBundles === 3, "external closure validator: must accept 3 valid synthetic bundles");
  assert(result.invalidSyntheticMutations === 17, "external closure validator: must reject 17 invalid synthetic mutations");
  for (const rowId of ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"]) {
    assert(result.accepted?.includes(rowId), `external closure validator: missing accepted fixture for ${rowId}`);
  }
}

function assertSourceQaReview() {
  const review = readJson("docs/governance/system-telemetry/source-review.json");
  assert(review.schemaVersion === 1, "source Q/A review: schemaVersion must be 1");
  assert(review.artifactId === "system-telemetry-source-qa-review", "source Q/A review: wrong artifactId");
  assert(review.discoveryTerms?.includes("system telemetry source Q/A review"), "source Q/A review: missing discovery term");
  assert(review.sourceConversationId === "019e359b-c0ab-7dc1-ba94-11a49d11dc76", "source Q/A review: wrong sourceConversationId");
  assert(review.sourcePlanId === "019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan", "source Q/A review: wrong sourcePlanId");
  assert(review.sourceSessionRef === "private-session-not-published", "source Q/A review: must not publish private source session path");
  assert(!JSON.stringify(review).includes("/Users/"), "source Q/A review: must not publish private filesystem paths");
  assert(review.status === "complete_with_external_pending", "source Q/A review: status must keep external blockers visible");
  assert(review.reviewedUserRoleMessages === 161, "source Q/A review: reviewed user-role message count drifted");
  assert(review.decisionBearingRowsReviewed === 12, "source Q/A review: decision-bearing row count drifted");
  const decisionIds = ["D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11"];
  assertSameStringSet(review.decisionIdsReviewed, decisionIds, "source Q/A review: decisionIdsReviewed");
  for (const decisionId of decisionIds) {
    assert(review.decisionIdsReviewed?.includes(decisionId), `source Q/A review: missing ${decisionId}`);
  }
  const externalRows = ["SYS-TEL-EXT-001", "SYS-TEL-EXT-002", "SYS-TEL-EXT-003"];
  assertSameStringSet(review.externalPendingRows, externalRows, "source Q/A review: externalPendingRows");
  for (const rowId of externalRows) {
    assert(review.externalPendingRows?.includes(rowId), `source Q/A review: missing external-pending ${rowId}`);
  }
  const localRows = ["SYS-TEL-EXT-004", "SYS-TEL-EXT-005", "SYS-TEL-EXT-006"];
  assertSameStringSet(review.validatedLocalRows, localRows, "source Q/A review: validatedLocalRows");
  for (const rowId of localRows) {
    assert(review.validatedLocalRows?.includes(rowId), `source Q/A review: missing validated-local ${rowId}`);
  }
  assert(Array.isArray(review.rows) && review.rows.length === 12, "source Q/A review: must contain exactly 12 reviewed source rows");
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
    ["STQA-011", "USER_113", 25003],
    ["STQA-012", "USER_151", 33114],
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
  assert(review.completionPolicy?.requiresCompletionAudit === true, "source Q/A review: completion audit must be required");
  assert(review.completionPolicy?.requiresForbiddenNameScan === true, "source Q/A review: forbidden-name scan must be required");
  assert(review.completionPolicy?.externalPendingBlocksCompletion === true, "source Q/A review: external pending must block completion");
}

function assertCompletionAudit() {
  const text = read("docs/governance/system-telemetry/completion.md");
  for (const snippet of [
    "Source conversation: `019e359b-c0ab-7dc1-ba94-11a49d11dc76`",
    "Plan item: `019e3b6c-3dd8-76d2-bf1e-f50a23db7b07-plan`",
    "Status: `active_goal_not_complete`",
    "This public-safe audit tracks the full system telemetry goal requirement by",
    "- `validated-local`: 14 rows.",
    "- `active-closure-gate`: 1 row.",
    "- `external-pending`: 3 rows, `STA-016`, `STA-017`, and `STA-018`.",
    "| STA-001 | Promote `claw system` to the canonical read-only portal",
    "| STA-002 | Expose `snapshot`, `metrics list`, `history`, `watch`, `rules`, and `widgets` surfaces.",
    "| STA-003 | Model CPU, GPU, memory, disks, network, power, processes, displays, audio, Bluetooth/peripherals, focus, notifications, calendar/time, and weather/context metrics.",
    "| STA-004 | Centralize samples, rollups, incidents, rules, charts, and retention in Monitor.",
    "| STA-005 | Provide Mac-first native adapter coverage with fail-soft/fail-closed experimental sensor metadata.",
    "| STA-006 | Keep mutating or risky hardware/system actions behind a plan-first signed-host broker.",
    "| STA-007 | Provide modular context providers with mock/offline support and real-provider plugin contract.",
    "| STA-008 | Expose API and MCP read-only agent context for system telemetry.",
    "| STA-009 | Register inspect/search/discoverability routes for the telemetry plane.",
    "| STA-010 | Support menu-bar indicator contracts, including multiple independent items and one combined item.",
    "| STA-011 | Reuse retained Monitor history for graph/chart output.",
    "| STA-012 | Keep portable widget definitions in ClawJS and host-specific configuration in Clawix.",
    "| STA-013 | Separate local validation from live provider, physical sensor/fan, and dangerous-control proof.",
    "| STA-014 | Re-read source decisions one by one before any completion claim.",
    "| STA-015 | Keep public materials free of disallowed third-party product names.",
    "| STA-016 | Live weather/context provider execution with approved credential/location/network access.",
    "| STA-017 | Physical sensor/fan evidence from compatible hardware and native grant.",
    "| STA-018 | Dangerous control execution with exact approval and rollback/continuity evidence.",
    "`SYS-TEL-EXT-001` requires provider receipt",
    "`SYS-TEL-EXT-002` requires compatible path",
    "`SYS-TEL-EXT-003` requires exact approval",
    "The goal cannot be marked complete while any `external-pending` row remains",
  ]) {
    assert(text.includes(snippet), `docs/governance/system-telemetry/completion.md: missing ${JSON.stringify(snippet)}`);
  }
  const requirementRows = text.match(/^\| STA-\d{3} \|/gm) ?? [];
  assert(requirementRows.length === 18, "docs/governance/system-telemetry/completion.md: must contain exactly STA-001..STA-018 rows");
  const validatedRows = text.match(/^\| STA-\d{3} \|[^|]+\| validated-local \|/gm) ?? [];
  const activeRows = text.match(/^\| STA-\d{3} \|[^|]+\| active-closure-gate \|/gm) ?? [];
  const externalRows = text.match(/^\| STA-\d{3} \|[^|]+\| external-pending \|/gm) ?? [];
  assert(validatedRows.length === 14, "docs/governance/system-telemetry/completion.md: must contain exactly 14 validated-local rows");
  assert(activeRows.length === 1, "docs/governance/system-telemetry/completion.md: must contain exactly 1 active-closure-gate row");
  assert(externalRows.length === 3, "docs/governance/system-telemetry/completion.md: must contain exactly 3 external-pending rows");
  for (const rowId of ["STA-016", "STA-017", "STA-018"]) {
    assert(new RegExp(`^\\\\| ${rowId} \\\\|[^\\n]+\\\\| external-pending \\\\|`, "m").test(text), `docs/governance/system-telemetry/completion.md: ${rowId} must remain external-pending`);
  }
  assert(!text.includes("/Users/"), "docs/governance/system-telemetry/completion.md: must not publish private filesystem paths");
}

function assertDecisionMatrix() {
  const text = read("docs/governance/system-telemetry/decision-matrix.md");
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
    "docs/governance/system-telemetry/completion.md",
    "completion audit",
    "docs/governance/system-telemetry/external-validation-runbook.md",
    "external validation runbook",
    "docs/governance/system-telemetry/external-approval.schema.json",
    "synthetic approval templates",
    "docs/governance/system-telemetry/external-approval.fixtures.json",
    "approval validator",
    "scripts/validate-system-telemetry-external-approval.mjs",
    "approval schema",
    "approval fixture templates",
    "docs/governance/system-telemetry/external-evidence.schema.json",
    "evidence schema",
    "docs/governance/system-telemetry/external-evidence.fixtures.json",
    "synthetic fixture templates",
    "scripts/validate-system-telemetry-external-evidence.mjs",
    "evidence validator",
    "docs/governance/system-telemetry/external-closure.fixtures.json",
    "same-lane closure fixtures",
    "scripts/validate-system-telemetry-external-closure.mjs",
    "closure validator",
    "docs/governance/system-telemetry/external-validation.manifest.json",
    "docs/governance/system-telemetry/external-validation.manifest.schema.json",
    "manifest schema",
    "docs/governance/system-telemetry/external-validation.manifest.fixtures.json",
    "manifest fixtures",
    "external validation manifest",
    "docs/governance/system-telemetry/source-review.json",
    "source Q/A review",
    "`SYS-TEL-EXT-001`, `SYS-TEL-EXT-002`, or `SYS-TEL-EXT-003` remain",
    "structured external-validation manifest",
    "reflected in `docs/governance/system-telemetry/source-review.json`",
    "The forbidden-name scan has not been repeated",
  ]) {
    assert(text.includes(snippet), `docs/governance/system-telemetry/decision-matrix.md: missing ${JSON.stringify(snippet)}`);
  }
  const decisionRows = text.match(/^\| D\d{2} \|/gm) ?? [];
  assert(decisionRows.length === 11, "docs/governance/system-telemetry/decision-matrix.md: must contain exactly D01-D11 decision rows");
  assert(!text.includes("/Users/"), "docs/governance/system-telemetry/decision-matrix.md: must not publish private filesystem paths");
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
      "./governance/system-telemetry/decision-matrix.md",
      "./governance/system-telemetry/completion.md",
      "./governance/system-telemetry/external-pending.md",
      "./governance/system-telemetry/external-validation-runbook.md",
      "docs/governance/system-telemetry/external-approval.schema.json",
      "docs/governance/system-telemetry/external-approval.fixtures.json",
      "scripts/validate-system-telemetry-external-approval.mjs",
      "docs/governance/system-telemetry/external-evidence.schema.json",
      "docs/governance/system-telemetry/external-evidence.fixtures.json",
      "scripts/validate-system-telemetry-external-evidence.mjs",
      "docs/governance/system-telemetry/external-closure.fixtures.json",
      "scripts/validate-system-telemetry-external-closure.mjs",
      "docs/governance/system-telemetry/external-validation.manifest.json",
      "docs/governance/system-telemetry/external-validation.manifest.schema.json",
      "docs/governance/system-telemetry/external-validation.manifest.fixtures.json",
      "docs/governance/system-telemetry/source-review.json",
      "npm run test:system-telemetry-goal",
    ]],
    ["docs/discoverability.registry.json", [
      "\"id\": \"system-telemetry-decision-matrix\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/decision-matrix.md\"",
      "\"query\": \"system telemetry decision matrix\"",
      "\"id\": \"system-telemetry-completion-audit\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/completion.md\"",
      "\"query\": \"system telemetry completion audit\"",
      "\"id\": \"system-telemetry-external-pending-ledger\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/external-pending.md\"",
      "\"query\": \"system telemetry external pending validation\"",
      "\"id\": \"system-telemetry-external-validation-manifest\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/external-validation.manifest.json\"",
      "\"query\": \"system telemetry external validation manifest\"",
      "\"id\": \"system-telemetry-external-validation-manifest-schema\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/external-validation.manifest.schema.json\"",
      "\"query\": \"system telemetry external validation manifest schema\"",
      "\"id\": \"system-telemetry-external-validation-manifest-fixtures\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/external-validation.manifest.fixtures.json\"",
      "\"query\": \"system telemetry external validation manifest fixtures\"",
      "\"id\": \"system-telemetry-external-validation-runbook\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/external-validation-runbook.md\"",
      "\"query\": \"system telemetry external validation runbook\"",
      "\"id\": \"system-telemetry-external-approval-schema\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/external-approval.schema.json\"",
      "\"query\": \"system telemetry external approval schema\"",
      "\"id\": \"system-telemetry-external-approval-fixtures\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/external-approval.fixtures.json\"",
      "\"query\": \"system telemetry external approval fixtures\"",
      "\"id\": \"system-telemetry-external-approval-validator\"",
      "\"canonicalSource\": \"scripts/validate-system-telemetry-external-approval.mjs\"",
      "\"query\": \"system telemetry external approval validator\"",
      "\"id\": \"system-telemetry-external-evidence-schema\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/external-evidence.schema.json\"",
      "\"query\": \"system telemetry external evidence schema\"",
      "\"id\": \"system-telemetry-external-evidence-fixtures\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/external-evidence.fixtures.json\"",
      "\"query\": \"system telemetry external evidence fixtures\"",
      "\"id\": \"system-telemetry-external-closure-fixtures\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/external-closure.fixtures.json\"",
      "\"query\": \"system telemetry external closure fixtures\"",
      "\"id\": \"system-telemetry-external-closure-validator\"",
      "\"canonicalSource\": \"scripts/validate-system-telemetry-external-closure.mjs\"",
      "\"query\": \"system telemetry external closure validator\"",
      "\"id\": \"system-telemetry-source-qa-review\"",
      "\"canonicalSource\": \"docs/governance/system-telemetry/source-review.json\"",
      "\"query\": \"system telemetry source Q/A review\"",
    ]],
    ["docs/discoverability.md", [
      "`system-telemetry-decision-matrix`",
      "[docs/governance/system-telemetry/decision-matrix.md](/governance/system-telemetry/decision-matrix)",
      "`system-telemetry-completion-audit`",
      "[docs/governance/system-telemetry/completion.md](/governance/system-telemetry/completion)",
      "`system-telemetry-external-pending-ledger`",
      "[docs/governance/system-telemetry/external-pending.md](/governance/system-telemetry/external-pending)",
      "`system-telemetry-external-validation-manifest`",
      "[docs/governance/system-telemetry/external-validation.manifest.json](/governance/system-telemetry/external-validation.manifest.json)",
      "`system-telemetry-external-validation-manifest-schema`",
      "[docs/governance/system-telemetry/external-validation.manifest.schema.json](/governance/system-telemetry/external-validation.manifest.schema.json)",
      "`system-telemetry-external-validation-manifest-fixtures`",
      "[docs/governance/system-telemetry/external-validation.manifest.fixtures.json](/governance/system-telemetry/external-validation.manifest.fixtures.json)",
      "`system-telemetry-external-validation-runbook`",
      "[docs/governance/system-telemetry/external-validation-runbook.md](/governance/system-telemetry/external-validation-runbook)",
      "`system-telemetry-external-approval-schema`",
      "[docs/governance/system-telemetry/external-approval.schema.json](/governance/system-telemetry/external-approval.schema.json)",
      "`system-telemetry-external-approval-fixtures`",
      "[docs/governance/system-telemetry/external-approval.fixtures.json](/governance/system-telemetry/external-approval.fixtures.json)",
      "`system-telemetry-external-approval-validator`",
      "`scripts/validate-system-telemetry-external-approval.mjs`",
      "`system-telemetry-external-evidence-schema`",
      "[docs/governance/system-telemetry/external-evidence.schema.json](/governance/system-telemetry/external-evidence.schema.json)",
      "`system-telemetry-external-evidence-fixtures`",
      "[docs/governance/system-telemetry/external-evidence.fixtures.json](/governance/system-telemetry/external-evidence.fixtures.json)",
      "`system-telemetry-external-closure-fixtures`",
      "[docs/governance/system-telemetry/external-closure.fixtures.json](/governance/system-telemetry/external-closure.fixtures.json)",
      "`system-telemetry-external-closure-validator`",
      "`scripts/validate-system-telemetry-external-closure.mjs`",
      "`system-telemetry-source-qa-review`",
      "[docs/governance/system-telemetry/source-review.json](/governance/system-telemetry/source-review.json)",
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
    "system.telemetry.metrics",
    "claw.system.telemetry.metrics.request.v1",
    "claw.system.telemetry.metrics.v1",
    "system.telemetry.widgets",
    "claw.system.telemetry.widgets.request.v1",
    "claw.system.telemetry.widgets.v1",
    "system.telemetry.providers",
    "claw.system.telemetry.providers.request.v1",
    "claw.system.telemetry.providers.v1",
    "system.telemetry.control.plan",
    "claw.system.telemetry.controlPlan.request.v1",
    "claw.system.telemetry.controlPlan.v1",
    "payload.riskMap.approvalRequired.includes(\"system.telemetry.snapshot\"), false",
    "claw system history <metric-key> --range 1h|24h --json",
    "claw system controls plan <control-id> --json",
  ]) {
    assert(inspectTests.includes(snippet), `inspect-cli.test.ts: missing system telemetry SDK inspect coverage ${JSON.stringify(snippet)}`);
  }

  const inspection = parseCliPayload(claw(["inspect", "custom-app-sdk", "--json"]), "inspect custom-app-sdk");
  assert(inspection.missingSchemaRefs?.length === 0, "inspect custom-app-sdk: missing schema refs must be empty");
  assert(inspection.schemaRefs?.includes("claw.system.telemetry.snapshot.v1"), "inspect custom-app-sdk: missing snapshot schema");
  assert(inspection.schemaRefs?.includes("claw.system.telemetry.history.v1"), "inspect custom-app-sdk: missing history schema");
  assert(inspection.schemaRefs?.includes("claw.system.telemetry.metrics.v1"), "inspect custom-app-sdk: missing metrics schema");
  assert(inspection.schemaRefs?.includes("claw.system.telemetry.widgets.v1"), "inspect custom-app-sdk: missing widgets schema");
  assert(inspection.schemaRefs?.includes("claw.system.telemetry.providers.v1"), "inspect custom-app-sdk: missing providers schema");
  assert(inspection.schemaRefs?.includes("claw.system.telemetry.controlPlan.v1"), "inspect custom-app-sdk: missing control plan schema");
  assert(inspection.riskMap?.ordinaryAccess?.includes("system.telemetry.snapshot"), "inspect custom-app-sdk: snapshot must be ordinary read access");
  assert(inspection.riskMap?.ordinaryAccess?.includes("system.telemetry.history"), "inspect custom-app-sdk: history must be ordinary read access");
  assert(inspection.riskMap?.ordinaryAccess?.includes("system.telemetry.metrics"), "inspect custom-app-sdk: metrics must be ordinary read access");
  assert(inspection.riskMap?.ordinaryAccess?.includes("system.telemetry.widgets"), "inspect custom-app-sdk: widgets must be ordinary read access");
  assert(inspection.riskMap?.ordinaryAccess?.includes("system.telemetry.providers"), "inspect custom-app-sdk: providers must be ordinary read access");
  assert(!inspection.riskMap?.approvalRequired?.includes("system.telemetry.snapshot"), "inspect custom-app-sdk: snapshot must not be approval-required");
  assert(!inspection.riskMap?.approvalRequired?.includes("system.telemetry.history"), "inspect custom-app-sdk: history must not be approval-required");
  assert(inspection.riskMap?.approvalRequired?.includes("system.telemetry.control.plan"), "inspect custom-app-sdk: control plan must be approval-required");
  const snapshot = inspection.capabilities?.find((capability) => capability.id === "system.telemetry.snapshot");
  const history = inspection.capabilities?.find((capability) => capability.id === "system.telemetry.history");
  const metrics = inspection.capabilities?.find((capability) => capability.id === "system.telemetry.metrics");
  const widgets = inspection.capabilities?.find((capability) => capability.id === "system.telemetry.widgets");
  const providers = inspection.capabilities?.find((capability) => capability.id === "system.telemetry.providers");
  const controlPlan = inspection.capabilities?.find((capability) => capability.id === "system.telemetry.control.plan");
  assert(snapshot?.inputSchemaRef === "claw.system.telemetry.snapshot.request.v1", "inspect custom-app-sdk: snapshot input schema mismatch");
  assert(snapshot?.outputSchemaRef === "claw.system.telemetry.snapshot.v1", "inspect custom-app-sdk: snapshot output schema mismatch");
  assert(snapshot?.redactionPolicyRef === "claw.customApps.redaction.v1", "inspect custom-app-sdk: snapshot redaction policy missing");
  assert(history?.inputSchemaRef === "claw.system.telemetry.history.request.v1", "inspect custom-app-sdk: history input schema mismatch");
  assert(history?.outputSchemaRef === "claw.system.telemetry.history.v1", "inspect custom-app-sdk: history output schema mismatch");
  assert(history?.redactionPolicyRef === "claw.customApps.redaction.v1", "inspect custom-app-sdk: history redaction policy missing");
  assert(metrics?.inputSchemaRef === "claw.system.telemetry.metrics.request.v1", "inspect custom-app-sdk: metrics input schema mismatch");
  assert(metrics?.outputSchemaRef === "claw.system.telemetry.metrics.v1", "inspect custom-app-sdk: metrics output schema mismatch");
  assert(widgets?.inputSchemaRef === "claw.system.telemetry.widgets.request.v1", "inspect custom-app-sdk: widgets input schema mismatch");
  assert(widgets?.outputSchemaRef === "claw.system.telemetry.widgets.v1", "inspect custom-app-sdk: widgets output schema mismatch");
  assert(providers?.inputSchemaRef === "claw.system.telemetry.providers.request.v1", "inspect custom-app-sdk: providers input schema mismatch");
  assert(providers?.outputSchemaRef === "claw.system.telemetry.providers.v1", "inspect custom-app-sdk: providers output schema mismatch");
  assert(controlPlan?.inputSchemaRef === "claw.system.telemetry.controlPlan.request.v1", "inspect custom-app-sdk: control plan input schema mismatch");
  assert(controlPlan?.outputSchemaRef === "claw.system.telemetry.controlPlan.v1", "inspect custom-app-sdk: control plan output schema mismatch");
  assert(controlPlan?.dispatch?.mode === "approvalRequiredPlanOnly", "inspect custom-app-sdk: control plan must be plan-only");
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
  assert(weatherPlan.audit?.storageRef === "claw.workspace.data/system-telemetry-audit.jsonl", "weather provider plan: audit must expose only portable storage ref");
  assert(weatherPlan.audit?.auditPath === undefined, "weather provider plan: audit must not expose local filesystem path");
  assert(!JSON.stringify(weatherPlan).includes("/Users/"), "weather provider plan: must not expose private filesystem paths");

  const weatherCredentialPlan = parseCliPayload(claw(["system", "providers", "plan", "context.weather.live", "--credential-ref", "secret://weather/local", "--reason", "goal-credential-verify", "--json"]), "weather provider credential plan");
  assert(weatherCredentialPlan.request?.credentialRef === "provided_redacted", "weather provider credential plan: credential ref must be projected as redacted");
  assert(weatherCredentialPlan.steps?.some((step) => step.id === "resolve_credential_ref" && step.status === "pending"), "weather provider credential plan: credential step must stay pending, not connect");
  assert(!JSON.stringify(weatherCredentialPlan).includes("secret://weather/local"), "weather provider credential plan: must not expose credential ref");
  assert(weatherCredentialPlan.audit?.auditPath === undefined, "weather provider credential plan: audit must not expose local filesystem path");

  const sensorPlan = parseCliPayload(claw(["system", "providers", "plan", "system.sensors.signed", "--reason", "goal-verify", "--json"]), "sensor provider plan");
  assert(sensorPlan.willConnect === false, "sensor provider plan: must not connect");
  assert(sensorPlan.externalPending === true, "sensor provider plan: must be external pending");
  assert(sensorPlan.provider?.metrics?.includes("system.sensor.temperature"), "sensor provider plan: missing temperature metric");
  assert(sensorPlan.provider?.metrics?.includes("system.sensor.fan_speed"), "sensor provider plan: missing fan speed metric");
  assertIncludes(sensorPlan.policy?.requiredGrants, "system.sensor.read", "sensor provider plan grants");
  assert(sensorPlan.auditPlan?.event === "system.telemetry.provider.hardware_sensor.live", "sensor provider plan: must expose portable audit plan event");
  assert(sensorPlan.receipt?.status === "not_issued", "sensor provider plan: must not issue receipt");
  assert(sensorPlan.audit?.storageRef === "claw.workspace.data/system-telemetry-audit.jsonl", "sensor provider plan: audit must expose only portable storage ref");
  assert(sensorPlan.audit?.auditPath === undefined, "sensor provider plan: audit must not expose local filesystem path");
  assert(!JSON.stringify(sensorPlan).includes("/Users/"), "sensor provider plan: must not expose private filesystem paths");

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
  assert(fanPlan.receipt?.status === "not_issued", "fan control plan: must not issue receipt");
  assert(fanPlan.audit?.storageRef === "claw.workspace.data/system-telemetry-audit.jsonl", "fan control plan: audit must expose only portable storage ref");
  assert(fanPlan.audit?.auditPath === undefined, "fan control plan: audit must not expose local filesystem path");
  assert(!JSON.stringify(fanPlan).includes("/Users/"), "fan control plan: must not expose private filesystem paths");
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
    "\"storage_ref\": .string(\"claw.host.state/system-telemetry-provider-audit.jsonl\")",
    "\"credential_ref_redacted\"",
    "\"provider_id\"",
    "\"outcome\": \"blocked\"",
  ]) {
    assert(commandService.includes(snippet), `CommandService.swift: missing provider plan audit snippet ${JSON.stringify(snippet)}`);
  }
  assert(!commandService.includes("\"audit_path\": .string(auditURL.path)"), "CommandService.swift: provider plan audit must not expose local filesystem path");

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
    "\"storage_ref\": .string(\"claw.host.state/\\(MacControlPolicy.auditFilename)\")",
    "\"value_redacted\"",
    "\"outcome\": \"blocked\"",
    "System control is not executable by the signed host broker yet.",
  ]) {
    assert(bridge.includes(snippet), `SystemTelemetryControlHostBridge.swift: missing ${JSON.stringify(snippet)}`);
  }
  assert(!bridge.includes("\"audit_path\": .string(auditURL.path)"), "SystemTelemetryControlHostBridge.swift: control plan audit must not expose local filesystem path");

  const macBridge = read("apps/host/Sources/ClawHostKit/MacControlHostBridge.swift");
  for (const snippet of [
    "private static func auditResponse(",
    "\"storageRef\": .string(\"claw.host.state/\\(MacControlPolicy.auditFilename)\")",
    "capabilityId: \"mac.audit.read\"",
  ]) {
    assert(macBridge.includes(snippet), `MacControlHostBridge.swift: missing portable audit response snippet ${JSON.stringify(snippet)}`);
  }
  assert(!macBridge.includes("\"auditPath\": .string(auditURL.path)"), "MacControlHostBridge.swift: audit response must not expose local filesystem path");

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
    "storage_ref",
    "credential_ref_redacted",
    "context.weather.live",
    "execute_native_action",
    "audit_status",
    "value_redacted",
    "storage_ref",
    "runner.nativeCalls.isEmpty",
  ]) {
    assert(tests.includes(snippet), `CommanderE2ETests.swift: missing ${JSON.stringify(snippet)}`);
  }

  const macControlTests = read("apps/host/Tests/CommanderE2ETests/MacControlTests.swift");
  for (const snippet of [
    "testHostBridgeExposesPermissionsAndDurableAudit",
    "storageRef",
    "claw.host.state/\\(MacControlPolicy.auditFilename)",
    "auditPath",
  ]) {
    assert(macControlTests.includes(snippet), `MacControlTests.swift: missing ${JSON.stringify(snippet)}`);
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
  assert(telemetryResults.some((result) => result.type === "doc" && result.path === "docs/cli.md" && String(result.summary ?? "").includes("System Telemetry")), "search system telemetry: missing CLI docs result");

  const systemCommand = parseCliPayload(claw(["search", "system", "--json"]), "search system");
  const systemCommandResults = systemCommand.results ?? [];
  assert(systemCommandResults.some((result) => result.type === "command" && result.name === "system"), "search system: missing system command result");

  for (const query of ["system telemetry metrics", "system telemetry widgets", "system telemetry control plan"]) {
    const commandSearch = parseCliPayload(claw(["search", query, "--json"]), `search ${query}`);
    const commandResults = commandSearch.results ?? commandSearch.items ?? [];
    assert(commandResults.some((result) => result.canonicalName === "system"), `search ${query}: missing system command discoverability`);
  }

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
  assert(decisionMatrixResults.some((result) => result.path === "docs/governance/system-telemetry/decision-matrix.md"), "search system telemetry decision matrix: missing decision matrix doc");

  const externalLedger = parseCliPayload(claw(["search", "system telemetry external pending validation", "--json"]), "search system telemetry external pending validation");
  const externalLedgerResults = externalLedger.results ?? [];
  assert(externalLedgerResults.some((result) => result.path === "docs/governance/system-telemetry/external-pending.md"), "search system telemetry external pending validation: missing external-pending ledger doc");

  const route = parseCliPayload(claw(["inspect", "route", "system.telemetryAgentContext", "--json"]), "inspect credential redaction route");
  assert(route.edges?.some((edge) => edge.id === "claw.edge.system.telemetry.consumes.contextProviders" && String(edge.transport ?? "").includes("provided_redacted credential projection")), "inspect route: provider edge must expose credential redaction projection");
}

function main() {
  assert(fs.existsSync(clawSourceRunner), "scripts/claw-source-runner.mjs is missing");
  assertNoForbiddenPublicNames();
  assertExternalPendingLedger();
  assertExternalValidationManifest();
  assertExternalValidationManifestSchema();
  assertExternalValidationManifestFixtures();
  assertExternalValidationRunbook();
  assertExternalApprovalSchema();
  assertExternalApprovalFixtures();
  assertExternalApprovalValidator();
  assertExternalEvidenceSchema();
  assertExternalEvidenceFixtures();
  assertExternalEvidenceValidator();
  assertExternalClosureFixtures();
  assertExternalClosureValidator();
  assertSourceQaReview();
  assertCompletionAudit();
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
